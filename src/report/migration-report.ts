export interface MigrationReport {
  readonly schemaVersion: 1;
  readonly target: 'css' | 'tailwind';
  readonly dryRun: boolean;
  readonly input: string;
  readonly output: string;
  readonly durationMs: number;
  readonly summary: MigrationSummary;
  readonly files: readonly FileReport[];
  readonly stylesheet?: StylesheetReport;
}

export interface StylesheetReport {
  readonly path: string;
  readonly change: 'created' | 'updated' | 'removed' | 'unchanged';
}

export interface MigrationSummary {
  readonly filesScanned: number;
  readonly filesChanged: number;
  readonly converted: number;
  readonly review: number;
  readonly unsupported: number;
  readonly invalid: number;
  readonly parseErrors: number;
}

export interface FileReport {
  readonly path: string;
  readonly changed: boolean;
  readonly results: readonly ReportResult[];
}

export type ReportResult =
  | {
      readonly status: 'converted';
      readonly directive: string;
      readonly sourceName: string;
      readonly offset: number;
    }
  | {
      readonly status: 'review' | 'unsupported' | 'invalid';
      readonly directive: string;
      readonly sourceName: string;
      readonly offset: number;
      readonly code: string;
      readonly reason: string;
      readonly suggestion: string;
    }
  | {
      readonly status: 'parse-error';
      readonly offset: number;
      readonly code: 'template-parse-error' | 'generated-template-parse-error';
      readonly reason: string;
    };
