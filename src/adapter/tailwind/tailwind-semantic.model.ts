export type { CssLength, ParsedValue } from '../../flex/css-length';
export type { SemanticDiagnostic, SemanticResult } from '../../flex/flex-semantic.model';

export type TailwindStrategyResult =
  | { readonly status: 'converted'; readonly classNames: readonly string[] }
  | {
      readonly status: 'review';
      readonly code:
        | 'breakpoint-unverified'
        | 'context-unverified'
        | 'custom-breakpoint'
        | 'dynamic-binding'
        | 'semantic-unsupported';
      readonly reason: string;
      readonly suggestion: string;
    }
  | { readonly status: 'invalid'; readonly code: 'invalid-value' };
