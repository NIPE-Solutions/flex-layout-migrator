import {
  access,
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
import { FileSystemCommitUnit } from './commit.unit';
import { FileSystemRollbackUnit } from './rollback.unit';
import { FileSystemStagingUnit } from './staging.unit';
import { TransactionUnitSession, type MigrationTransactionOperations } from './transaction-unit.session';

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
