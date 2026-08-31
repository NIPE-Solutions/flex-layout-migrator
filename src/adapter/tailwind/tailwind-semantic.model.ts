export type ParsedValue<T> = { readonly ok: true; readonly value: T } | { readonly ok: false };

export type CssLength = string & { readonly __cssLength: unique symbol };

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
