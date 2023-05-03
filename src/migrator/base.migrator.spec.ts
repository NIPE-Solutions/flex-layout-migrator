import { BaseMigrator } from './base.migrator';
import { IConverter } from '../converter/converter';
import { Observer } from './observer/migrator.observer';

class TestMigrator extends BaseMigrator {
  async migrate(): Promise<void> {
    this.notifyObservers('testEvent', { id: '1', message: 'Test message' });
  }

  getObserverCount(): number {
    return this.observers.length;
  }
}

describe('BaseMigrator', () => {
  let converter: IConverter;
  let migrator: TestMigrator;

  beforeEach(() => {
    converter = {
      canConvert: jest.fn().mockReturnValue(false),
      convert: jest.fn(),
      getAllAttributes: jest.fn().mockReturnValue([]),
    } as unknown as IConverter;

    migrator = new TestMigrator(converter);
  });

  test('addObserver and removeObserver', () => {
    const observer: Observer = {
      update: jest.fn(),
    };

    migrator.addObserver(observer);
    expect(migrator.getObserverCount()).toBe(1);

    migrator.removeObserver(observer);
    expect(migrator.getObserverCount()).toBe(0);
  });

  test('notifyObservers', async () => {
    const observer: Observer = {
      update: jest.fn(),
    };
    migrator.addObserver(observer);

    await migrator.migrate();
    expect(observer.update).toHaveBeenCalledWith('testEvent', {
      message: 'Test message',
    });
  });
});
