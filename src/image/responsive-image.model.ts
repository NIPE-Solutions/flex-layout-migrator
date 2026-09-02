import type { PlannedConversion } from '../adapter/conversion-adapter';
import type { LocatedFlexLayoutInput } from '../analyzer/flex-layout-attribute.analyzer';
import type { BreakpointDefinition } from '../breakpoint/breakpoint-catalog';
import type { TemplateElement } from '../template/template.model';

export interface ResponsiveImageSource {
  readonly input: LocatedFlexLayoutInput;
  readonly definition: BreakpointDefinition;
  readonly url: string;
}

export interface ResponsiveImagePlan {
  readonly element: TemplateElement;
  readonly sources: readonly ResponsiveImageSource[];
  readonly fallback: 'literal' | 'bound' | 'absent';
}

export interface ResponsiveImageContext {
  readonly element: TemplateElement;
  readonly ancestors: readonly TemplateElement[];
}

export type ResponsiveImagePlanningResult =
  | { readonly status: 'converted'; readonly plan: ResponsiveImagePlan }
  | { readonly status: 'unresolved'; readonly plans: readonly PlannedConversion[] };
