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
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { plannedOutputArtifact } from '../migrator/migration-plan';
import { FileSystemCleanupUnit, RecoveryUnitError } from './cleanup.unit';
import { FileSystemStagingUnit } from './staging.unit';
import { TransactionUnitSession, type MigrationTransactionOperations } from './transaction-unit.session';

describe('FileSystemCleanupUnit', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cleanup-unit-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('removes only invocation-owned staging paths and preserves unrelated files', async () => {
    const target = join(root, 'card.html');
    const foreign = join(root, 'foreign.txt');
    await writeFile(foreign, 'foreign');
    const removed: string[] = [];
    const operations = operationsWith({
      unlink: async candidate => {
        removed.push(candidate);
        await unlink(candidate);
      },
    });
    const session = new TransactionUnitSession(operations);
    const staged = await new FileSystemStagingUnit(session).stage([artifact(target)], new AbortController().signal);

    const unresolved = await new FileSystemCleanupUnit(session, 'recovery').cleanup(staged);

    expect(unresolved).toEqual([]);
    expect(removed).toEqual([staged[0]!.stagingPath]);
    expect(await readFile(foreign, 'utf8')).toBe('foreign');
    expect((await readdir(root)).filter(entry => entry.endsWith('.txn'))).toEqual([]);
  });

  test('reports the public destination when invocation-owned cleanup cannot be confirmed', async () => {
    const target = join(root, 'card.html');
    let stagingPath = '';
    const failure = new Error('unlink failed');
    const operations = operationsWith({
      open: async (candidate, flags) => {
        if (flags === 'wx' && basename(candidate) === 'stage') stagingPath = candidate;
        return open(candidate, flags);
      },
      unlink: async candidate => {
        if (candidate === stagingPath) throw failure;
        await unlink(candidate);
      },
    });
    const session = new TransactionUnitSession(operations);
    const staged = await new FileSystemStagingUnit(session).stage([artifact(target)], new AbortController().signal);

    const error = await captureError(new FileSystemCleanupUnit(session, 'recovery').cleanup(staged));

    expect(error).toBeInstanceOf(RecoveryUnitError);
    expect(error).toMatchObject({ paths: [target], failures: [failure] });
    expect(await access(stagingPath)).toBeUndefined();
    expect(await readdir(dirname(stagingPath))).toEqual(['stage']);
  });

  test('rejects a foreign staged journal before removing any invocation-owned path', async () => {
    const target = join(root, 'card.html');
    const cleanupOperations: string[] = [];
    let cleaning = false;
    const session = new TransactionUnitSession(
      operationsWith({
        rmdir: async candidate => {
          if (cleaning) cleanupOperations.push(`rmdir:${candidate}`);
          await rmdir(candidate);
        },
        unlink: async candidate => {
          if (cleaning) cleanupOperations.push(`unlink:${candidate}`);
          await unlink(candidate);
        },
      }),
    );
    const staged = await new FileSystemStagingUnit(session).stage([artifact(target)], new AbortController().signal);
    const foreign = artifact(join(root, 'foreign.html'));
    cleaning = true;

    const error = await captureError(new FileSystemCleanupUnit(session, 'recovery').cleanup([{ artifact: foreign }]));

    expect(error).toBeInstanceOf(RecoveryUnitError);
    expect(error).toMatchObject({ paths: [foreign.path], failures: [{ code: 'internal-invariant' }] });
    expect(cleanupOperations).toEqual([]);
    expect(await readdir(dirname(staged[0]!.stagingPath!))).toEqual(['stage']);
  });
});

function artifact(path: string) {
  return plannedOutputArtifact({
    kind: 'template',
    path,
    original: { status: 'absent' },
    proposed: { status: 'present', contents: '<div>after</div>' },
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
