import type { LocatedFlexLayoutInput } from '../../analyzer/flex-layout-attribute.analyzer';
import type { TemplateElement } from '../../template/template.model';

export interface TemplateInputAnalyzer {
  analyze(fileName: string, elements: readonly TemplateElement[]): readonly LocatedFlexLayoutInput[];
}
