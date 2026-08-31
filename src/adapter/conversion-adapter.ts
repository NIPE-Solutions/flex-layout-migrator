import type { DiagnosticCode } from '../analyzer/conversion-result';
import type { LocatedFlexLayoutInput } from '../analyzer/flex-layout-attribute.analyzer';
import type { TemplateElement } from '../template/template.model';

export interface ConversionContext {
  readonly element: TemplateElement;
  readonly parent?: TemplateElement;
}

export type PlannedConversion =
  | {
      readonly status: 'converted';
      readonly input: LocatedFlexLayoutInput;
      readonly classNames: readonly string[];
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
}
