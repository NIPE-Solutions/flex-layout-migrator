import {
  access,
  chmod,
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
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { plannedOutputArtifact } from '../migrator/migration-plan';
import { CommitUnitError, FileSystemCommitUnit } from './commit.unit';
import { FileSystemRollbackUnit } from './rollback.unit';
import { FileSystemStagingUnit } from './staging.unit';
import {
  RecoveryUnitError,
  TransactionUnitSession,
  type MigrationTransactionOperations,
} from './transaction-unit.session';

describe('FileSystemRollbackUnit', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'rollback-unit-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('restores committed replacements in the exact reverse journal order supplied by the coordinator', async () => {
    const first = join(root, 'a.html');
    const second = join(root, 'b.html');
    await writeFile(first, 'first before');
    await writeFile(second, 'second before');
    const recoveryOrder: string[] = [];
    let recovery = false;
    const operations = operationsWith({
      rename: async (source, destination) => {
        if (recovery && basename(destination).startsWith('quarantine-rollback')) recoveryOrder.push(source);
        await rename(source, destination);
      },
    });
    const session = new TransactionUnitSession(operations);
    const signal = new AbortController().signal;
    const staged = await new FileSystemStagingUnit(session).stage(
      [
        artifact(first, 'first before', '<div>first after</div>'),
        artifact(second, 'second before', '<div>second after</div>'),
      ],
      signal,
    );
    const committed = await new FileSystemCommitUnit(session).commit(staged, signal);
    recovery = true;

    const unresolved = await new FileSystemRollbackUnit(session).rollback([...committed].reverse());

    expect(unresolved).toEqual([]);
    expect(recoveryOrder).toEqual([second, first]);
    expect(await readFile(first, 'utf8')).toBe('first before');
    expect(await readFile(second, 'utf8')).toBe('second before');
  });

  test('restores original permission modes after a later commit replacement fails', async () => {
    const first = join(root, 'private.html');
    const second = join(root, 'group.html');
    await writeFile(first, 'first before');
    await writeFile(second, 'second before');
    await chmod(first, 0o600);
    await chmod(second, 0o640);
    const failure = new Error('second install failed');
    let failed = false;
    const session = new TransactionUnitSession(
      operationsWith({
        link: async (source, destination) => {
          if (!failed && basename(source) === 'stage' && destination === second) {
            failed = true;
            throw failure;
          }
          await link(source, destination);
        },
      }),
    );
    const signal = new AbortController().signal;
    const staged = await new FileSystemStagingUnit(session).stage(
      [
        artifact(first, 'first before', '<div>first after</div>'),
        artifact(second, 'second before', '<div>second after</div>'),
      ],
      signal,
    );
    const commitError = await captureError(new FileSystemCommitUnit(session).commit(staged, signal));
    if (!(commitError instanceof CommitUnitError)) throw commitError;

    await new FileSystemRollbackUnit(session).rollback([...commitError.committed].reverse());

    expect(await readFile(first, 'utf8')).toBe('first before');
    expect(await readFile(second, 'utf8')).toBe('second before');
    expect((await stat(first)).mode & 0o777).toBe(0o600);
    expect((await stat(second)).mode & 0o777).toBe(0o640);
  });

  test('reports unresolved recovery with exact rollback order and retained namespace evidence', async () => {
    const target = join(root, 'private.html');
    await writeFile(target, 'private before');
    const failure = new Error('backup restore failed');
    const recoveryOperations: string[] = [];
    let recovering = false;
    const session = new TransactionUnitSession(
      operationsWith({
        link: async (source, destination) => {
          if (recovering) recoveryOperations.push(`link:${basename(source)}->${destination}`);
          if (recovering && basename(source) === 'backup') throw failure;
          await link(source, destination);
        },
        rename: async (source, destination) => {
          if (recovering) {
            const destinationName = basename(destination).startsWith('quarantine-rollback-')
              ? 'quarantine-rollback-*'
              : basename(destination);
            recoveryOperations.push(`rename:${source}->${destinationName}`);
          }
          await rename(source, destination);
        },
      }),
    );
    const signal = new AbortController().signal;
    const staged = await new FileSystemStagingUnit(session).stage(
      [artifact(target, 'private before', '<div>private after</div>')],
      signal,
    );
    const committed = await new FileSystemCommitUnit(session).commit(staged, signal);
    recovering = true;

    const error = await captureError(new FileSystemRollbackUnit(session).rollback([...committed].reverse()));

    expect(error).toBeInstanceOf(RecoveryUnitError);
    expect(error).toMatchObject({ paths: [target], failures: [failure] });
    expect(recoveryOperations).toEqual([`rename:${target}->quarantine-rollback-*`, `link:backup->${target}`]);
    expect(normalizedNamespaceContents(await readdir(dirname(staged[0]!.stagingPath!)))).toEqual([
      'backup',
      'quarantine-*',
      'quarantine-rollback-*',
      'stage',
    ]);
    await expect(access(target)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('rejects a foreign committed journal before starting any rollback mechanics', async () => {
    const target = join(root, 'card.html');
    await writeFile(target, 'before');
    const recoveryOperations: string[] = [];
    let recovering = false;
    const session = new TransactionUnitSession(
      operationsWith({
        link: async (source, destination) => {
          if (recovering) recoveryOperations.push(`link:${source}:${destination}`);
          await link(source, destination);
        },
        rename: async (source, destination) => {
          if (recovering) recoveryOperations.push(`rename:${source}:${destination}`);
          await rename(source, destination);
        },
      }),
    );
    const signal = new AbortController().signal;
    const staged = await new FileSystemStagingUnit(session).stage(
      [artifact(target, 'before', '<div>after</div>')],
      signal,
    );
    await new FileSystemCommitUnit(session).commit(staged, signal);
    const foreign = artifact(join(root, 'foreign.html'), 'foreign before', '<div>foreign after</div>');
    recovering = true;

    const error = await captureError(
      new FileSystemRollbackUnit(session).rollback([{ artifact: foreign, committed: true }]),
    );

    expect(error).toBeInstanceOf(RecoveryUnitError);
    expect(error).toMatchObject({ paths: [foreign.path], failures: [{ code: 'internal-invariant' }] });
    expect(recoveryOperations).toEqual([]);
    expect(await readFile(target, 'utf8')).toBe('<div>after</div>');
  });
});

function artifact(path: string, original: string, proposed: string) {
  return plannedOutputArtifact({
    kind: 'template',
    path,
    original: { status: 'present', contents: original },
    proposed: { status: 'present', contents: proposed },
  });
}

function operationsWith(overrides: Partial<MigrationTransactionOperations> = {}): MigrationTransactionOperations {
  return {
    access,
    link,
    lstat,
    mkdir,
    open: (target, flags) => open(target, flags),
    rename,
    rmdir,
    stat,
    unlink,
    ...overrides,
  };
}

function normalizedNamespaceContents(entries: readonly string[]): readonly string[] {
  return entries
    .map(entry => {
      if (entry.startsWith('quarantine-rollback-')) return 'quarantine-rollback-*';
      if (entry.startsWith('quarantine-')) return 'quarantine-*';
      return entry;
    })
    .sort();
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    throw new Error('Expected promise to reject.');
  } catch (error: unknown) {
    return error;
  }
}
