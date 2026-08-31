import { Migrator } from './migrator';
import { IConverter } from '../converter/converter';
import { FileMigrator } from './file.migrator';
import { FolderMigrator } from './folder.migrator';
import * as fsStats from 'fs';

const { statMock } = vi.hoisted(() => ({ statMock: vi.fn() }));

vi.mock('fs-extra', async importOriginal => {
  const actual = await importOriginal<typeof import('fs-extra')>();
  return { ...actual, promises: { ...actual.promises, stat: statMock } };
});

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
      canConvert: vi.fn().mockReturnValue(true),
      convert: vi.fn(),
      getAllAttributes: vi.fn().mockReturnValue(['fxFlex']),
      isSupportedFileExtension: vi.fn().mockReturnValue(true),
    } as unknown as IConverter;

    inputPath = 'inputPath';
    outputPath = 'outputPath';

    migrator = new Migrator(converter, inputPath, outputPath);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('migrate() should instantiate FileMigrator for files', async () => {
    statMock.mockResolvedValueOnce(createStatsMock(true, false));

    const fileMigratorSpy = vi.spyOn(FileMigrator.prototype, 'migrate');
    fileMigratorSpy.mockImplementation(() => Promise.resolve());

    await migrator.migrate();

    expect(fileMigratorSpy).toHaveBeenCalledTimes(1);
  });

  test('migrate() should instantiate FolderMigrator for directories', async () => {
    statMock.mockResolvedValueOnce(createStatsMock(false, true));

    const folderMigratorSpy = vi.spyOn(FolderMigrator.prototype, 'migrate');
    folderMigratorSpy.mockImplementation(() => Promise.resolve());

    await migrator.migrate();

    expect(folderMigratorSpy).toHaveBeenCalledTimes(1);
  });

  test('migrate() should throw an error for unsupported input types', async () => {
    statMock.mockResolvedValueOnce(createStatsMock(false, false));

    await expect(migrator.migrate()).rejects.toThrow(`Unsupported input type: ${inputPath}`);
  });
});
