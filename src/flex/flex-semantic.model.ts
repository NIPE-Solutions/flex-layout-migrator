export type SemanticDiagnostic =
  | { readonly status: 'invalid'; readonly code: 'invalid-value' }
  | {
      readonly status: 'review';
      readonly code: 'context-unverified' | 'semantic-unsupported';
      readonly reason: string;
      readonly suggestion: string;
    };

export type SemanticResult<T> = { readonly status: 'planned'; readonly value: T } | SemanticDiagnostic;
