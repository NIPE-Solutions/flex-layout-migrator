import { IConverter } from '../converter/converter';
import { EventData, Observer } from './observer/migrator.observer';

export interface IMigrator {
  migrate(): Promise<void>;
}

abstract class BaseMigrator implements IMigrator {
  protected observers: Observer[] = [];

  constructor(protected converter: IConverter) {}

  public addObserver(...observers: Observer[]): void {
    for (const observer of observers) this.observers.push(observer);
  }

  public removeObserver(observer: Observer): void {
    const index = this.observers.indexOf(observer);
    if (index !== -1) {
      this.observers.splice(index, 1);
    }
  }

  protected notifyObservers(event: string, data: EventData): void {
    for (const observer of this.observers) {
      observer.update(event, data);
    }
  }

  /**
   * Migrates the file. This method should be implemented by the subclass.
   */
  public abstract migrate(): Promise<void>;
}

export { BaseMigrator };
