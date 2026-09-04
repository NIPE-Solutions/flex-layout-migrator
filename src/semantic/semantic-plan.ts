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
  | { readonly kind: 'base' }
  | { readonly kind: 'media'; readonly definition: BreakpointDefinition };

export interface VisibilitySemantics {
  readonly intent: 'shown' | 'hidden';
}

export interface ExtendedClassSemantics {
  readonly kind: 'extended-class';
  readonly source: string;
}

export interface ExtendedStyleSemantics {
  readonly kind: 'extended-style';
  readonly source: string;
}

export interface EmptySemantics {
  readonly kind: 'empty';
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
}

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

export function directiveFamily(
  directive: LocatedFlexLayoutInput['directive'],
): DirectiveFamily | undefined {
  return familyByDirective.get(directive);
}
