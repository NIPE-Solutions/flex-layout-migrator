import type { DiagnosticCode } from '../analyzer/conversion-result';
import type { LocatedFlexLayoutInput } from '../analyzer/flex-layout-attribute.analyzer';
import type { SemanticConversionContext } from '../semantic/conversion-context';

/** Adapter-call compatibility context; responsive planning receives the complete semantic context. */
export interface ConversionContext extends Partial<SemanticConversionContext> {
  readonly element: SemanticConversionContext['element'];
}

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

export interface ConversionAdapter {
  readonly name: 'css' | 'tailwind';
  plan(input: LocatedFlexLayoutInput, context: ConversionContext): PlannedConversion;
  planElement?(inputs: readonly LocatedFlexLayoutInput[], context: ConversionContext): readonly PlannedConversion[];
  resolveClassConflicts?(
    plans: readonly PlannedConversion[],
    existingClassNames: readonly string[],
  ): readonly PlannedConversion[];
  closePlanDependencies?(
    plans: readonly PlannedConversion[],
    context: ConversionContext,
    plansByInputId: ReadonlyMap<string, PlannedConversion>,
  ): readonly PlannedConversion[];
  acceptPlans?(plans: readonly PlannedConversion[]): void;
}
