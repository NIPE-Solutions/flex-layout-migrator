import { FileMigrator } from './file.migrator';
import { IConverter } from '../converter/converter';

import * as fs from 'fs-extra';
import * as path from 'path';

const readFileMock = jest.fn();
const writeFileMock = jest.fn();
const mkdirMock = jest.fn();

jest.mock('fs-extra');
jest.mock('path');

const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedPath = path as jest.Mocked<typeof path>;

describe('FileMigrator', () => {
  let converter: IConverter;
  let fileMigrator: FileMigrator;
  const input = 'input.html';
  const output = 'output.html';

  beforeEach(() => {
    converter = {
      canConvert: jest.fn().mockReturnValue(true),
      prepare: jest.fn(),
      convert: jest.fn(),
      getAllAttributes: jest.fn().mockReturnValue(['fxFlex']),
    } as unknown as IConverter;

    fileMigrator = new FileMigrator(converter, input, output);

    jest.spyOn(mockedFs.promises, 'readFile').mockImplementation(readFileMock);
    jest
      .spyOn(mockedFs.promises, 'writeFile')
      .mockImplementation(writeFileMock);
    jest.spyOn(mockedFs.promises, 'mkdir').mockImplementation(mkdirMock);

    readFileMock.mockImplementation(() =>
      Promise.resolve('<div fxFlex="100%"></div>'),
    );
    writeFileMock.mockImplementation(() => Promise.resolve(undefined));
    mkdirMock.mockImplementation(() => Promise.resolve(undefined));

    mockedPath.dirname.mockReturnValue('path/to/output');
    mockedPath.basename.mockImplementation(filePath => filePath);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('migrate() should call converter methods and read/write files', async () => {
    await fileMigrator.migrate();

    expect(converter.getAllAttributes).toHaveBeenCalled();
    expect(converter.canConvert).toHaveBeenCalledWith('fxFlex', false);
    expect(converter.convert).toHaveBeenCalled();

    expect(mockedFs.promises.readFile).toHaveBeenCalledWith(input, 'utf8');
    expect(mockedFs.promises.writeFile).toHaveBeenCalled();
  });
});
