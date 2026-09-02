import { constants } from 'node:fs';
import {
  access,
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  rmdir,
  stat,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileMigrationResult } from '../migrator/file-migration-result';
import { migrationPlan, plannedOutputArtifact, type MigrationPlan } from '../migrator/migration-plan';
import {
  MigrationTransaction,
  type MigrationTransactionFileHandle,
  type MigrationTransactionOperations,
} from './migration-transaction';
import type { TransactionInterruptionHandler, TransactionSignalRegistrarLike } from './transaction-signal.registrar';

const nodeOperations: MigrationTransactionOperations = {
  access,
  link,
  lstat,
  mkdir,
  open: (target, flags) => open(target, flags),
  rename,
  rmdir,
  stat,
  unlink,
};

const preFinalizationFailurePoints = [
  [1, 'replace namespace mkdir', []],
  [2, 'create namespace mkdir', []],
  [3, 'remove namespace mkdir', []],
  [4, 'replace stage open', []],
  [5, 'replace stage writeFile', []],
  [6, 'replace stage sync', []],
  [7, 'replace stage close', []],
  [8, 'create stage open', []],
  [9, 'create stage writeFile', []],
  [10, 'create stage sync', []],
  [11, 'create stage close', []],
  [12, 'replace backup open', []],
  [13, 'replace backup writeFile', []],
  [14, 'replace backup sync', []],
  [15, 'replace backup close', []],
  [16, 'replace original quarantine', []],
  [17, 'replace install', ['restore:a-replace.html']],
  [18, 'create install', ['remove:a-replace.html', 'restore:a-replace.html']],
  [19, 'remove backup open', ['remove:b-create.html', 'remove:a-replace.html', 'restore:a-replace.html']],
  [20, 'remove backup writeFile', ['remove:b-create.html', 'remove:a-replace.html', 'restore:a-replace.html']],
  [21, 'remove backup sync', ['remove:b-create.html', 'remove:a-replace.html', 'restore:a-replace.html']],
  [22, 'remove backup close', ['remove:b-create.html', 'remove:a-replace.html', 'restore:a-replace.html']],
  [23, 'remove original quarantine', ['remove:b-create.html', 'remove:a-replace.html', 'restore:a-replace.html']],
] as const;

const finalizationFailurePoints = [
  [24, 'replace stage unlink', 0, ['.a-replace.html.txn', '.a-replace.html.txn/stage']],
  [25, 'replace backup unlink', 0, ['.a-replace.html.txn', '.a-replace.html.txn/backup']],
  [26, 'replace quarantine unlink', 0, ['.a-replace.html.txn', '.a-replace.html.txn/quarantine']],
  [27, 'replace namespace rmdir', 0, ['.a-replace.html.txn']],
  [28, 'create stage unlink', 1, ['.b-create.html.txn', '.b-create.html.txn/stage']],
  [29, 'create namespace rmdir', 1, ['.b-create.html.txn']],
  [30, 'remove backup unlink', 2, ['.c-remove.css.txn', '.c-remove.css.txn/backup']],
  [31, 'remove quarantine unlink', 2, ['.c-remove.css.txn', '.c-remove.css.txn/quarantine']],
  [32, 'remove namespace rmdir', 2, ['.c-remove.css.txn']],
] as const;

const expectedOperationTrace = [...preFinalizationFailurePoints, ...finalizationFailurePoints].map(([, name]) => name);

describe('MigrationTransaction', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'migration-transaction-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  test('does no filesystem work for a plan without artifacts', async () => {
    const operations = throwingOperations();
    const transaction = new MigrationTransaction(operations);

    await expect(transaction.preflight(plan())).resolves.toBeUndefined();
    await expect(transaction.apply(plan())).resolves.toBeUndefined();
  });

  test('defensively rejects a plan containing a template parse error', async () => {
    const invalidPlan = migrationPlan({
      target: 'tailwind',
      artifacts: [],
      files: [
        fileMigrationResult({
          inputPath: join(directory, 'broken.html'),
          outputPath: join(directory, 'output.html'),
          changed: false,
          results: [
            {
              status: 'parse-error',
              fileName: join(directory, 'broken.html'),
              code: 'template-parse-error',
              reason: 'Unexpected closing tag',
              source: { start: 0, end: 1 },
            },
          ],
        }),
      ],
    });

    await expect(new MigrationTransaction(throwingOperations()).preflight(invalidPlan)).rejects.toMatchObject({
      code: 'internal-invariant',
      paths: [join(directory, 'broken.html')],
    });
  });

  test('rejects destination bytes changed after planning without creating residue', async () => {
    const target = join(directory, 'card.html');
    await writeFile(target, 'changed after planning', 'utf8');

    await expect(
      new MigrationTransaction().preflight(plan([template(target, present('planned bytes'), present('<div></div>'))])),
    ).rejects.toMatchObject({ code: 'concurrent-modification', paths: [target] });

    expect(await readFile(target, 'utf8')).toBe('changed after planning');
    expect(await invocationResidue(directory)).toEqual([]);
  });

  test('rejects a missing destination that appeared after planning', async () => {
    const target = join(directory, 'card.html');
    await writeFile(target, 'appeared', 'utf8');

    await expect(
      new MigrationTransaction().preflight(plan([template(target, absent(), present('<div></div>'))])),
    ).rejects.toMatchObject({ code: 'concurrent-modification', paths: [target] });

    expect(await readFile(target, 'utf8')).toBe('appeared');
    expect(await invocationResidue(directory)).toEqual([]);
  });

  test('rejects a present destination that disappeared after planning', async () => {
    const target = join(directory, 'card.html');

    await expect(
      new MigrationTransaction().preflight(plan([template(target, present('before'), present('<div></div>'))])),
    ).rejects.toMatchObject({ code: 'concurrent-modification', paths: [target] });

    await expect(access(target)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await invocationResidue(directory)).toEqual([]);
  });

  test('rejects duplicate artifact destinations before filesystem access', async () => {
    const target = join(directory, 'card.html');

    await expect(
      new MigrationTransaction(throwingOperations()).preflight(
        plan([
          template(target, absent(), present('<div>first</div>')),
          template(target, absent(), present('<div>second</div>')),
        ]),
      ),
    ).rejects.toMatchObject({ code: 'path-collision', paths: [target] });
  });

  test('rejects directory and symbolic-link destinations during defensive preflight', async () => {
    const directoryTarget = join(directory, 'output');
    const symbolicLinkTarget = join(directory, 'link.html');
    await mkdir(directoryTarget);
    await symlink(join(directory, 'missing.html'), symbolicLinkTarget);

    await expect(
      new MigrationTransaction().preflight(
        plan([template(directoryTarget, absent(), present('<div>directory</div>'))]),
      ),
    ).rejects.toMatchObject({ code: 'unsupported-path-type', paths: [directoryTarget] });
    await expect(
      new MigrationTransaction().preflight(plan([template(symbolicLinkTarget, absent(), present('<div>link</div>'))])),
    ).rejects.toMatchObject({ code: 'unsupported-path-type', paths: [symbolicLinkTarget] });

    expect(await invocationResidue(directory)).toEqual([]);
  });

  test('rejects an inaccessible destination parent before staging', async () => {
    const target = join(directory, 'locked', 'card.html');
    const accessError = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    const operations: MigrationTransactionOperations = {
      ...nodeOperations,
      access: async (candidate, mode) => {
        expect(candidate).toBe(directory);
        expect(mode).toBe(constants.W_OK | constants.X_OK);
        throw accessError;
      },
    };

    await expect(
      new MigrationTransaction(operations).preflight(plan([template(target, absent(), present('<div></div>'))])),
    ).rejects.toMatchObject({ code: 'transaction-io', paths: [target], cause: accessError });

    await expect(access(dirname(target))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await invocationResidue(directory)).toEqual([]);
  });

  test('stages every proposed-present artifact before mutating a destination', async () => {
    const first = join(directory, 'a.html');
    const second = join(directory, 'b.html');
    await writeFile(first, 'first before', 'utf8');
    await writeFile(second, 'second before', 'utf8');
    let temporaryOpens = 0;
    const openError = new Error('second stage failed');
    const operations: MigrationTransactionOperations = {
      ...nodeOperations,
      open: async (target, flags) => {
        if (flags === 'wx' && basename(target) === 'stage' && ++temporaryOpens === 2) throw openError;
        return open(target, flags);
      },
    };

    await expect(
      new MigrationTransaction(operations).apply(
        plan([
          template(first, present('first before'), present('<div>first after</div>')),
          template(second, present('second before'), present('<div>second after</div>')),
        ]),
      ),
    ).rejects.toMatchObject({ code: 'transaction-io', cause: openError });

    expect(await readFile(first, 'utf8')).toBe('first before');
    expect(await readFile(second, 'utf8')).toBe('second before');
    expect(await invocationResidue(directory)).toEqual([]);
  });

  test('creates invocation files exclusively and flushes and closes staged bytes before commit', async () => {
    const target = join(directory, 'card.html');
    await writeFile(target, 'before', 'utf8');
    const events: string[] = [];
    const operations: MigrationTransactionOperations = {
      ...nodeOperations,
      open: async (candidate, flags) => {
        events.push(`open:${basename(candidate)}:${flags}`);
        const handle = await open(candidate, flags);
        return recordingHandle(handle, candidate, events);
      },
      rename: async (source, destination) => {
        events.push(`rename:${basename(source)}:${basename(destination)}`);
        await rename(source, destination);
      },
      link: async (source, destination) => {
        events.push(`link:${basename(source)}:${basename(destination)}`);
        await link(source, destination);
      },
    };

    await new MigrationTransaction(operations).apply(
      plan([template(target, present('before'), present('<div>after</div>'))]),
    );

    const temporaryName = 'stage';
    expect(events.filter(event => event.endsWith(':stage:wx'))).toHaveLength(1);
    expect(events).toEqual(
      expect.arrayContaining([
        `write:${temporaryName}`,
        `sync:${temporaryName}`,
        `close:${temporaryName}`,
        `link:${temporaryName}:${basename(target)}`,
      ]),
    );
    expect(events.indexOf(`write:${temporaryName}`)).toBeLessThan(events.indexOf(`sync:${temporaryName}`));
    expect(events.indexOf(`sync:${temporaryName}`)).toBeLessThan(events.indexOf(`close:${temporaryName}`));
    expect(events.indexOf(`close:${temporaryName}`)).toBeLessThan(
      events.indexOf(`link:${temporaryName}:${basename(target)}`),
    );
    expect(await readFile(target, 'utf8')).toBe('<div>after</div>');
    expect(await invocationResidue(directory)).toEqual([]);
  });

  test('reparses staged Angular templates and cleans up invalid proposals before mutation', async () => {
    const target = join(directory, 'card.html');
    await writeFile(target, 'before', 'utf8');

    await expect(
      new MigrationTransaction().apply(plan([template(target, present('before'), present('<span fxLayout="row" />'))])),
    ).rejects.toMatchObject({ code: 'internal-invariant', paths: [target] });

    expect(await readFile(target, 'utf8')).toBe('before');
    expect(await invocationResidue(directory)).toEqual([]);
  });

  test('creates, replaces, and removes outputs as one transaction', async () => {
    const created = join(directory, 'created.html');
    const replaced = join(directory, 'replaced.html');
    const removed = join(directory, 'removed.css');
    await writeFile(replaced, 'old template', 'utf8');
    await writeFile(removed, 'old stylesheet', 'utf8');

    await new MigrationTransaction().apply(
      plan([
        template(created, absent(), present('<div>created</div>')),
        template(replaced, present('old template'), present('<div>replaced</div>')),
        stylesheet(removed, present('old stylesheet'), absent()),
      ]),
    );

    expect(await readFile(created, 'utf8')).toBe('<div>created</div>');
    expect(await readFile(replaced, 'utf8')).toBe('<div>replaced</div>');
    await expect(access(removed)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await invocationResidue(directory)).toEqual([]);
  });

  test('commits artifacts in normalized code-unit path order', async () => {
    const targets = [join(directory, 'ä.html'), join(directory, 'a.html'), join(directory, 'Z.html')];
    const installed: string[] = [];
    const operations: MigrationTransactionOperations = {
      ...nodeOperations,
      link: async (source, destination) => {
        if (basename(source) === 'stage') installed.push(destination);
        await link(source, destination);
      },
    };

    await new MigrationTransaction(operations).apply(
      plan(targets.map(target => template(target, absent(), present(`<div>${basename(target)}</div>`)))),
    );

    expect(installed).toEqual([join(directory, 'Z.html'), join(directory, 'a.html'), join(directory, 'ä.html')]);
  });

  test.each([
    ['first backup', 'backup', 1],
    ['first replacement', 'install', 1],
    ['new destination', 'install', 2],
    ['proposed removal', 'backup', 2],
  ] as const)(
    'restores exact originals with no residue when %s commit fails',
    async (_label, operation, occurrence) => {
      const fixture = await transactionFixture(directory);
      const failure = new Error(`failed ${operation} ${occurrence}`);
      const operations = operationsFailingRename(operation, occurrence, failure);

      await expect(new MigrationTransaction(operations).apply(fixture.plan)).rejects.toMatchObject({
        code: 'transaction-io',
        cause: failure,
      });

      expect(await snapshot(fixture.paths)).toEqual(fixture.originalSnapshot);
      expect(await invocationResidue(directory)).toEqual([]);
    },
  );

  test.each(preFinalizationFailurePoints)(
    'recovers named filesystem operation %i (%s) and permits a byte-identical retry',
    async (failurePoint, label, expectedRecoveryOrder) => {
      const fixture = await transactionFixture(directory);
      const failure = new Error(`filesystem failure ${failurePoint}: ${label}`);
      const recoveryOrder: string[] = [];
      const harness = namedFailureOperations(label, failure, recoveryOrder);
      const registrar = new FakeSignalRegistrar();

      const caught = await captureError(new MigrationTransaction(harness.operations, registrar).apply(fixture.plan));

      expect(caught).toMatchObject({
        code: 'transaction-io',
        paths: [],
        recoveryFailures: [],
      });
      expect((caught as Error & { cause: unknown }).cause).toBe(failure);
      expect(harness.failureCount()).toBe(1);
      expect(harness.trace.at(-1)).toBe(label);
      expect(harness.trace.filter(operation => operation === label)).toHaveLength(1);

      expect(await snapshot(fixture.paths)).toEqual(fixture.originalSnapshot);
      expect(recoveryOrder).toEqual(expectedRecoveryOrder);
      expect(await invocationResidue(directory)).toEqual([]);
      expect(registrar.activeRegistrations).toBe(0);

      await new MigrationTransaction().apply(fixture.plan);

      expect(await snapshot(fixture.paths)).toEqual(fixture.appliedSnapshot);
      expect(await invocationResidue(directory)).toEqual([]);
    },
  );

  test.each(finalizationFailurePoints)(
    'reports named filesystem operation %i (%s) after commit at its public path',
    async (failurePoint, label, affectedPathIndex, expectedResidue) => {
      const fixture = await transactionFixture(directory);
      const failure = new Error(`filesystem failure ${failurePoint}: ${label}`);
      const registrar = new FakeSignalRegistrar();
      const harness = namedFailureOperations(label, failure);

      const caught = await captureError(new MigrationTransaction(harness.operations, registrar).apply(fixture.plan));

      expect(caught).toMatchObject({
        code: 'transaction-io',
        paths: [fixture.paths[affectedPathIndex]],
      });
      expect((caught as Error & { cause: unknown }).cause).toBe(failure);
      expect(harness.failureCount()).toBe(1);
      expect(harness.trace.at(-1)).toBe(label);
      expect(harness.trace.filter(operation => operation === label)).toHaveLength(1);

      expect(await snapshot(fixture.paths)).toEqual(fixture.appliedSnapshot);
      expect(await invocationResidue(directory)).toEqual(expectedResidue);
      expect(registrar.activeRegistrations).toBe(0);
    },
  );

  test('binds every failure-matrix row to the exact successful operation trace', async () => {
    const fixture = await transactionFixture(directory);
    const harness = namedFailureOperations();

    await new MigrationTransaction(harness.operations).apply(fixture.plan);

    expect(harness.trace).toEqual(expectedOperationTrace);
    expect(harness.failureCount()).toBe(0);
    expect(await invocationResidue(directory)).toEqual([]);
  });

  test('retains the initiating cause and newly-created public path when rollback quarantine fails', async () => {
    const fixture = await transactionFixture(directory);
    const createPath = fixture.paths[1];
    const initiatingError = new Error('removal backup failed');
    const rollbackError = new Error('created destination cleanup failed');
    let backupOpens = 0;
    const registrar = new FakeSignalRegistrar();
    const operations: MigrationTransactionOperations = {
      ...nodeOperations,
      open: async (candidate, flags) => {
        if (flags === 'wx' && basename(candidate) === 'backup' && ++backupOpens === 2) throw initiatingError;
        return open(candidate, flags);
      },
      rename: async (source, destination) => {
        if (source === createPath) throw rollbackError;
        await rename(source, destination);
      },
    };

    const caught = await captureError(new MigrationTransaction(operations, registrar).apply(fixture.plan));

    expect(caught).toMatchObject({ code: 'transaction-io', paths: [createPath], cause: initiatingError });
    expect(await readFile(createPath, 'utf8')).toBe('<div>create after</div>');
    expect(await readFile(fixture.paths[0], 'utf8')).toBe('replace before');
    expect(await readFile(fixture.paths[2], 'utf8')).toBe('remove before');
    expect(await invocationResidue(directory)).toEqual([]);
    expect(registrar.activeRegistrations).toBe(0);
  });

  test('retains the initiating cause and public recovery path when restoration cannot be confirmed', async () => {
    const target = join(directory, 'card.html');
    await writeFile(target, 'before', 'utf8');
    const initiatingError = new Error('replacement failed');
    const rollbackError = new Error('restore failed');
    let installFailed = false;
    const operations: MigrationTransactionOperations = {
      ...nodeOperations,
      link: async (source, destination) => {
        if (basename(source) === 'stage' && !installFailed) {
          installFailed = true;
          throw initiatingError;
        }
        if (basename(source) === 'backup' && destination === target) throw rollbackError;
        await link(source, destination);
      },
    };

    const caught = await captureError(
      new MigrationTransaction(operations).apply(
        plan([template(target, present('before'), present('<div>after</div>'))]),
      ),
    );

    expect(caught).toMatchObject({ code: 'transaction-io', paths: [target], cause: initiatingError });
    expect(String(caught)).not.toMatch(/\.tmp|\.bak/);
    expect((caught as Error).message).not.toMatch(/\.tmp|\.bak/);
  });

  test('reports final cleanup failure without claiming committed bytes were rolled back', async () => {
    const target = join(directory, 'card.html');
    await writeFile(target, 'before', 'utf8');
    const cleanupError = new Error('backup cleanup failed');
    const operations: MigrationTransactionOperations = {
      ...nodeOperations,
      unlink: async candidate => {
        if (basename(candidate) === 'backup') throw cleanupError;
        await unlink(candidate);
      },
    };

    await expect(
      new MigrationTransaction(operations).apply(
        plan([template(target, present('before'), present('<div>after</div>'))]),
      ),
    ).rejects.toMatchObject({ code: 'transaction-io', paths: [target], cause: cleanupError });

    expect(await readFile(target, 'utf8')).toBe('<div>after</div>');
  });

  test('rolls back an interruption between commit operations before surfacing it', async () => {
    const fixture = await transactionFixture(directory);
    const registrar = new FakeSignalRegistrar();
    let installed = 0;
    const operations: MigrationTransactionOperations = {
      ...nodeOperations,
      link: async (source, destination) => {
        await link(source, destination);
        if (basename(source) === 'stage' && ++installed === 1) registrar.interrupt('SIGINT');
      },
    };

    await expect(new MigrationTransaction(operations, registrar).apply(fixture.plan)).rejects.toMatchObject({
      code: 'transaction-interrupted',
      paths: [],
    });

    expect(await snapshot(fixture.paths)).toEqual(fixture.originalSnapshot);
    expect(await invocationResidue(directory)).toEqual([]);
    expect(registrar.activeRegistrations).toBe(0);
  });

  test('cleans staged files and unregisters signals when interrupted during staging', async () => {
    const target = join(directory, 'card.html');
    const registrar = new FakeSignalRegistrar();
    const operations: MigrationTransactionOperations = {
      ...nodeOperations,
      open: async (candidate, flags) => {
        const handle = await open(candidate, flags);
        if (basename(candidate) !== 'stage') return handle;
        return {
          writeFile: async (contents, encoding) => {
            await handle.writeFile(contents, encoding);
            registrar.interrupt('SIGTERM');
          },
          readFile: options => handle.readFile(options),
          stat: () => handle.stat(),
          sync: () => handle.sync(),
          close: () => handle.close(),
        };
      },
    };

    await expect(
      new MigrationTransaction(operations, registrar).apply(
        plan([template(target, absent(), present('<div>after</div>'))]),
      ),
    ).rejects.toMatchObject({ code: 'transaction-interrupted', paths: [] });

    await expect(access(target)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await invocationResidue(directory)).toEqual([]);
    expect(registrar.activeRegistrations).toBe(0);
  });
});

function plan(artifacts: MigrationPlan['artifacts'] = []): MigrationPlan {
  return migrationPlan({ target: 'tailwind', files: [], artifacts });
}

function template(
  path: string,
  original: { readonly status: 'absent' } | { readonly status: 'present'; readonly contents: string },
  proposed: { readonly status: 'present'; readonly contents: string },
) {
  return plannedOutputArtifact({ kind: 'template', path, original, proposed });
}

function stylesheet(
  path: string,
  original: { readonly status: 'absent' } | { readonly status: 'present'; readonly contents: string },
  proposed: { readonly status: 'absent' } | { readonly status: 'present'; readonly contents: string },
) {
  return plannedOutputArtifact({ kind: 'stylesheet', path, original, proposed });
}

function present(contents: string) {
  return { status: 'present' as const, contents };
}

function absent() {
  return { status: 'absent' as const };
}

function throwingOperations(): MigrationTransactionOperations {
  const unexpected = async (): Promise<never> => {
    throw new Error('unexpected filesystem operation');
  };
  return {
    access: unexpected,
    link: unexpected,
    lstat: unexpected,
    mkdir: unexpected,
    open: unexpected,
    rename: unexpected,
    rmdir: unexpected,
    stat: unexpected,
    unlink: unexpected,
  };
}

function recordingHandle(
  handle: MigrationTransactionFileHandle,
  path: string,
  events: string[],
): MigrationTransactionFileHandle {
  const name = basename(path);
  return {
    writeFile: async (contents, encoding) => {
      events.push(`write:${name}`);
      await handle.writeFile(contents, encoding);
    },
    readFile: options => handle.readFile(options),
    stat: () => handle.stat(),
    sync: async () => {
      events.push(`sync:${name}`);
      await handle.sync();
    },
    close: async () => {
      events.push(`close:${name}`);
      await handle.close();
    },
  };
}

async function invocationResidue(root: string): Promise<readonly string[]> {
  const entries = await readdir(root, { recursive: true });
  return entries
    .map(entry =>
      entry
        .replace(/^(\..+)\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.txn(?=\/|$)/u, '$1.txn')
        .replace(
          /quarantine(?:-rollback)?-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/u,
          'quarantine',
        ),
    )
    .filter(entry => entry.includes('.txn'))
    .sort();
}

async function transactionFixture(root: string) {
  const replace = join(root, 'a-replace.html');
  const create = join(root, 'b-create.html');
  const remove = join(root, 'c-remove.css');
  await writeFile(replace, 'replace before', 'utf8');
  await writeFile(remove, 'remove before', 'utf8');
  const paths = [replace, create, remove] as const;
  return {
    paths,
    originalSnapshot: await snapshot(paths),
    appliedSnapshot: {
      [replace]: '<div>replace after</div>',
      [create]: '<div>create after</div>',
      [remove]: undefined,
    },
    plan: plan([
      template(replace, present('replace before'), present('<div>replace after</div>')),
      template(create, absent(), present('<div>create after</div>')),
      stylesheet(remove, present('remove before'), absent()),
    ]),
  };
}

async function snapshot(paths: readonly string[]): Promise<Record<string, string | undefined>> {
  return Object.fromEntries(
    await Promise.all(
      paths.map(async target => {
        try {
          return [target, await readFile(target, 'utf8')] as const;
        } catch (error: unknown) {
          if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
            return [target, undefined] as const;
          }
          throw error;
        }
      }),
    ),
  );
}

function operationsFailingRename(
  operation: 'backup' | 'install',
  occurrence: number,
  failure: Error,
): MigrationTransactionOperations {
  let seen = 0;
  return {
    ...nodeOperations,
    rename: async (source, destination) => {
      if (operation === 'backup' && basename(destination).startsWith('quarantine-') && ++seen === occurrence) {
        throw failure;
      }
      await rename(source, destination);
    },
    link: async (source, destination) => {
      if (operation === 'install' && basename(source) === 'stage' && ++seen === occurrence) throw failure;
      await link(source, destination);
    },
  };
}

function namedFailureOperations(
  failureName?: string,
  failure: Error = new Error('unexpected named operation failure'),
  recoveryOrder: string[] = [],
): {
  readonly operations: MigrationTransactionOperations;
  readonly trace: string[];
  readonly failureCount: () => number;
} {
  const trace: string[] = [];
  let failed = false;
  let failures = 0;
  const attempt = (name: string): void => {
    if (failed) return;
    trace.push(name);
    if (name === failureName) {
      failed = true;
      failures++;
      throw failure;
    }
  };
  const ownerNames = new Map([
    ['a-replace.html', 'replace'],
    ['b-create.html', 'create'],
    ['c-remove.css', 'remove'],
  ]);
  const namespacePattern = /^\.(.+)\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.txn$/u;
  const owner = (target: string): string => {
    for (let current = target; dirname(current) !== current; current = dirname(current)) {
      const namespace = namespacePattern.exec(basename(current));
      if (namespace?.[1] !== undefined) return ownerNames.get(namespace[1]) ?? namespace[1];
    }
    return ownerNames.get(basename(target)) ?? basename(target);
  };
  const privateKind = (target: string): 'backup' | 'quarantine' | 'stage' | undefined => {
    const name = basename(target);
    if (name === 'backup' || name === 'stage') return name;
    return name.startsWith('quarantine-') ? 'quarantine' : undefined;
  };
  const operations: MigrationTransactionOperations = {
    ...nodeOperations,
    mkdir: async (target, options) => {
      if (namespacePattern.test(basename(target))) attempt(`${owner(target)} namespace mkdir`);
      await mkdir(target, options);
    },
    open: async (target, flags) => {
      const kind = privateKind(target);
      if (flags === 'wx' && kind !== undefined) attempt(`${owner(target)} ${kind} open`);
      const handle = await open(target, flags);
      return {
        writeFile: async (contents, encoding) => {
          if (flags === 'wx' && kind !== undefined) attempt(`${owner(target)} ${kind} writeFile`);
          await handle.writeFile(contents, encoding);
        },
        readFile: options => handle.readFile(options),
        stat: () => handle.stat(),
        sync: async () => {
          if (flags === 'wx' && kind !== undefined) attempt(`${owner(target)} ${kind} sync`);
          await handle.sync();
        },
        close: async () => {
          if (flags === 'wx' && kind !== undefined) attempt(`${owner(target)} ${kind} close`);
          await handle.close();
        },
      };
    },
    link: async (source, destination) => {
      if (failed && basename(source) === 'backup') {
        recoveryOrder.push(`restore:${basename(destination)}`);
      } else if (basename(source) === 'stage') {
        attempt(`${owner(source)} install`);
      }
      await link(source, destination);
    },
    rename: async (source, destination) => {
      if (failed && basename(destination).startsWith('quarantine-rollback-')) {
        recoveryOrder.push(`remove:${basename(source)}`);
      } else if (basename(destination).startsWith('quarantine-')) {
        attempt(`${owner(destination)} original quarantine`);
      }
      await rename(source, destination);
    },
    rmdir: async target => {
      if (namespacePattern.test(basename(target))) attempt(`${owner(target)} namespace rmdir`);
      await rmdir(target);
    },
    unlink: async target => {
      const kind = privateKind(target);
      if (kind !== undefined) attempt(`${owner(target)} ${kind} unlink`);
      await unlink(target);
    },
  };
  return { operations, trace, failureCount: () => failures };
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    throw new Error('Expected promise to reject');
  } catch (error: unknown) {
    return error;
  }
}

class FakeSignalRegistrar implements TransactionSignalRegistrarLike {
  private handler: TransactionInterruptionHandler | undefined;
  activeRegistrations = 0;

  register(handler: TransactionInterruptionHandler): () => void {
    this.handler = handler;
    this.activeRegistrations++;
    return () => {
      this.handler = undefined;
      this.activeRegistrations--;
    };
  }

  interrupt(signal: NodeJS.Signals): void {
    this.handler?.(signal);
  }
}
