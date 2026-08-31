import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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
    const temporaryFile = {
      writeFile: vi.fn().mockResolvedValue(undefined),
      sync: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const operations: AtomicFileOperations = {
      mkdir: vi.fn().mockResolvedValue(undefined),
      open: vi.fn().mockResolvedValue(temporaryFile),
      rename: vi.fn().mockRejectedValue(new Error('rename failed')),
      unlink: vi.fn().mockResolvedValue(undefined),
    };

    await expect(new AtomicFileWriter(operations).write(target, 'after')).rejects.toThrow('rename failed');

    expect(await readFile(target, 'utf8')).toBe('before');
    expect(temporaryFile.sync).toHaveBeenCalledOnce();
    expect(temporaryFile.close).toHaveBeenCalledOnce();
    expect(operations.unlink).toHaveBeenCalledOnce();
  });
});
