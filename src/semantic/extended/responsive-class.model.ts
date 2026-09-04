import type { LocatedFlexLayoutInput } from '../../analyzer/flex-layout-attribute.analyzer';
import type { BreakpointDefinition } from '../../breakpoint/breakpoint-catalog';
import type { UnresolvedSemanticPlan } from '../semantic-plan';

export interface ResponsiveClassValue {
  readonly tokens: readonly string[];
}

export type ResponsiveClassValueResult =
  | { readonly status: 'parsed'; readonly value: ResponsiveClassValue }
  | { readonly status: 'unverified'; readonly token?: string; readonly reason: string };

export interface ExtendedResponsiveState<T> {
  readonly input: LocatedFlexLayoutInput;
  readonly activation: { readonly kind: 'media'; readonly definition: BreakpointDefinition };
  readonly value: T;
}

export type ExtendedResponsiveKind = 'class' | 'style';

export type ExtendedFamilyPlan<T> =
  | { readonly status: 'converted'; readonly states: readonly ExtendedResponsiveState<T>[] }
  | { readonly status: 'unresolved'; readonly plans: readonly UnresolvedSemanticPlan[] };

export interface ExtendedFamilyPlanRequest<T> {
  readonly kind: ExtendedResponsiveKind;
  readonly inputs: readonly LocatedFlexLayoutInput[];
  readonly valueParser: (
    input: LocatedFlexLayoutInput,
  ) =>
    | { readonly status: 'parsed'; readonly value: T }
    | { readonly status: 'unverified'; readonly token?: string; readonly reason: string };
  readonly equals: (left: T, right: T) => boolean;
}
