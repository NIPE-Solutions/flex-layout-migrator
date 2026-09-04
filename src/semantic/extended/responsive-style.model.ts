import type { LiteralStyleDeclaration } from '../literal-style-declaration';

export type { LiteralStyleDeclaration, LiteralStyleParseResult } from '../literal-style-declaration';

export interface ResponsiveStyleValue {
  readonly declarations: readonly LiteralStyleDeclaration[];
}

export type ResponsiveStyleValueResult =
  | { readonly status: 'parsed'; readonly value: ResponsiveStyleValue }
  | { readonly status: 'unverified'; readonly reason: string };
