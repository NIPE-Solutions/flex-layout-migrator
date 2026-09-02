import { constants } from 'node:fs';
import { access, lstat, mkdir, mkdtemp, open, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
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
  lstat,
  mkdir,
  open: (target, flags) => open(target, flags),
  readFile: target => readFile(target, 'utf8'),
  rename: (source, destination) => import('node:fs/promises').then(fs => fs.rename(source, destination)),
  unlink: target => import('node:fs/promises').then(fs => fs.unlink(target)),
};

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
        if (target.endsWith('.tmp') && ++temporaryOpens === 2) throw openError;
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
        await import('node:fs/promises').then(fs => fs.rename(source, destination));
      },
    };

    await new MigrationTransaction(operations).apply(
      plan([template(target, present('before'), present('<div>after</div>'))]),
    );

    const temporaryName = events.find(event => event.startsWith('open:') && event.includes('.tmp:wx'))?.split(':')[1];
    expect(temporaryName).toBeDefined();
    expect(events.filter(event => event.startsWith('open:')).every(event => event.endsWith(':wx'))).toBe(true);
    expect(events).toEqual(
      expect.arrayContaining([
        `write:${temporaryName}`,
        `sync:${temporaryName}`,
        `close:${temporaryName}`,
        `rename:${temporaryName}:${basename(target)}`,
      ]),
    );
    expect(events.indexOf(`write:${temporaryName}`)).toBeLessThan(events.indexOf(`sync:${temporaryName}`));
    expect(events.indexOf(`sync:${temporaryName}`)).toBeLessThan(events.indexOf(`close:${temporaryName}`));
    expect(events.indexOf(`close:${temporaryName}`)).toBeLessThan(
      events.indexOf(`rename:${temporaryName}:${basename(target)}`),
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
      rename: async (source, destination) => {
        if (source.endsWith('.tmp')) installed.push(destination);
        await import('node:fs/promises').then(fs => fs.rename(source, destination));
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

  test.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])(
    'restores exact originals when counted filesystem operation %i fails before finalization',
    async failurePoint => {
      const fixture = await transactionFixture(directory);
      const failure = new Error(`filesystem failure ${failurePoint}`);
      const operations = countingFailureOperations(failurePoint, failure);

      await expect(new MigrationTransaction(operations).apply(fixture.plan)).rejects.toMatchObject({
        code: 'transaction-io',
        cause: failure,
      });

      expect(await snapshot(fixture.paths)).toEqual(fixture.originalSnapshot);
      expect(await invocationResidue(directory)).toEqual([]);
    },
  );

  test.each([
    [12, 0],
    [13, 2],
  ] as const)(
    'reports counted finalization unlink failure %i without rolling back committed outputs',
    async (failurePoint, unconfirmedPathIndex) => {
      const fixture = await transactionFixture(directory);
      const failure = new Error(`filesystem failure ${failurePoint}`);
      const operations = countingFailureOperations(failurePoint, failure);

      await expect(new MigrationTransaction(operations).apply(fixture.plan)).rejects.toMatchObject({
        code: 'transaction-io',
        paths: [fixture.paths[unconfirmedPathIndex]],
        cause: failure,
      });

      expect(await snapshot(fixture.paths)).toEqual(fixture.appliedSnapshot);
    },
  );

  test('retains the initiating cause and newly-created public path when rollback unlink fails', async () => {
    const fixture = await transactionFixture(directory);
    const createPath = fixture.paths[1];
    const initiatingError = new Error('removal backup failed');
    const rollbackError = new Error('created destination cleanup failed');
    let backupRenames = 0;
    const operations: MigrationTransactionOperations = {
      ...nodeOperations,
      rename: async (source, destination) => {
        if (destination.endsWith('.bak') && ++backupRenames === 2) throw initiatingError;
        await import('node:fs/promises').then(fs => fs.rename(source, destination));
      },
      unlink: async candidate => {
        if (candidate === createPath) throw rollbackError;
        await import('node:fs/promises').then(fs => fs.unlink(candidate));
      },
    };

    const caught = await captureError(new MigrationTransaction(operations).apply(fixture.plan));

    expect(caught).toMatchObject({ code: 'transaction-io', paths: [createPath], cause: initiatingError });
    expect(await readFile(createPath, 'utf8')).toBe('<div>create after</div>');
    expect(await readFile(fixture.paths[0], 'utf8')).toBe('replace before');
    expect(await readFile(fixture.paths[2], 'utf8')).toBe('remove before');
    expect(await invocationResidue(directory)).toEqual([]);
  });

  test('retains the initiating cause and public recovery path when restoration cannot be confirmed', async () => {
    const target = join(directory, 'card.html');
    await writeFile(target, 'before', 'utf8');
    const initiatingError = new Error('replacement failed');
    const rollbackError = new Error('restore failed');
    let installFailed = false;
    const operations: MigrationTransactionOperations = {
      ...nodeOperations,
      rename: async (source, destination) => {
        if (source.endsWith('.tmp') && !installFailed) {
          installFailed = true;
          throw initiatingError;
        }
        if (source.endsWith('.bak') && destination === target) throw rollbackError;
        await import('node:fs/promises').then(fs => fs.rename(source, destination));
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
        if (candidate.endsWith('.bak')) throw cleanupError;
        await import('node:fs/promises').then(fs => fs.unlink(candidate));
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
      rename: async (source, destination) => {
        await import('node:fs/promises').then(fs => fs.rename(source, destination));
        if (source.endsWith('.tmp') && ++installed === 1) registrar.interrupt('SIGINT');
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
        if (!candidate.endsWith('.tmp')) return handle;
        return {
          writeFile: async (contents, encoding) => {
            await handle.writeFile(contents, encoding);
            registrar.interrupt('SIGTERM');
          },
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
    lstat: unexpected,
    mkdir: unexpected,
    open: unexpected,
    readFile: unexpected,
    rename: unexpected,
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
  return entries.filter(entry => entry.endsWith('.tmp') || entry.endsWith('.bak')).sort();
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
      const current = source.endsWith('.tmp') ? 'install' : destination.endsWith('.bak') ? 'backup' : 'rollback';
      if (current === operation && ++seen === occurrence) throw failure;
      await import('node:fs/promises').then(fs => fs.rename(source, destination));
    },
  };
}

function countingFailureOperations(failurePoint: number, failure: Error): MigrationTransactionOperations {
  let operationsSeen = 0;
  let failed = false;
  const fail = (): void => {
    operationsSeen++;
    if (!failed && operationsSeen === failurePoint) {
      failed = true;
      throw failure;
    }
  };
  return {
    ...nodeOperations,
    mkdir: async (target, options) => {
      fail();
      await mkdir(target, options);
    },
    open: async (target, flags) => {
      fail();
      const handle = await open(target, flags);
      return {
        writeFile: (contents, encoding) => handle.writeFile(contents, encoding),
        sync: async () => {
          fail();
          await handle.sync();
        },
        close: () => handle.close(),
      };
    },
    rename: async (source, destination) => {
      fail();
      await import('node:fs/promises').then(fs => fs.rename(source, destination));
    },
    unlink: async target => {
      fail();
      await import('node:fs/promises').then(fs => fs.unlink(target));
    },
  };
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
