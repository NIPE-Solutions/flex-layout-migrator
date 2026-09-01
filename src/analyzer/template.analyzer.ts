import type { TemplateElement } from '../template/template.model';
import { analyzeFlexLayoutAttribute, LocatedFlexLayoutInput } from './flex-layout-attribute.analyzer';
import { isKnownBreakpoint } from './flex-layout.catalog';

function sourceNameFor(attribute: TemplateElement['attributes'][number]): string | undefined {
  if (attribute.binding === 'literal') return attribute.name;
  if (attribute.bindingTarget === 'property' || attribute.bindingTarget === 'two-way') return `[${attribute.name}]`;
  if (
    (attribute.bindingTarget === 'class' || attribute.bindingTarget === 'style') &&
    isKnownBreakpoint(attribute.name)
  ) {
    return `[${attribute.bindingTarget}.${attribute.name}]`;
  }
  return undefined;
}

export class TemplateAnalyzer {
  analyze(fileName: string, elements: readonly TemplateElement[]): readonly LocatedFlexLayoutInput[] {
    const inputs: LocatedFlexLayoutInput[] = [];

    for (const element of elements) {
      for (const attribute of element.attributes) {
        const sourceName = sourceNameFor(attribute);
        if (!sourceName) continue;
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
