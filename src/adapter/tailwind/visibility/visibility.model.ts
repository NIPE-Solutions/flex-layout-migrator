import type { LocatedFlexLayoutInput } from '../../../analyzer/flex-layout-attribute.analyzer';
import type { BreakpointDefinition } from '../../../breakpoint/breakpoint-catalog';

export type VisibilityIntent = 'shown' | 'hidden';

export type VisibilityActivation =
  { readonly kind: 'base' } | { readonly kind: 'media'; readonly definition: BreakpointDefinition };

export interface VisibilityState {
  readonly input: LocatedFlexLayoutInput;
  readonly intent: VisibilityIntent;
  readonly activation: VisibilityActivation;
}
