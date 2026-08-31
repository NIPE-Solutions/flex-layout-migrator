import type { ConversionAdapter } from '../adapter/conversion-adapter';
import type { ConversionResult } from '../analyzer/conversion-result';
import { EventData, Observer } from './observer/migrator.observer';

export interface IMigrator<TResult = readonly ConversionResult[]> {
  migrate(): Promise<TResult>;
}

abstract class BaseMigrator<TResult = readonly ConversionResult[]> implements IMigrator<TResult> {
  protected observers: Observer[] = [];

  constructor(protected adapter: ConversionAdapter) {}

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
  public abstract migrate(): Promise<TResult>;
}

export { BaseMigrator };
