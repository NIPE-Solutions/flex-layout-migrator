import { lstat, mkdir, mkdtemp, open, readFile, readdir, rename, rm, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AtomicFileWriter, type AtomicFileOperations } from './atomic-file.writer';

describe('AtomicFileWriter', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'atomic-file-writer-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  test('replaces a file through a temporary sibling and leaves no temporary file', async () => {
    const target = join(directory, 'template.html');
    await writeFile(target, 'before', 'utf8');

    await new AtomicFileWriter().write(target, 'after');

    expect(await readFile(target, 'utf8')).toBe('after');
    expect(await readdir(directory)).toEqual(['template.html']);
  });

  test('preserves the existing file and cleans up when rename fails', async () => {
    const target = join(directory, 'template.html');
    await writeFile(target, 'before', 'utf8');
    const sync = vi.fn();
    const close = vi.fn();
    const operations: AtomicFileOperations = {
      mkdir,
      open: async (candidate, flags) => {
        const handle = await open(candidate, flags);
        return {
          writeFile: (contents, encoding) => handle.writeFile(contents, encoding),
          stat: () => handle.stat(),
          sync: async () => {
            sync();
            await handle.sync();
          },
          close: async () => {
            close();
            await handle.close();
          },
        };
      },
      lstat,
      rename: vi.fn().mockRejectedValue(new Error('rename failed')),
      rmdir,
      unlink,
    };

    await expect(new AtomicFileWriter(operations).write(target, 'after')).rejects.toThrow('rename failed');

    expect(await readFile(target, 'utf8')).toBe('before');
    expect(sync).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(await readdir(directory)).toEqual(['template.html']);
  });

  test('does not delete an unowned path when exclusive temporary creation fails', async () => {
    const target = join(directory, 'template.html');
    let collidingPath = '';
    const collision = Object.assign(new Error('already exists'), { code: 'EEXIST' });
    const operations: AtomicFileOperations = {
      mkdir,
      open: async candidate => {
        if (typeof candidate !== 'string') throw new Error('Expected a string temporary path.');
        collidingPath = candidate;
        await writeFile(candidate, 'owned by another invocation', 'utf8');
        throw collision;
      },
      lstat,
      rename,
      rmdir,
      unlink,
    };

    await expect(new AtomicFileWriter(operations).write(target, 'after')).rejects.toMatchObject({
      message: `Atomic write cleanup could not be confirmed for ${target}.`,
      cause: collision,
    });

    expect(await readFile(collidingPath, 'utf8')).toBe('owned by another invocation');
  });

  test('refuses to install or unlink a temporary pathname whose stable identity changed', async () => {
    const target = join(directory, 'report.json');
    await writeFile(target, 'existing report', 'utf8');
    let temporaryPath = '';
    let foreignPath = '';
    let swapped = false;
    const operations = {
      mkdir,
      open: async (candidate: string, flags: 'wx' | 'r') => {
        const handle = await import('node:fs/promises').then(fs => fs.open(candidate, flags));
        if (flags === 'wx' && candidate !== temporaryPath) temporaryPath = candidate;
        return handle;
      },
      lstat: async (candidate: string) => {
        if (candidate === temporaryPath && !swapped) {
          swapped = true;
          foreignPath = temporaryPath;
          await rename(temporaryPath, `${temporaryPath}.owned`);
          await writeFile(temporaryPath, 'foreign temporary entry', 'utf8');
        }
        return lstat(candidate, { bigint: true });
      },
      rename,
      rmdir,
      unlink,
    } as AtomicFileOperations;

    await expect(new AtomicFileWriter(operations).write(target, 'new report')).rejects.toMatchObject({
      message: `Atomic write cleanup could not be confirmed for ${target}.`,
    });

    expect(await readFile(target, 'utf8')).toBe('existing report');
    expect(await readFile(foreignPath, 'utf8')).toBe('foreign temporary entry');
  });
});
