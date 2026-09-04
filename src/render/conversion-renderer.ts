import type { LocatedFlexLayoutInput } from '../analyzer/flex-layout-attribute.analyzer';
import type { PlannedConversion } from '../adapter/conversion-adapter';
import type { BreakpointMigrationConfig } from '../config/breakpoint-migration-config';
import type { SemanticConversionContext } from '../semantic/conversion-context';
import type { ResolvedSemanticPlan } from '../semantic/semantic-plan';
import type { SourcePropertyEvidence } from '../semantic/source-property-evidence';

export interface RenderedConversion {
  readonly status: 'converted';
  readonly input: LocatedFlexLayoutInput;
  readonly classNames: readonly string[];
}

export interface ConversionRenderer {
  readonly target: 'tailwind' | 'css';
  readonly breakpointConfig?: BreakpointMigrationConfig;
  readonly sourcePropertyEvidence?: SourcePropertyEvidence;
  eligibility(input: LocatedFlexLayoutInput): PlannedConversion | undefined;
  render(plan: ResolvedSemanticPlan, context: SemanticConversionContext): PlannedConversion;
  resolveConflicts(
    plans: readonly PlannedConversion[],
    context: SemanticConversionContext,
  ): readonly PlannedConversion[];
  record(plans: readonly PlannedConversion[]): void;
}
