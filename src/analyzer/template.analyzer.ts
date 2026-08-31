import type { TemplateElement } from '../template/template.model';
import { analyzeFlexLayoutAttribute, LocatedFlexLayoutInput } from './flex-layout-attribute.analyzer';

export class TemplateAnalyzer {
  analyze(fileName: string, elements: readonly TemplateElement[]): readonly LocatedFlexLayoutInput[] {
    const inputs: LocatedFlexLayoutInput[] = [];

    for (const element of elements) {
      for (const attribute of element.attributes) {
        const sourceName = attribute.binding === 'property' ? `[${attribute.name}]` : attribute.name;
        const input = analyzeFlexLayoutAttribute(sourceName, attribute.value);
        if (!input) continue;

        inputs.push({
          ...input,
          id: `${fileName}:${attribute.source.start}`,
          fileName,
          elementId: element.id,
          source: attribute.source,
          nameSource: attribute.nameSource,
          ...(attribute.valueSource ? { valueSource: attribute.valueSource } : {}),
        });
      }
    }

    return inputs.sort((left, right) => left.source.start - right.source.start);
  }
}
