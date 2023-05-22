import * as fs from 'fs-extra';
import { IConverter } from '../converter/converter';
import { FolderMigrator } from './folder.migrator';
import { FileMigrator } from './file.migrator';
import path from 'path';
import mockFs from 'mock-fs';

describe('FolderMigrator', () => {
  const mockedConverter: IConverter = {
    convert: jest.fn(),
    canConvert: jest.fn().mockReturnValue(true),
    getAllAttributes: jest.fn().mockReturnValue(['fxFlex']),
    prepare: jest.fn(),
  };

  const inputFolder = '/input';
  const outputFolder = '/output';
  let folderMigrator: FolderMigrator;

  beforeEach(() => {
    folderMigrator = new FolderMigrator(
      mockedConverter,
      inputFolder,
      outputFolder,
    );
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
    const spy = jest.spyOn(FileMigrator.prototype, 'migrate');
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
});
