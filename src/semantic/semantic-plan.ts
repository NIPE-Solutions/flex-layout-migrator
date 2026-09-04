import type { DiagnosticCode } from '../analyzer/conversion-result';
import type { LocatedFlexLayoutInput } from '../analyzer/flex-layout-attribute.analyzer';
import type { BreakpointDefinition } from '../breakpoint/breakpoint-catalog';
import type { FlexAlignSemantics } from '../flex/flex-align.semantic';
import type { FlexFillSemantics } from '../flex/flex-fill.semantic';
import type { FlexItemSemantics } from '../flex/flex-item.semantic';
import type { FlexOffsetSemantics } from '../flex/flex-offset.semantic';
import type { FlexOrderSemantics } from '../flex/flex-order.semantic';
import type { LayoutAlignmentSemantics } from '../flex/layout-align.semantic';
import type { LayoutGapSemantics } from '../flex/layout-gap.semantic';
import type { LayoutSemantics } from '../flex/layout.semantic';
import type { GridSemanticPlan } from '../grid/grid-semantic.model';
import type { SourceClassTokenEvidence } from './source-property-evidence';

export type DirectiveFamily =
  | 'layout'
  | 'layout-gap'
  | 'layout-align'
  | 'flex-item'
  | 'flex-align'
  | 'flex-fill'
  | 'flex-offset'
  | 'flex-order'
  | 'visibility'
  | 'extended-class'
  | 'extended-style'
  | 'grid-align-columns'
  | 'grid-align-rows'
  | 'grid-area'
  | 'grid-areas'
  | 'grid-auto'
  | 'grid-column'
  | 'grid-columns'
  | 'grid-gap'
  | 'grid-align'
  | 'grid-inline'
  | 'grid-row'
  | 'grid-rows';

export type SemanticPlan<TValue> =
  | {
      readonly status: 'planned';
      readonly input: LocatedFlexLayoutInput;
      readonly family: DirectiveFamily;
      readonly value: TValue;
    }
  | {
      readonly status: 'review' | 'invalid' | 'unsupported';
      readonly input: LocatedFlexLayoutInput;
      readonly code: DiagnosticCode;
      readonly reason: string;
      readonly suggestion: string;
    };

export type SemanticActivation =
  { readonly kind: 'base' } | { readonly kind: 'media'; readonly definition: BreakpointDefinition };

export interface VisibilitySemantics {
  readonly kind: 'visibility';
  readonly emit: boolean;
  readonly states: readonly VisibilitySemanticState[];
  readonly restorationDisplay?: string;
}

export interface VisibilitySemanticState {
  readonly intent: 'shown' | 'hidden';
  readonly activation: SemanticActivation;
}

export interface ExtendedClassSemanticState {
  readonly activations: readonly SemanticActivation[];
  readonly tokens: readonly SourceClassTokenEvidence[];
}

export interface ExtendedClassSemantics {
  readonly kind: 'extended-class';
  readonly emit: boolean;
  readonly states: readonly ExtendedClassSemanticState[];
  readonly retainedTokens: readonly SourceClassTokenEvidence[];
}

export interface ExtendedStyleDeclaration {
  readonly property: string;
  readonly value: string;
}

export interface ExtendedStyleSemanticState {
  readonly activations: readonly SemanticActivation[];
  readonly declarations: readonly ExtendedStyleDeclaration[];
}

export interface ExtendedStyleSemantics {
  readonly kind: 'extended-style';
  readonly emit: boolean;
  readonly states: readonly ExtendedStyleSemanticState[];
}

export interface EmptySemantics {
  readonly kind: 'empty';
}

export interface SuppressedSemanticEffect {
  readonly activation: SemanticActivation;
  readonly properties: readonly string[];
  readonly important: boolean;
}

export type ResolvedSemanticValue =
  | LayoutSemantics
  | LayoutGapSemantics
  | LayoutAlignmentSemantics
  | FlexItemSemantics
  | FlexAlignSemantics
  | FlexFillSemantics
  | FlexOffsetSemantics
  | FlexOrderSemantics
  | GridSemanticPlan
  | VisibilitySemantics
  | ExtendedClassSemantics
  | ExtendedStyleSemantics
  | EmptySemantics;

/** A target-free semantic decision ready for exactly one target renderer. */
export interface ResolvedSemanticPlan {
  readonly status: 'converted';
  readonly input: LocatedFlexLayoutInput;
  readonly family: DirectiveFamily;
  readonly value: ResolvedSemanticValue;
  readonly activations: readonly SemanticActivation[];
  readonly suppressedProperties?: readonly string[];
  readonly suppressedEffects?: readonly SuppressedSemanticEffect[];
  readonly emitGridDisplay?: boolean;
}

/** A target-free diagnostic produced while resolving semantic meaning and dependencies. */
export interface UnresolvedSemanticPlan {
  readonly status: 'review' | 'invalid' | 'unsupported';
  readonly input: LocatedFlexLayoutInput;
  readonly code: DiagnosticCode;
  readonly reason: string;
  readonly suggestion: string;
}

/** The complete target-independent outcome of semantic planning. */
export type SemanticPlanningPlan = ResolvedSemanticPlan | UnresolvedSemanticPlan;

/** Lets dependency closure operate on semantic plans before rendering and target plans afterward. */
export type SemanticDependencyPlan<
  TConverted extends { readonly status: 'converted'; readonly input: LocatedFlexLayoutInput },
> = TConverted | UnresolvedSemanticPlan;

const familyByDirective = new Map<LocatedFlexLayoutInput['directive'], DirectiveFamily>([
  ['fxLayout', 'layout'],
  ['fxLayoutGap', 'layout-gap'],
  ['fxLayoutAlign', 'layout-align'],
  ['fxFlex', 'flex-item'],
  ['fxGrow', 'flex-item'],
  ['fxShrink', 'flex-item'],
  ['fxFlexAlign', 'flex-align'],
  ['fxFlexFill', 'flex-fill'],
  ['fxFill', 'flex-fill'],
  ['fxFlexOffset', 'flex-offset'],
  ['fxFlexOrder', 'flex-order'],
  ['fxShow', 'visibility'],
  ['fxHide', 'visibility'],
  ['class', 'extended-class'],
  ['ngClass', 'extended-class'],
  ['style', 'extended-style'],
  ['ngStyle', 'extended-style'],
  ['gdAlignColumns', 'grid-align-columns'],
  ['gdAlignRows', 'grid-align-rows'],
  ['gdArea', 'grid-area'],
  ['gdAreas', 'grid-areas'],
  ['gdAuto', 'grid-auto'],
  ['gdColumn', 'grid-column'],
  ['gdColumns', 'grid-columns'],
  ['gdGap', 'grid-gap'],
  ['gdGridAlign', 'grid-align'],
  ['gdInline', 'grid-inline'],
  ['gdRow', 'grid-row'],
  ['gdRows', 'grid-rows'],
]);

export function directiveFamily(directive: LocatedFlexLayoutInput['directive']): DirectiveFamily | undefined {
  return familyByDirective.get(directive);
}
