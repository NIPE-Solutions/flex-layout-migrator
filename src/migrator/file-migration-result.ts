import type { ConversionResult } from '../analyzer/conversion-result';

export interface FileMigrationOptions {
  readonly write: boolean;
  readonly responsiveImages?: boolean;
}

export interface FileMigrationResult {
  readonly inputPath: string;
  readonly outputPath: string;
  readonly changed: boolean;
  readonly results: readonly ConversionResult[];
}
