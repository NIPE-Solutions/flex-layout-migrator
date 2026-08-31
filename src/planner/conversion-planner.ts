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
  readonly classPlans: Array<{
    readonly input: LocatedFlexLayoutInput;
    readonly classNames: readonly string[];
  }>;
}

const directiveOrder = new Map(
  [
    'fxLayout',
    'fxLayoutGap',
    'fxLayoutAlign',
    'fxFlex',
    'fxGrow',
    'fxShrink',
    'fxFlexAlign',
    'fxFlexFill',
    'fxFill',
    'fxFlexOffset',
    'fxFlexOrder',
  ].map((directive, index) => [directive, index]),
);

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
    const inputsByElementId = new Map<string, LocatedFlexLayoutInput[]>();
    for (const input of inputs) {
      const elementInputs = inputsByElementId.get(input.elementId) ?? [];
      elementInputs.push(input);
      inputsByElementId.set(input.elementId, elementInputs);
    }
    const conversionsByElement = new Map<string, ElementConversions>();
    const results: ConversionResult[] = [];
    const plansByInputId = new Map<string, ReturnType<ConversionAdapter['plan']>>();

    for (const element of elements) {
      const elementInputs = inputsByElementId.get(element.id) ?? [];
      if (!elementInputs.length) continue;
      const parent = element.parentId ? elementById.get(element.parentId) : undefined;
      const context = {
        element,
        inputs: elementInputs,
        ...(parent
          ? { parent, parentInputs: inputsByElementId.get(parent.id) ?? [] }
          : { parentInputs: [] as readonly LocatedFlexLayoutInput[] }),
      };
      let plans =
        adapter.planElement?.(elementInputs, context) ?? elementInputs.map(input => adapter.plan(input, context));
      const literalClass = element.attributes.find(
        attribute => attribute.name === 'class' && attribute.binding === 'literal',
      );
      const existingClassNames = literalClass?.value.split(/\s+/).filter(Boolean) ?? [];
      plans = adapter.resolveClassConflicts?.(plans, existingClassNames) ?? plans;
      for (const planned of plans) plansByInputId.set(planned.input.id, planned);
    }

    for (const input of inputs) {
      const element = elementById.get(input.elementId);
      if (!element) continue;
      const planned = plansByInputId.get(input.id);
      if (!planned) continue;

      if (planned.status !== 'converted') {
        results.push(planned);
        continue;
      }

      const hasBoundClass = element.attributes.some(
        attribute => attribute.name === 'class' && attribute.binding === 'property',
      );
      if (hasBoundClass) {
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
        classPlans: [],
      };
      conversion.inputs.push(input);
      conversion.classPlans.push({ input, classNames: planned.classNames });
      conversionsByElement.set(element.id, conversion);
      results.push({ status: 'converted', input });
    }

    const edits: SourceEdit[] = [];
    for (const conversion of conversionsByElement.values()) {
      const generatedClassNames = [...conversion.classPlans]
        .sort(
          (left, right) =>
            (directiveOrder.get(left.input.directive) ?? Number.MAX_SAFE_INTEGER) -
              (directiveOrder.get(right.input.directive) ?? Number.MAX_SAFE_INTEGER) ||
            (left.input.breakpoint ?? '').localeCompare(right.input.breakpoint ?? '') ||
            left.input.source.start - right.input.source.start,
        )
        .flatMap(plan => plan.classNames);
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
        const classNames = [...new Set([...classAttribute.value.split(/\s+/).filter(Boolean), ...generatedClassNames])];
        edits.push({
          range: classAttribute.valueSource,
          text: classNames.join(' '),
          inputId: `${conversion.element.id}:classes`,
        });
      } else {
        const startTag = source.slice(conversion.element.startTag.start, conversion.element.startTag.end);
        const selfClosing = startTag.endsWith('/>');
        const insertionOffset = conversion.element.startTag.end - (selfClosing ? 2 : 1);
        const hasClosingWhitespace = /\s/.test(source[insertionOffset - 1] ?? '');
        const classAttributeText = `class="${[...new Set(generatedClassNames)].join(' ')}"`;
        edits.push({
          range: { start: insertionOffset, end: insertionOffset },
          text: selfClosing && hasClosingWhitespace ? `${classAttributeText} ` : ` ${classAttributeText}`,
          inputId: `${conversion.element.id}:classes`,
        });
      }
    }

    return { edits, results };
  }
}
