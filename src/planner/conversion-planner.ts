import type { PlannedConversion } from '../adapter/conversion-adapter';
import type { ConversionResult } from '../analyzer/conversion-result';
import type { LocatedFlexLayoutInput } from '../analyzer/flex-layout-attribute.analyzer';
import type { SourceEdit } from '../edit/source-edit';
import { templateAttributeKeys } from '../template/template-attribute';
import type { SourceRange, TemplateElement } from '../template/template.model';
import { appendLiteralClassNames } from '../edit/html-attribute-value';
import { ResponsiveImagePlanner } from '../image/responsive-image.planner';
import type { ResponsiveImagePlan } from '../image/responsive-image.model';
import { PictureRenderer } from '../image/picture.renderer';
import type { ConversionRenderer } from '../render/conversion-renderer';
import type { SemanticConversionContext } from '../semantic/conversion-context';
import { ElementSemanticPlanner } from '../semantic/element-semantic.planner';
import { SemanticRenderCoordinator } from './semantic-render.coordinator';

export interface FilePlan {
  readonly edits: readonly SourceEdit[];
  readonly results: readonly ConversionResult[];
}

export interface ConversionPlanningOptions {
  readonly responsiveImages: boolean;
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
    'ngClass',
    'class',
    'ngStyle',
    'style',
    'fxShow',
    'fxHide',
  ].map((directive, index) => [directive, index]),
);

function boundClassBlocked(input: LocatedFlexLayoutInput): PlannedConversion {
  return {
    status: 'review',
    input,
    code: 'bound-class',
    reason: 'Generated classes cannot be merged safely with a bound class value.',
    suggestion: 'Merge the generated classes into the binding manually.',
  };
}

function isBoundClassAttribute(attribute: TemplateElement['attributes'][number]): boolean {
  if (attribute.binding !== 'property') return false;
  return [...templateAttributeKeys(attribute)].some(
    key => key === 'class' || key === 'ngclass' || key.startsWith('class.') || key.startsWith('ngclass.'),
  );
}

function literalClassAttribute(element: TemplateElement) {
  return element.attributes.find(
    attribute => attribute.binding === 'literal' && templateAttributeKeys(attribute).has('class'),
  );
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
    renderer: ConversionRenderer,
    options: ConversionPlanningOptions = { responsiveImages: false },
    semanticPlanner: ElementSemanticPlanner = new ElementSemanticPlanner(renderer.breakpointConfig),
  ): FilePlan {
    const coordinator = new SemanticRenderCoordinator(renderer, semanticPlanner);
    const elementById = new Map(elements.map(element => [element.id, element]));
    const inputsByElementId = new Map<string, LocatedFlexLayoutInput[]>();
    for (const input of inputs) {
      const elementInputs = inputsByElementId.get(input.elementId) ?? [];
      elementInputs.push(input);
      inputsByElementId.set(input.elementId, elementInputs);
    }
    const conversionsByElement = new Map<string, ElementConversions>();
    const results: ConversionResult[] = [];
    const plansByInputId = new Map<string, PlannedConversion>();
    const plansByElementId = new Map<string, readonly PlannedConversion[]>();
    const contextsByElementId = new Map<string, SemanticConversionContext>();
    const imagePlansByElementId = new Map<string, ResponsiveImagePlan>();

    for (const element of elements) {
      const allElementInputs = inputsByElementId.get(element.id) ?? [];
      if (!allElementInputs.length) continue;
      const elementInputs = allElementInputs.filter(input => input.directive !== 'imgSrc');
      if (!elementInputs.length) continue;
      const parent = element.parentId ? elementById.get(element.parentId) : undefined;
      const literalClass = literalClassAttribute(element);
      const existingClassNames = literalClass?.value.split(/\s+/).filter(Boolean) ?? [];
      const context: SemanticConversionContext = {
        element,
        inputs: elementInputs,
        existingClassNames,
        attributeEvidence: element.attributes,
        ...(parent
          ? { parent, parentInputs: inputsByElementId.get(parent.id) ?? [] }
          : { parentInputs: [] as readonly LocatedFlexLayoutInput[] }),
      };
      let plans = coordinator.planElement(elementInputs, context, false);
      const hasBoundClass = element.attributes.some(isBoundClassAttribute);
      if (hasBoundClass) {
        plans = plans.map(plan =>
          plan.status === 'converted' && plan.classNames.length > 0 ? boundClassBlocked(plan.input) : plan,
        );
      }
      contextsByElementId.set(element.id, context);
      plansByElementId.set(element.id, plans);
      for (const planned of plans) plansByInputId.set(planned.input.id, planned);
    }

    for (const element of elements) {
      const plans = plansByElementId.get(element.id);
      const context = contextsByElementId.get(element.id);
      if (!plans || !context) continue;
      const closedPlans = coordinator.closeDependencies(plans, context, plansByInputId);
      for (const planned of closedPlans) plansByInputId.set(planned.input.id, planned);
    }

    for (const element of elements) {
      const imageInputs = (inputsByElementId.get(element.id) ?? []).filter(input => input.directive === 'imgSrc');
      if (!imageInputs.length) continue;
      const ancestors: TemplateElement[] = [];
      let ancestor = element.parentId ? elementById.get(element.parentId) : undefined;
      while (ancestor) {
        ancestors.push(ancestor);
        ancestor = ancestor.parentId ? elementById.get(ancestor.parentId) : undefined;
      }
      const imageResult = new ResponsiveImagePlanner().plan(
        imageInputs,
        { element, ancestors },
        options.responsiveImages,
      );
      const ordinaryPlans = (inputsByElementId.get(element.id) ?? [])
        .filter(input => input.directive !== 'imgSrc')
        .map(input => plansByInputId.get(input.id))
        .filter((plan): plan is PlannedConversion => plan !== undefined);
      const unresolvedOrdinary = ordinaryPlans.some(plan => plan.status !== 'converted');

      if (imageResult.status === 'unresolved') {
        for (const plan of imageResult.plans) plansByInputId.set(plan.input.id, plan);
        continue;
      }

      if (!unresolvedOrdinary) {
        imagePlansByElementId.set(element.id, imageResult.plan);
        for (const input of imageInputs) {
          plansByInputId.set(input.id, { status: 'converted', input, classNames: [] });
        }
        continue;
      }

      const familyFailure = {
        status: 'review' as const,
        code: 'context-unverified' as const,
        reason: 'Responsive image and same-element conversions must be applied atomically.',
        suggestion: 'Resolve all conversions on this image before enabling its picture migration.',
      };
      for (const plan of ordinaryPlans) {
        if (plan.status === 'converted') plansByInputId.set(plan.input.id, { ...familyFailure, input: plan.input });
      }
      for (const input of imageInputs) plansByInputId.set(input.id, { ...familyFailure, input });
    }

    renderer.record(
      inputs.map(input => plansByInputId.get(input.id)).filter((plan): plan is PlannedConversion => plan !== undefined),
    );

    for (const input of inputs) {
      const element = elementById.get(input.elementId);
      if (!element) continue;
      const planned = plansByInputId.get(input.id);
      if (!planned) continue;

      if (planned.status !== 'converted') {
        results.push(planned);
        continue;
      }

      if (input.directive === 'imgSrc') {
        results.push({ status: 'converted', input });
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

      const classEdit = appendLiteralClassNames(
        source,
        conversion.element,
        literalClassAttribute(conversion.element),
        generatedClassNames,
        `${conversion.element.id}:classes`,
      );
      if (classEdit !== undefined) edits.push(classEdit);
    }

    for (const [elementId, imagePlan] of imagePlansByElementId) {
      const containedEdits = edits.filter(
        edit => edit.range.start >= imagePlan.element.source.start && edit.range.end <= imagePlan.element.source.end,
      );
      const externalEdits = edits.filter(edit => !containedEdits.includes(edit));
      edits.length = 0;
      edits.push(...externalEdits, {
        range: imagePlan.element.source,
        text: new PictureRenderer().render(source, imagePlan, containedEdits),
        inputId: `${elementId}:responsive-image`,
      });
    }

    return { edits, results };
  }
}
