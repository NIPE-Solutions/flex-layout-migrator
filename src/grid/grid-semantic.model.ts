export type GridProperty =
  | 'align-content'
  | 'align-items'
  | 'justify-content'
  | 'justify-items'
  | 'grid-template-areas'
  | 'grid-auto-flow'
  | 'grid-template-columns'
  | 'grid-auto-columns'
  | 'grid-template-rows'
  | 'grid-auto-rows'
  | 'grid-gap'
  | 'grid-area'
  | 'grid-column'
  | 'grid-row'
  | 'justify-self'
  | 'align-self';

export interface GridDeclaration {
  readonly property: GridProperty;
  readonly value: string;
}

export interface GridSemanticPlan {
  readonly role: 'container' | 'child' | 'modifier';
  readonly declarations: readonly GridDeclaration[];
  readonly displayDependency: boolean;
  readonly inline?: boolean;
}

export type GridParseResult =
  | { readonly status: 'parsed'; readonly plan: GridSemanticPlan }
  | { readonly status: 'review'; readonly code: 'dynamic-binding'; readonly reason: string }
  | { readonly status: 'invalid'; readonly code: 'invalid-value'; readonly reason: string };
