import * as fs from 'fs-extra';
import { TailwindAdapter } from '../adapter/tailwind/tailwind.adapter';
import { FolderMigrator } from './folder.migrator';
import { FileMigrator } from './file.migrator';
import path from 'path';
import mockFs from 'mock-fs';

describe('FolderMigrator', () => {
  const adapter = new TailwindAdapter();

  const inputFolder = '/input';
  const outputFolder = '/output';
  let folderMigrator: FolderMigrator;

  beforeEach(() => {
    folderMigrator = new FolderMigrator(adapter, inputFolder, outputFolder);
  });

  afterEach(() => {
    mockFs.restore();
  });

  it('should process a single file correctly', async () => {
    mockFs({
      '/input': {
        'file1.html': '<div></div>',
      },
      '/output': {
        'file1.html': '<div></div>',
      },
    });

    await folderMigrator.migrate();

    await fs.promises.access(path.join(outputFolder, 'file1.html'));
  });

  it('should process a directory of files correctly', async () => {
    mockFs({
      '/input': {
        'file1.html': '<div></div>',
        'file2.html': '<div></div>',
      },
      '/output': {
        'file1.html': '<div></div>',
        'file2.html': '<div></div>',
      },
    });

    await folderMigrator.migrate();

    await fs.promises.access(path.join(outputFolder, 'file1.html'));
    await fs.promises.access(path.join(outputFolder, 'file2.html'));
  });

  it('should process nested directories correctly', async () => {
    mockFs({
      '/input': {
        dir1: {
          'file1.html': '<div></div>',
        },
        dir2: {
          'file2.html': '<div></div>',
        },
      },
      '/output': {
        dir1: {
          'file1.html': '<div></div>',
        },
        dir2: {
          'file2.html': '<div></div>',
        },
      },
    });

    await folderMigrator.migrate();

    await fs.promises.access(path.join(outputFolder, 'dir1', 'file1.html'));
    await fs.promises.access(path.join(outputFolder, 'dir2', 'file2.html'));
  });

  it('should call the convert method of the converter', async () => {
    const spy = vi.spyOn(FileMigrator.prototype, 'migrate');
    mockFs({
      '/input': {
        'file1.html': '<div></div>',
      },
      '/output': {
        'file1.html': '<div></div>',
      },
    });

    await folderMigrator.migrate();

    expect(spy).toHaveBeenCalled();
  });

  it('returns results in normalized path order', async () => {
    mockFs({
      '/input': {
        'z-last.html': '<div fxLayout="row"></div>',
        'a-first.html': '<div fxLayout="column"></div>',
      },
      '/output': {},
    });

    const results = await folderMigrator.migrate();

    expect(
      results.map(result =>
        result.status === 'parse-error' ? result.fileName : 'fileName' in result.input ? result.input.fileName : '',
      ),
    ).toEqual(['/input/a-first.html', '/input/z-last.html']);
  });
});
