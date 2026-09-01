import type { LiteralStyleDeclaration } from '../visibility/literal-style-display';

export type { LiteralStyleDeclaration, LiteralStyleParseResult } from '../visibility/literal-style-display';

export interface ResponsiveStyleValue {
  readonly declarations: readonly LiteralStyleDeclaration[];
}

export type ResponsiveStyleValueResult =
  | { readonly status: 'parsed'; readonly value: ResponsiveStyleValue }
  | { readonly status: 'unverified'; readonly reason: string };
