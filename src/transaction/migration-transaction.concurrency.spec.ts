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
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { migrationPlan, plannedOutputArtifact, type ArtifactState } from '../migrator/migration-plan';
import {
  MigrationTransaction,
  type MigrationTransactionFileHandle,
  type MigrationTransactionOperations,
} from './migration-transaction';
import type { TransactionInterruptionHandler, TransactionSignalRegistrarLike } from './transaction-signal.registrar';

describe('MigrationTransaction concurrency boundaries', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'migration-transaction-concurrency-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('does not replace an absent destination that appears before install', async () => {
    const target = join(root, 'card.html');
    const appeared = 'written by another process';
    const operations = operationsWith({
      link: async (source, destination) => {
        if (destination === target) await writeFile(target, appeared, 'utf8');
        await link(source, destination);
      },
    });

    const error = await captureError(
      new MigrationTransaction(operations).apply(plan([template(target, absent(), present('<div>ours</div>'))])),
    );

    expect(error).toMatchObject({ code: 'concurrent-modification', paths: [target] });
    expect(await readFile(target, 'utf8')).toBe(appeared);
    expect(publicErrorText(error)).not.toMatch(/\.txn|stage|backup|quarantine/);
  });

  test('rejects a present destination changed immediately before stable capture', async () => {
    const target = join(root, 'card.html');
    await writeFile(target, 'planned original', 'utf8');
    let captureReads = 0;
    const operations = operationsWith({
      open: async (candidate, flags) => {
        if (candidate === target && flags === 'r' && ++captureReads === 2) {
          await writeFile(target, 'changed before capture', 'utf8');
        }
        return open(candidate, flags);
      },
    });

    const error = await captureError(
      new MigrationTransaction(operations).apply(
        plan([template(target, present('planned original'), present('<div>ours</div>'))]),
      ),
    );

    expect(error).toMatchObject({ code: 'concurrent-modification', paths: [target] });
    expect(await readFile(target, 'utf8')).toBe('changed before capture');
  });

  test('rejects a same-byte inode replacement between preflight and capture', async () => {
    const target = join(root, 'card.html');
    await writeFile(target, 'before', 'utf8');
    let publicStats = 0;
    const operations = operationsWith({
      lstat: async candidate => {
        if (candidate === target && ++publicStats === 3) {
          await rename(target, join(root, 'original-inode'));
          await writeFile(target, 'before', 'utf8');
        }
        return lstat(candidate, { bigint: true });
      },
    });

    const error = await captureError(
      new MigrationTransaction(operations).apply(
        plan([template(target, present('before'), present('<div>ours</div>'))]),
      ),
    );

    expect(error).toMatchObject({ code: 'concurrent-modification', paths: [target] });
    expect(await readFile(target, 'utf8')).toBe('before');
  });

  test('detects a destination pathname swapped after open without reading the replacement', async () => {
    const target = join(root, 'card.html');
    const displaced = join(root, 'displaced.html');
    await writeFile(target, 'planned original', 'utf8');
    let swapped = false;
    const operations = operationsWith({
      open: async (candidate, flags) => {
        const handle = await open(candidate, flags);
        if (candidate === target && flags === 'r' && !swapped) {
          swapped = true;
          await rename(target, displaced);
          await writeFile(target, 'replacement bytes', 'utf8');
        }
        return handle;
      },
    });

    const error = await captureError(
      new MigrationTransaction(operations).apply(
        plan([template(target, present('planned original'), present('<div>ours</div>'))]),
      ),
    );

    expect(error).toMatchObject({ code: 'concurrent-modification', paths: [target] });
    expect(await readFile(target, 'utf8')).toBe('replacement bytes');
    expect(await readFile(displaced, 'utf8')).toBe('planned original');
  });

  test('refuses to follow a parent directory replaced by a symbolic link before commit', async () => {
    const parent = join(root, 'output');
    const displacedParent = join(root, 'displaced-output');
    const redirectedParent = join(root, 'redirected-output');
    const target = join(parent, 'card.html');
    await mkdir(parent);
    await mkdir(redirectedParent);
    let swapped = false;
    const operations = operationsWith({
      lstat: async candidate => {
        if (candidate === parent && !swapped && (await containsTransactionNamespace(parent))) {
          swapped = true;
          await rename(parent, displacedParent);
          await symlink(redirectedParent, parent, 'dir');
        }
        return lstat(candidate, { bigint: true });
      },
    });

    const error = await captureError(
      new MigrationTransaction(operations).apply(plan([template(target, absent(), present('<div>ours</div>'))])),
    );

    expect(error).toMatchObject({ code: 'concurrent-modification', paths: [target] });
    await expect(access(join(redirectedParent, 'card.html'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('does not install or unlink a staged pathname replaced after its handle closes', async () => {
    const target = join(root, 'card.html');
    let foreignStage = '';
    const operations = operationsWith({
      lstat: async candidate => {
        const stageExists = await access(candidate).then(
          () => true,
          () => false,
        );
        if (basename(candidate) === 'stage' && foreignStage === '' && stageExists) {
          foreignStage = candidate;
          await rename(candidate, `${candidate}.owned`);
          await writeFile(candidate, 'foreign stage entry', 'utf8');
        }
        return lstat(candidate, { bigint: true });
      },
    });

    const error = await captureError(
      new MigrationTransaction(operations).apply(plan([template(target, absent(), present('<div>ours</div>'))])),
    );

    expect(error).toMatchObject({ code: 'transaction-io', paths: [target] });
    await expect(access(target)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(foreignStage, 'utf8')).toBe('foreign stage entry');
  });

  test('preserves a destination replaced concurrently before rollback removal', async () => {
    const first = join(root, 'a.html');
    const second = join(root, 'b.html');
    const initiating = new Error('second install failed');
    const foreign = 'concurrent replacement';
    const operations = operationsWith({
      link: async (source, destination) => {
        if (destination === second) {
          await unlink(first);
          await writeFile(first, foreign, 'utf8');
          throw initiating;
        }
        await link(source, destination);
      },
    });

    const error = await captureError(
      new MigrationTransaction(operations).apply(
        plan([
          template(first, absent(), present('<div>first</div>')),
          template(second, absent(), present('<div>second</div>')),
        ]),
      ),
    );

    expect(error).toMatchObject({ code: 'transaction-io', paths: [first], cause: initiating });
    expect(await readFile(first, 'utf8')).toBe(foreign);
    await expect(access(second)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('preserves bytes changed after rollback inspection but before quarantine', async () => {
    const target = join(root, 'card.html');
    const initiating = new Error('install reported failure');
    let installReported = false;
    const operations = operationsWith({
      link: async (source, destination) => {
        await link(source, destination);
        if (destination === target && !installReported) {
          installReported = true;
          throw initiating;
        }
      },
      rename: async (source, destination) => {
        if (source === target && basename(destination).startsWith('quarantine-rollback-')) {
          await writeFile(target, 'concurrent bytes', 'utf8');
        }
        await rename(source, destination);
      },
    });

    const error = await captureError(
      new MigrationTransaction(operations).apply(plan([template(target, absent(), present('<div>ours</div>'))])),
    );

    expect(error).toMatchObject({ code: 'transaction-io', paths: [target], cause: initiating });
    expect(await readFile(target, 'utf8')).toBe('concurrent bytes');
  });

  test('uses no-replace restoration and preserves both states when a rollback target appears', async () => {
    const replace = join(root, 'a-replace.html');
    const fail = join(root, 'b-fail.html');
    await writeFile(replace, 'original bytes', 'utf8');
    const initiating = Object.assign(new Error('late destination'), { code: 'EEXIST' });
    const recoveryFailure = Object.assign(new Error('restore collision'), { code: 'EEXIST' });
    const operations = operationsWith({
      link: async (source, destination) => {
        if (destination === fail) {
          await writeFile(fail, 'foreign fail target', 'utf8');
          throw initiating;
        }
        if (destination === replace && basename(source) === 'backup') {
          await writeFile(replace, 'foreign restore target', 'utf8');
          throw recoveryFailure;
        }
        await link(source, destination);
      },
    });

    const error = await captureError(
      new MigrationTransaction(operations).apply(
        plan([
          template(replace, present('original bytes'), present('<div>replacement</div>')),
          template(fail, absent(), present('<div>fail</div>')),
        ]),
      ),
    );

    expect(error).toMatchObject({
      code: 'concurrent-modification',
      paths: [replace, fail],
      cause: initiating,
      recoveryFailures: [recoveryFailure],
    });
    expect(await readFile(replace, 'utf8')).toBe('foreign restore target');
    expect(await readFile(fail, 'utf8')).toBe('foreign fail target');
    expect(await findFileContaining(root, 'original bytes')).toBeDefined();
  });

  test('rolls back when an atomic no-replace install takes effect and then throws', async () => {
    const target = join(root, 'card.html');
    const initiating = new Error('install completion uncertain');
    let threw = false;
    const operations = operationsWith({
      link: async (source, destination) => {
        await link(source, destination);
        if (destination === target && !threw) {
          threw = true;
          throw initiating;
        }
      },
    });

    const error = await captureError(
      new MigrationTransaction(operations).apply(plan([template(target, absent(), present('<div>ours</div>'))])),
    );

    expect(error).toMatchObject({ code: 'transaction-io', paths: [], cause: initiating });
    await expect(access(target)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await transactionResidue(root)).toEqual([]);
  });

  test('restores the original when quarantine rename takes effect and then throws', async () => {
    const target = join(root, 'card.html');
    await writeFile(target, 'original bytes', 'utf8');
    const initiating = new Error('capture completion uncertain');
    let threw = false;
    const operations = operationsWith({
      rename: async (source, destination) => {
        await rename(source, destination);
        if (source === target && basename(destination).startsWith('quarantine') && !threw) {
          threw = true;
          throw initiating;
        }
      },
    });

    const error = await captureError(
      new MigrationTransaction(operations).apply(
        plan([template(target, present('original bytes'), present('<div>ours</div>'))]),
      ),
    );

    expect(error).toMatchObject({ code: 'transaction-io', paths: [], cause: initiating });
    expect(await readFile(target, 'utf8')).toBe('original bytes');
    expect(await transactionResidue(root)).toEqual([]);
  });

  test('closes and cleans a staged file when close fails', async () => {
    const target = join(root, 'card.html');
    const closeFailure = new Error('close failed');
    let failed = false;
    const operations = operationsWith({
      open: async (candidate, flags) => {
        const handle = await open(candidate, flags);
        if (flags !== 'wx') return handle;
        return proxyHandle(handle, {
          close: async () => {
            if (!failed) {
              failed = true;
              throw closeFailure;
            }
            await handle.close();
          },
        });
      },
    });

    const error = await captureError(
      new MigrationTransaction(operations).apply(plan([template(target, absent(), present('<div>ours</div>'))])),
    );

    expect(error).toMatchObject({ code: 'transaction-io', paths: [], cause: closeFailure });
    await expect(access(target)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await transactionResidue(root)).toEqual([]);
  });

  test('attaches every cleanup failure and derives paths from final cleanup inspection', async () => {
    const target = join(root, 'card.html');
    const initiating = new Error('sync failed');
    const cleanupFailure = new Error('unlink failed');
    const inspectionFailure = new Error('inspection failed');
    let stagePath = '';
    let stageInspections = 0;
    const operations = operationsWith({
      open: async (candidate, flags) => {
        const handle = await open(candidate, flags);
        if (flags !== 'wx' || basename(candidate) !== 'stage') return handle;
        stagePath = candidate;
        return proxyHandle(handle, { sync: async () => Promise.reject(initiating) });
      },
      unlink: async candidate => {
        if (candidate === stagePath) throw cleanupFailure;
        await unlink(candidate);
      },
      lstat: async candidate => {
        if (candidate === stagePath && ++stageInspections === 2) throw inspectionFailure;
        return lstat(candidate, { bigint: true });
      },
    });

    const error = await captureError(
      new MigrationTransaction(operations).apply(plan([template(target, absent(), present('<div>ours</div>'))])),
    );

    expect(error).toMatchObject({
      code: 'transaction-io',
      paths: [target],
      cause: initiating,
      recoveryFailures: [cleanupFailure, inspectionFailure],
    });
    await expect(access(target)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('keeps interruption classification when cleanup is unconfirmed', async () => {
    const target = join(root, 'card.html');
    const registrar = new FakeSignalRegistrar();
    const cleanupFailure = new Error('cleanup failed');
    let stagePath = '';
    const operations = operationsWith({
      open: async (candidate, flags) => {
        const handle = await open(candidate, flags);
        if (flags !== 'wx' || basename(candidate) !== 'stage') return handle;
        stagePath = candidate;
        return proxyHandle(handle, {
          writeFile: async (contents, encoding) => {
            await handle.writeFile(contents, encoding);
            registrar.interrupt('SIGTERM');
          },
        });
      },
      unlink: async candidate => {
        if (candidate === stagePath) throw cleanupFailure;
        await unlink(candidate);
      },
    });

    const error = await captureError(
      new MigrationTransaction(operations, registrar).apply(
        plan([template(target, absent(), present('<div>ours</div>'))]),
      ),
    );

    expect(error).toMatchObject({
      code: 'transaction-interrupted',
      paths: [target],
      recoveryFailures: [cleanupFailure],
    });
    expect(registrar.activeRegistrations).toBe(0);
  });

  test('rolls back an interruption immediately after original capture', async () => {
    const target = join(root, 'card.html');
    await writeFile(target, 'original bytes', 'utf8');
    const registrar = new FakeSignalRegistrar();
    const operations = operationsWith({
      open: async (candidate, flags) => {
        const handle = await open(candidate, flags);
        if (flags !== 'wx' || basename(candidate) !== 'backup') return handle;
        return proxyHandle(handle, {
          close: async () => {
            await handle.close();
            registrar.interrupt('SIGINT');
          },
        });
      },
    });

    const error = await captureError(
      new MigrationTransaction(operations, registrar).apply(
        plan([template(target, present('original bytes'), present('<div>ours</div>'))]),
      ),
    );

    expect(error).toMatchObject({ code: 'transaction-interrupted', paths: [] });
    expect(await readFile(target, 'utf8')).toBe('original bytes');
    expect(await transactionResidue(root)).toEqual([]);
    expect(registrar.activeRegistrations).toBe(0);
  });

  test('removes identity-confirmed invocation-created parent directories after failure', async () => {
    const target = join(root, 'one', 'two', 'card.html');
    const initiating = new Error('install failed');
    const operations = operationsWith({
      link: async (_source, destination) => {
        if (destination === target) throw initiating;
        throw new Error(`Unexpected link destination: ${destination}`);
      },
    });

    const error = await captureError(
      new MigrationTransaction(operations).apply(plan([template(target, absent(), present('<div>ours</div>'))])),
    );

    expect(error).toMatchObject({ code: 'transaction-io', cause: initiating });
    await expect(access(join(root, 'one'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('preserves and reports a parent whose mkdir took effect and then threw', async () => {
    const parent = join(root, 'one');
    const target = join(parent, 'card.html');
    const initiating = new Error('mkdir completion uncertain');
    const operations = operationsWith({
      mkdir: async (candidate, options) => {
        await mkdir(candidate, options);
        if (candidate === parent) throw initiating;
      },
    });

    const error = await captureError(
      new MigrationTransaction(operations).apply(plan([template(target, absent(), present('<div>ours</div>'))])),
    );

    expect(error).toMatchObject({ code: 'transaction-io', paths: [target], cause: initiating });
    expect((await lstat(parent)).isDirectory()).toBe(true);
    await expect(access(target)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

type OperationOverrides = Partial<MigrationTransactionOperations>;

function operationsWith(overrides: OperationOverrides = {}): MigrationTransactionOperations {
  return {
    access,
    link,
    lstat: target => lstat(target, { bigint: true }),
    mkdir,
    open: (target, flags) => open(target, flags),
    rename,
    rmdir,
    unlink,
    ...overrides,
  } as MigrationTransactionOperations;
}

function proxyHandle(
  handle: MigrationTransactionFileHandle,
  overrides: Partial<MigrationTransactionFileHandle>,
): MigrationTransactionFileHandle {
  return {
    close: () => handle.close(),
    readFile: options => handle.readFile(options),
    stat: () => handle.stat(),
    sync: () => handle.sync(),
    writeFile: (contents, encoding) => handle.writeFile(contents, encoding),
    ...overrides,
  };
}

function plan(artifacts: readonly ReturnType<typeof plannedOutputArtifact>[]) {
  return migrationPlan({ target: 'tailwind', files: [], artifacts });
}

function template(path: string, original: ArtifactState, proposed: Extract<ArtifactState, { status: 'present' }>) {
  return plannedOutputArtifact({ kind: 'template', path, original, proposed });
}

function present(contents: string) {
  return { status: 'present' as const, contents };
}

function absent() {
  return { status: 'absent' as const };
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    throw new Error('Expected promise to reject');
  } catch (error: unknown) {
    return error;
  }
}

function publicErrorText(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const paths = 'paths' in error ? JSON.stringify(error.paths) : '';
  return `${error.message} ${paths}`;
}

async function containsTransactionNamespace(parent: string): Promise<boolean> {
  return readdir(parent).then(entries => entries.some(entry => entry.endsWith('.txn')));
}

async function transactionResidue(parent: string): Promise<readonly string[]> {
  const entries = await readdir(parent, { recursive: true });
  return entries.filter(entry => entry.includes('.txn')).sort();
}

async function findFileContaining(parent: string, contents: string): Promise<string | undefined> {
  const entries = await readdir(parent, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const candidate = join(entry.parentPath, entry.name);
    if ((await readFile(candidate, 'utf8')) === contents) return candidate;
  }
  return undefined;
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
