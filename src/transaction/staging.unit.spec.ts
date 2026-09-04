import { access, link, lstat, mkdir, mkdtemp, open, readdir, rename, rm, rmdir, stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { plannedOutputArtifact, type PlannedOutputArtifact } from '../migrator/migration-plan';
import { FileSystemCleanupUnit } from './cleanup.unit';
import { FileSystemStagingUnit, StagingUnitError } from './staging.unit';
import {
  TransactionUnitSession,
  type MigrationTransactionFileHandle,
  type MigrationTransactionOperations,
} from './transaction-unit.session';

describe('FileSystemStagingUnit', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'staging-unit-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('stages proposed bytes in deterministic artifact order with invocation-only paths and durable writes', async () => {
    const events: string[] = [];
    const operations = operationsWith({
      mkdir: async (candidate, options) => {
        events.push(`mkdir:${candidate}:${options?.mode?.toString(8)}`);
        await mkdir(candidate, options);
      },
      open: async (candidate, flags) => {
        events.push(`open:${candidate}:${flags}`);
        const handle = await open(candidate, flags);
        return recordingHandle(handle, candidate, events);
      },
    });
    const artifacts = [artifact(join(root, 'ä.html')), artifact(join(root, 'a.html')), artifact(join(root, 'Z.html'))];
    const session = new TransactionUnitSession(operations);

    const staged = await new FileSystemStagingUnit(session).stage(artifacts, new AbortController().signal);

    expect(staged.map(item => basename(item.artifact.path))).toEqual(['Z.html', 'a.html', 'ä.html']);
    expect(staged.every(item => Object.isFrozen(item))).toBe(true);
    for (const item of staged) {
      expect(item.stagingPath).toBeDefined();
      expect(basename(item.stagingPath!)).toBe('stage');
      expect(dirname(dirname(item.stagingPath!))).toBe(root);
      expect(basename(dirname(item.stagingPath!))).toMatch(
        new RegExp(`^\\.${basename(item.artifact.path)}\\..+\\.txn$`, 'u'),
      );
      expect(events).toContain(`mkdir:${dirname(item.stagingPath!)}:700`);
      expect(events).toContain(`open:${item.stagingPath}:wx`);
      const write = events.indexOf(`write:${item.stagingPath}`);
      const sync = events.indexOf(`sync:${item.stagingPath}`);
      const close = events.indexOf(`close:${item.stagingPath}`);
      expect(write).toBeLessThan(sync);
      expect(sync).toBeLessThan(close);
    }
  });

  test('does not create an invocation namespace when cancellation is already requested', async () => {
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    const session = new TransactionUnitSession(operationsWith());

    await expect(
      new FileSystemStagingUnit(session).stage([artifact(join(root, 'card.html'))], controller.signal),
    ).rejects.toThrow('cancelled');
    await expect(access(join(root, 'card.html'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readdir(root)).toEqual([]);
  });

  test('exposes exact namespace recovery evidence when durable staging fails', async () => {
    const target = join(root, 'card.html');
    const failure = new Error('stage sync failed');
    const events: string[] = [];
    let stagingPath = '';
    const session = new TransactionUnitSession(
      operationsWith({
        open: async (candidate, flags) => {
          const handle = await open(candidate, flags);
          if (flags === 'r') return handle;
          stagingPath = candidate;
          events.push(`open:${candidate}:${flags}`);
          return {
            chmod: mode => handle.chmod(mode),
            readFile: options => handle.readFile(options),
            stat: () => handle.stat(),
            writeFile: async (contents, encoding) => {
              events.push(`write:${candidate}`);
              await handle.writeFile(contents, encoding);
            },
            sync: async () => {
              events.push(`sync:${candidate}`);
              throw failure;
            },
            close: () => handle.close(),
          };
        },
      }),
    );

    const error = await captureError(
      new FileSystemStagingUnit(session).stage([artifact(target)], new AbortController().signal),
    );

    expect(error).toBeInstanceOf(StagingUnitError);
    expect(error).toMatchObject({ cause: failure });
    expect((error as StagingUnitError).staged).toMatchObject([{ artifact: { path: target }, stagingPath }]);
    expect(events).toEqual([`open:${stagingPath}:wx`, `write:${stagingPath}`, `sync:${stagingPath}`]);
    expect(await readdir(dirname(stagingPath))).toEqual(['stage']);

    await new FileSystemCleanupUnit(session, 'recovery').cleanup((error as StagingUnitError).staged);
    expect(await readdir(root)).toEqual([]);
  });
});

function artifact(path: string): PlannedOutputArtifact {
  return plannedOutputArtifact({
    kind: 'template',
    path,
    original: { status: 'absent' },
    proposed: { status: 'present', contents: `<div>${basename(path)}</div>` },
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

function recordingHandle(
  handle: MigrationTransactionFileHandle,
  path: string,
  events: string[],
): MigrationTransactionFileHandle {
  return {
    chmod: mode => handle.chmod(mode),
    readFile: options => handle.readFile(options),
    stat: () => handle.stat(),
    writeFile: async (contents, encoding) => {
      events.push(`write:${path}`);
      await handle.writeFile(contents, encoding);
    },
    sync: async () => {
      events.push(`sync:${path}`);
      await handle.sync();
    },
    close: async () => {
      events.push(`close:${path}`);
      await handle.close();
    },
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
