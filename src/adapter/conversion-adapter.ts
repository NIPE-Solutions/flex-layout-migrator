import type { DiagnosticCode } from '../analyzer/conversion-result';
import type { LocatedFlexLayoutInput } from '../analyzer/flex-layout-attribute.analyzer';
import type { SemanticConversionContext } from '../semantic/conversion-context';
import type { ConversionRenderer } from '../render/conversion-renderer';

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

/** @deprecated Use ConversionRenderer. Remove after Slice 8 compatibility cleanup. */
export interface ConversionAdapter extends ConversionRenderer {
  readonly name: 'css' | 'tailwind';
  plan(input: LocatedFlexLayoutInput, context: ConversionContext): PlannedConversion;
  resolveClassConflicts?(
    plans: readonly PlannedConversion[],
    existingClassNames: readonly string[],
  ): readonly PlannedConversion[];
}
