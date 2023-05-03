import { ProgressReporter } from './progress.reporter';
import Spinnies from 'spinnies';

jest.mock('spinnies');

const mockedSpinnies = Spinnies as jest.MockedClass<typeof Spinnies>;

describe('ProgressReporter', () => {
  let progressReporter: ProgressReporter;
  let spinniesInstance: Spinnies;

  beforeEach(() => {
    spinniesInstance = new mockedSpinnies();
    progressReporter = new ProgressReporter(spinniesInstance);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('update() should handle fileStarted event', () => {
    const eventData = { id: '1', fileName: 'test.html' };
    progressReporter.update('fileStarted', eventData);

    expect(spinniesInstance.add).toHaveBeenCalledWith('1', {
      text: 'Migrating file: test.html',
    });
  });

  test('update() should handle fileProgress event', () => {
    const eventData = { id: '1', percentage: 50, processedElements: 5 };
    progressReporter.update('fileProgress', eventData);

    expect(spinniesInstance.update).toHaveBeenCalledWith('1', {
      text: 'File progress: 50% (5 elements)',
    });
  });

  test('update() should handle fileCompleted event', () => {
    const eventData = { id: '1', fileName: 'test.html' };
    progressReporter.update('fileCompleted', eventData);

    expect(spinniesInstance.succeed).toHaveBeenCalledWith('1', {
      text: 'Migrated file: test.html',
    });
  });

  test('update() should handle folderStarted event', () => {
    const eventData = { id: '1', folderName: 'testFolder' };
    progressReporter.update('folderStarted', eventData);

    expect(spinniesInstance.add).toHaveBeenCalledWith('1', {
      text: 'Migrating directory: testFolder',
    });
  });

  test('update() should handle folderProgress event', () => {
    const eventData = { id: '1', percentage: 75, processedFiles: 3 };
    progressReporter.update('folderProgress', eventData);

    expect(spinniesInstance.update).toHaveBeenCalledWith('1', {
      text: 'Directory progress: 75% (3 files)',
    });
  });

  test('update() should handle folderCompleted event', () => {
    const eventData = { id: '1', folderName: 'testFolder' };
    progressReporter.update('folderCompleted', eventData);

    expect(spinniesInstance.succeed).toHaveBeenCalledWith('1', {
      text: 'Migrated directory: testFolder',
    });
  });

  test('update() should handle unknown event and log a warning', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const eventData = { id: '1', someData: 'test' };
    progressReporter.update('unknownEvent', eventData);

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Unknown progress event: unknownEvent',
    );
    consoleWarnSpy.mockRestore();
  });
});
