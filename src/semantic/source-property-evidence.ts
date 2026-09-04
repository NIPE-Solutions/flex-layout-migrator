import type { MediaRange } from '../breakpoint/breakpoint-catalog';

export interface SourceStyleDeclaration {
  readonly property: string;
  readonly value: string;
}

export type SourceTokenActivation =
  | { readonly kind: 'base' }
  | { readonly kind: 'media'; readonly range: MediaRange; readonly mediaType?: 'screen' | 'print' };

/** Target-neutral property evidence derived from one literal source class token. */
export interface SourceClassTokenEvidence {
  readonly source: string;
  readonly properties: readonly string[];
  readonly important: boolean;
  readonly activation: SourceTokenActivation;
  readonly display?: string;
}

export type SourceClassTokenClassification =
  | { readonly status: 'verified'; readonly evidence: SourceClassTokenEvidence }
  | { readonly status: 'unverified'; readonly reason: string };

export type SourceStyleDeclarationClassification =
  | { readonly status: 'verified' }
  | { readonly status: 'unverified'; readonly priorityText: boolean };

/**
 * Supplies semantic planning with property/category facts without exposing any
 * target candidate representation or emitter.
 */
export interface SourcePropertyEvidence {
  classifyClassToken(token: string): SourceClassTokenClassification;
  classifyStyleDeclaration(declaration: SourceStyleDeclaration): SourceStyleDeclarationClassification;
}

export const unknownSourcePropertyEvidence: SourcePropertyEvidence = Object.freeze({
  classifyClassToken: (_token: string): SourceClassTokenClassification => ({
    status: 'unverified',
    reason: 'No source class property evidence is available for this conversion target.',
  }),
  classifyStyleDeclaration: (_declaration: SourceStyleDeclaration): SourceStyleDeclarationClassification => ({
    status: 'unverified',
    priorityText: false,
  }),
});
