import type { SourceRange } from '../template/template.model';

export interface SourceEdit {
  readonly range: SourceRange;
  readonly text: string;
  readonly inputId: string;
}

export interface EditDiagnostic {
  readonly code: 'invalid-range' | 'overlapping-edits';
  readonly message: string;
  readonly inputIds: readonly string[];
}

export type EditResult =
  | { readonly status: 'applied'; readonly output: string }
  | { readonly status: 'invalid'; readonly diagnostics: readonly EditDiagnostic[] };
