import type { ConversionResult } from '../analyzer/conversion-result';
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
  | Exclude<ConversionResult, { status: 'converted' | 'parse-error' }>;

export interface ConversionAdapter {
  readonly name: 'css' | 'tailwind';
  plan(input: LocatedFlexLayoutInput, context: ConversionContext): PlannedConversion;
}
