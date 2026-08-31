import { BaseMigrator } from './base.migrator';
import { Observer } from './observer/migrator.observer';
import { TailwindAdapter } from '../adapter/tailwind/tailwind.adapter';

class TestMigrator extends BaseMigrator {
  async migrate(): Promise<readonly []> {
    this.notifyObservers('testEvent', { id: '1', message: 'Test message' });
    return [];
  }

  getObserverCount(): number {
    return this.observers.length;
  }
}

describe('BaseMigrator', () => {
  let migrator: TestMigrator;

  beforeEach(() => {
    migrator = new TestMigrator(new TailwindAdapter());
  });

  test('addObserver and removeObserver', () => {
    const observer: Observer = {
      update: vi.fn(),
    };

    migrator.addObserver(observer);
    expect(migrator.getObserverCount()).toBe(1);

    migrator.removeObserver(observer);
    expect(migrator.getObserverCount()).toBe(0);
  });

  test('notifyObservers', async () => {
    const observer: Observer = {
      update: vi.fn(),
    };
    migrator.addObserver(observer);

    await migrator.migrate();
    expect(observer.update).toHaveBeenCalledWith('testEvent', {
      id: '1',
      message: 'Test message',
    });
  });
});
