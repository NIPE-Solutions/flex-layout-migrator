import type { LocatedFlexLayoutInput } from '../analyzer/flex-layout-attribute.analyzer';
import type { DiagnosticCode } from '../analyzer/conversion-result';
import type { BreakpointMigrationConfig } from '../config/breakpoint-migration-config';
import type { SemanticConversionContext } from '../semantic/conversion-context';
import type { ResolvedSemanticPlan } from '../semantic/semantic-plan';
import type { SourcePropertyEvidence } from '../semantic/source-property-evidence';

export type PlannedConversion =
  | {
      readonly status: 'converted';
      readonly input: LocatedFlexLayoutInput;
      readonly classNames: readonly string[];
      /** Class tokens retained in a source authority rather than emitted by this plan. */
      readonly retainedClassNames?: readonly string[];
    }
  | {
      readonly status: 'review' | 'unsupported' | 'invalid';
      readonly input: LocatedFlexLayoutInput;
      readonly code: DiagnosticCode;
      readonly reason: string;
      readonly suggestion: string;
    };

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
