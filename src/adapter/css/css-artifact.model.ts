import type { MediaDefinition } from '../../breakpoint/breakpoint-catalog';

export interface CssDeclaration {
  readonly property: string;
  readonly value: string;
}

export interface CssRuleContext {
  readonly priority: number;
  readonly media?: MediaDefinition;
}

export type CssSemanticFamily =
  'layout' | 'layout-align' | 'layout-gap' | 'flex-item' | 'flex-align' | 'flex-fill' | 'flex-offset' | 'flex-order';

export interface OwnedCssRule {
  readonly owner: 'flex-layout-codemod';
  readonly id: string;
  readonly className: string;
  readonly family: CssSemanticFamily;
  readonly declarations: readonly CssDeclaration[];
  readonly context: CssRuleContext;
}

export type CssDigest = (canonicalIdentity: string) => string;
