import type { ConversionResult } from '../analyzer/conversion-result';

export interface FileMigrationOptions {
  readonly responsiveImages?: boolean;
}

export interface FileMigrationResult {
  readonly inputPath: string;
  readonly outputPath: string;
  readonly changed: boolean;
  readonly results: readonly ConversionResult[];
}

export function fileMigrationResult(result: FileMigrationResult): FileMigrationResult {
  return Object.freeze({
    inputPath: result.inputPath,
    outputPath: result.outputPath,
    changed: result.changed,
    results: freezeValue([...result.results]),
  });
}

function freezeValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(item => freezeValue(item))) as T;
  }
  if (value !== null && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freezeValue(item)]))) as T;
  }
  return value;
}
