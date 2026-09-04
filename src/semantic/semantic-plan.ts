import type { DiagnosticCode } from '../analyzer/conversion-result';
import type { LocatedFlexLayoutInput } from '../analyzer/flex-layout-attribute.analyzer';

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
