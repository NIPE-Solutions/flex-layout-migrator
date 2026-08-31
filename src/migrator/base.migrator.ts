import type { ConversionResult } from '../analyzer/conversion-result';

export interface IMigrator<TResult = readonly ConversionResult[]> {
  migrate(): Promise<TResult>;
}

abstract class BaseMigrator<TResult = readonly ConversionResult[]> implements IMigrator<TResult> {
  /**
   * Migrates the file. This method should be implemented by the subclass.
   */
  public abstract migrate(): Promise<TResult>;
}

export { BaseMigrator };
