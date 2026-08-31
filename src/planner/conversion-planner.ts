import type { ConversionAdapter } from '../adapter/conversion-adapter';
import type { ConversionResult } from '../analyzer/conversion-result';
import type { LocatedFlexLayoutInput } from '../analyzer/flex-layout-attribute.analyzer';
import type { SourceEdit } from '../edit/source-edit';
import type { SourceRange, TemplateElement } from '../template/template.model';

export interface FilePlan {
  readonly edits: readonly SourceEdit[];
  readonly results: readonly ConversionResult[];
}

interface ElementConversions {
  readonly element: TemplateElement;
  readonly inputs: LocatedFlexLayoutInput[];
  readonly classNames: string[];
}

function removalRange(source: string, input: LocatedFlexLayoutInput): SourceRange {
  const start =
    input.source.start > 0 && /[\t ]/.test(source[input.source.start - 1] ?? '')
      ? input.source.start - 1
      : input.source.start;
  return { start, end: input.source.end };
}

export class ConversionPlanner {
  plan(
    source: string,
    elements: readonly TemplateElement[],
    inputs: readonly LocatedFlexLayoutInput[],
    adapter: ConversionAdapter,
  ): FilePlan {
    const elementById = new Map(elements.map(element => [element.id, element]));
    const conversionsByElement = new Map<string, ElementConversions>();
    const results: ConversionResult[] = [];

    for (const input of inputs) {
      const element = elementById.get(input.elementId);
      if (!element) continue;
      const parent = element.parentId ? elementById.get(element.parentId) : undefined;
      const planned = adapter.plan(input, { element, ...(parent ? { parent } : {}) });

      if (planned.status !== 'converted') {
        results.push(planned);
        continue;
      }

      const hasLiteralClass = element.attributes.some(
        attribute => attribute.name === 'class' && attribute.binding === 'literal',
      );
      const hasBoundClass = element.attributes.some(
        attribute => attribute.name === 'class' && attribute.binding === 'property',
      );
      if (hasBoundClass && !hasLiteralClass) {
        results.push({
          status: 'review',
          input,
          code: 'bound-class',
          reason: 'Generated classes cannot be merged safely with a bound class value.',
          suggestion: 'Merge the generated classes into the binding manually.',
        });
        continue;
      }

      const conversion = conversionsByElement.get(element.id) ?? {
        element,
        inputs: [],
        classNames: [],
      };
      conversion.inputs.push(input);
      conversion.classNames.push(...planned.classNames);
      conversionsByElement.set(element.id, conversion);
      results.push({ status: 'converted', input });
    }

    const edits: SourceEdit[] = [];
    for (const conversion of conversionsByElement.values()) {
      edits.push(
        ...conversion.inputs.map(input => ({
          range: removalRange(source, input),
          text: '',
          inputId: input.id,
        })),
      );

      const classAttribute = conversion.element.attributes.find(
        attribute => attribute.name === 'class' && attribute.binding === 'literal',
      );
      if (classAttribute?.valueSource) {
        const classNames = [
          ...new Set([...classAttribute.value.split(/\s+/).filter(Boolean), ...conversion.classNames]),
        ];
        edits.push({
          range: classAttribute.valueSource,
          text: classNames.join(' '),
          inputId: `${conversion.element.id}:classes`,
        });
      } else {
        const startTag = source.slice(conversion.element.startTag.start, conversion.element.startTag.end);
        const insertionOffset = conversion.element.startTag.end - (startTag.endsWith('/>') ? 2 : 1);
        edits.push({
          range: { start: insertionOffset, end: insertionOffset },
          text: ` class="${[...new Set(conversion.classNames)].join(' ')}"`,
          inputId: `${conversion.element.id}:classes`,
        });
      }
    }

    return { edits, results };
  }
}
