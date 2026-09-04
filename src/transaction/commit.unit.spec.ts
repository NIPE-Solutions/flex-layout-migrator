import {
  access,
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  rename,
  rm,
  rmdir,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { plannedOutputArtifact } from '../migrator/migration-plan';
import { CommitUnitError, FileSystemCommitUnit } from './commit.unit';
import { FileSystemStagingUnit } from './staging.unit';
import { TransactionUnitSession, type MigrationTransactionOperations } from './transaction-unit.session';

describe('FileSystemCommitUnit', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'commit-unit-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('replaces destinations in staged order and freezes a completed journal entry before advancing', async () => {
    const first = join(root, 'a.html');
    const second = join(root, 'b.html');
    await writeFile(first, 'first before');
    await writeFile(second, 'second before');
    const installed: string[] = [];
    const operations = operationsWith({
      link: async (source, destination) => {
        if (basename(source) === 'stage') installed.push(destination);
        await link(source, destination);
      },
    });
    const session = new TransactionUnitSession(operations);
    const signal = new AbortController().signal;
    const staged = await new FileSystemStagingUnit(session.stagingPort()).stage(
      [
        artifact(first, 'first before', '<div>first after</div>'),
        artifact(second, 'second before', '<div>second after</div>'),
      ],
      signal,
    );

    const committed = await new FileSystemCommitUnit(session.commitPort()).commit(staged, signal);

    expect(installed).toEqual([first, second]);
    expect(committed.map(item => item.artifact.path)).toEqual([first, second]);
    expect(committed.every(item => Object.isFrozen(item))).toBe(true);
    expect(committed.every(item => basename(item.backupPath!) === 'backup')).toBe(true);
    expect(await readFile(first, 'utf8')).toBe('<div>first after</div>');
    expect(await readFile(second, 'utf8')).toBe('<div>second after</div>');
  });

  test('exposes the first completed replacement when the next install fails', async () => {
    const first = join(root, 'a.html');
    const second = join(root, 'b.html');
    const failure = new Error('second install failed');
    const operations = operationsWith({
      link: async (source, destination) => {
        if (destination === second) throw failure;
        await link(source, destination);
      },
    });
    const session = new TransactionUnitSession(operations);
    const signal = new AbortController().signal;
    const staged = await new FileSystemStagingUnit(session.stagingPort()).stage(
      [artifact(first, undefined, '<div>first</div>'), artifact(second, undefined, '<div>second</div>')],
      signal,
    );

    const error = await captureError(new FileSystemCommitUnit(session.commitPort()).commit(staged, signal));

    expect(error).toBeInstanceOf(CommitUnitError);
    expect(error).toMatchObject({ cause: failure });
    expect((error as CommitUnitError).committed.map(item => item.artifact.path)).toEqual([first]);
    expect(Object.isFrozen((error as CommitUnitError).committed)).toBe(true);
  });

  test('preserves the destination permission mode when installing replacement bytes', async () => {
    const target = join(root, 'private.html');
    await writeFile(target, 'private before');
    await chmod(target, 0o600);
    const session = new TransactionUnitSession(operationsWith());
    const signal = new AbortController().signal;
    const staged = await new FileSystemStagingUnit(session.stagingPort()).stage(
      [artifact(target, 'private before', '<div>private after</div>')],
      signal,
    );

    await new FileSystemCommitUnit(session.commitPort()).commit(staged, signal);

    expect((await stat(target)).mode & 0o777).toBe(0o600);
  });

  test('rejects a foreign staged journal before starting any commit mechanics', async () => {
    const target = join(root, 'card.html');
    const foreign = artifact(join(root, 'foreign.html'), undefined, '<div>foreign</div>');
    const commitOperations: string[] = [];
    const session = new TransactionUnitSession(
      operationsWith({
        link: async (source, destination) => {
          commitOperations.push(`link:${source}:${destination}`);
          await link(source, destination);
        },
        rename: async (source, destination) => {
          commitOperations.push(`rename:${source}:${destination}`);
          await rename(source, destination);
        },
      }),
    );
    const signal = new AbortController().signal;
    await new FileSystemStagingUnit(session.stagingPort()).stage(
      [artifact(target, undefined, '<div>after</div>')],
      signal,
    );

    const error = await captureError(
      new FileSystemCommitUnit(session.commitPort()).commit([{ artifact: foreign }], signal),
    );

    expect(error).toBeInstanceOf(CommitUnitError);
    expect(error).toMatchObject({
      cause: { code: 'internal-invariant', paths: [foreign.path] },
      committed: [],
    });
    expect(commitOperations).toEqual([]);
    await expect(access(target)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

function artifact(path: string, original: string | undefined, proposed: string) {
  return plannedOutputArtifact({
    kind: 'template',
    path,
    original: original === undefined ? { status: 'absent' } : { status: 'present', contents: original },
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

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    throw new Error('Expected promise to reject.');
  } catch (error: unknown) {
    return error;
  }
}
