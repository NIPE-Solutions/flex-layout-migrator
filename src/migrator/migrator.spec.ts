import { Migrator } from './migrator';
import { IConverter } from '../converter/converter';
import { FileMigrator } from './file.migrator';
import { FolderMigrator } from './folder.migrator';
import * as fs from 'fs-extra';
import * as fsStats from 'fs';

jest.mock('fs-extra');

const mockedFs = fs as jest.Mocked<typeof fs>;

function createStatsMock(isFile: boolean, isDirectory: boolean): fsStats.Stats {
  return {
    isFile: () => isFile,
    isDirectory: () => isDirectory,
  } as unknown as fsStats.Stats;
}

describe('Migrator', () => {
  let converter: IConverter;
  let inputPath: string;
  let outputPath: string;
  let migrator: Migrator;

  beforeEach(() => {
    converter = {
      canConvert: jest.fn().mockReturnValue(true),
      convert: jest.fn(),
      getAllAttributes: jest.fn().mockReturnValue(['fxFlex']),
    } as unknown as IConverter;

    inputPath = 'inputPath';
    outputPath = 'outputPath';

    migrator = new Migrator(converter, inputPath, outputPath);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('migrate() should instantiate FileMigrator for files', async () => {
    const statMock = jest.spyOn(mockedFs.promises, 'stat');
    statMock.mockResolvedValueOnce(createStatsMock(true, false));

    const fileMigratorSpy = jest.spyOn(FileMigrator.prototype, 'migrate');
    fileMigratorSpy.mockImplementation(() => Promise.resolve());

    await migrator.migrate();

    expect(fileMigratorSpy).toHaveBeenCalledTimes(1);
  });

  test('migrate() should instantiate FolderMigrator for directories', async () => {
    const statMock = jest.spyOn(mockedFs.promises, 'stat');
    statMock.mockResolvedValueOnce(createStatsMock(false, true));

    const folderMigratorSpy = jest.spyOn(FolderMigrator.prototype, 'migrate');
    folderMigratorSpy.mockImplementation(() => Promise.resolve());

    await migrator.migrate();

    expect(folderMigratorSpy).toHaveBeenCalledTimes(1);
  });

  test('migrate() should throw an error for unsupported input types', async () => {
    const statMock = jest.spyOn(mockedFs.promises, 'stat');
    statMock.mockResolvedValueOnce(createStatsMock(false, false));

    await expect(migrator.migrate()).rejects.toThrow(
      `Unsupported input type: ${inputPath}`,
    );
  });
});
