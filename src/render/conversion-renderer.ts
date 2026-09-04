import type { LocatedFlexLayoutInput } from '../analyzer/flex-layout-attribute.analyzer';
import type { PlannedConversion } from '../adapter/conversion-adapter';
import type { SemanticConversionContext } from '../semantic/conversion-context';
import type { ResolvedSemanticPlan } from '../semantic/semantic-plan';

export interface RenderedConversion {
  readonly status: 'converted';
  readonly input: LocatedFlexLayoutInput;
  readonly classNames: readonly string[];
}

export interface ConversionRenderer {
  readonly target: 'tailwind' | 'css';
  eligibility(input: LocatedFlexLayoutInput): PlannedConversion | undefined;
  render(plan: ResolvedSemanticPlan, context: SemanticConversionContext): PlannedConversion;
  resolveConflicts(
    plans: readonly PlannedConversion[],
    context: SemanticConversionContext,
  ): readonly PlannedConversion[];
  record(plans: readonly PlannedConversion[]): void;
}
