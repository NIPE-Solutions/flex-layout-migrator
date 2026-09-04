import type { LocatedFlexLayoutInput } from '../analyzer/flex-layout-attribute.analyzer';
import type { ConversionContext, PlannedConversion } from '../adapter/conversion-adapter';
import type { ConversionRenderer } from '../render/conversion-renderer';
import type { SemanticConversionContext } from '../semantic/conversion-context';
import { ElementSemanticPlanner } from '../semantic/element-semantic.planner';

const familyContextDirectives = new Set<LocatedFlexLayoutInput['directive']>([
  'fxShow',
  'fxHide',
  'class',
  'ngClass',
  'style',
  'ngStyle',
]);

function completeContext(
  context: ConversionContext,
  inputs: readonly LocatedFlexLayoutInput[],
): SemanticConversionContext {
  return {
    ...context,
    inputs,
    parentInputs: context.parentInputs ?? [],
    existingClassNames: context.existingClassNames ?? [],
    attributeEvidence: context.attributeEvidence ?? context.element.attributes,
  };
}

function standaloneContextReason(renderer: ConversionRenderer, input: LocatedFlexLayoutInput): string | undefined {
  if (renderer.target !== 'tailwind' || !familyContextDirectives.has(input.directive)) return undefined;
  return input.directive === 'fxShow' || input.directive === 'fxHide'
    ? 'Visibility requires complete element-family context before conversion.'
    : 'Responsive class and style conversion requires complete element-family context.';
}

function contextUnverified(input: LocatedFlexLayoutInput, reason: string): PlannedConversion {
  return {
    status: 'review',
    input,
    code: 'context-unverified',
    reason,
    suggestion: 'Migrate the complete layout and visibility context together manually.',
  };
}

/** One production coordinator shared by the file planner and deprecated adapter facade. */
export class SemanticRenderCoordinator {
  private readonly semanticPlanner: ElementSemanticPlanner;

  constructor(
    readonly renderer: ConversionRenderer,
    semanticPlanner: ElementSemanticPlanner = new ElementSemanticPlanner(renderer.breakpointConfig),
  ) {
    this.semanticPlanner = semanticPlanner;
  }

  plan(input: LocatedFlexLayoutInput, context: ConversionContext): PlannedConversion {
    const inputs = context.inputs?.length ? context.inputs : [input];
    const semanticContext = completeContext(context, inputs);
    const reason = standaloneContextReason(this.renderer, input);
    const plan = this.planElement(inputs, semanticContext, false).find(candidate => candidate.input.id === input.id);
    if (!plan) throw new Error(`${this.renderer.target} renderer did not plan input ${input.id}`);
    const result = reason !== undefined && plan.status === 'converted' ? contextUnverified(input, reason) : plan;
    this.renderer.record([result]);
    return result;
  }

  planElement(
    inputs: readonly LocatedFlexLayoutInput[],
    context: ConversionContext,
    record = true,
  ): readonly PlannedConversion[] {
    const semanticContext = completeContext(context, inputs);
    const plans = this.semanticPlanner.plan(inputs, semanticContext, this.renderer);
    const resolved = this.renderer.resolveConflicts(plans, semanticContext);
    if (record) this.renderer.record(resolved);
    return resolved;
  }

  resolveClassConflicts(
    plans: readonly PlannedConversion[],
    existingClassNames: readonly string[],
  ): readonly PlannedConversion[] {
    return this.renderer.resolveConflicts(plans, {
      element: {
        id: `${this.renderer.target}-adapter-compatibility`,
        name: 'div',
        source: { start: 0, end: 0 },
        startTag: { start: 0, end: 0 },
        structural: false,
        attributes: [],
      },
      inputs: plans.map(plan => plan.input),
      parentInputs: [],
      existingClassNames,
      attributeEvidence: [],
    });
  }

  closeDependencies(
    plans: readonly PlannedConversion[],
    context: ConversionContext,
    plansByInputId: ReadonlyMap<string, PlannedConversion>,
  ): readonly PlannedConversion[] {
    return this.semanticPlanner.closeDependencies(
      plans,
      completeContext(
        context,
        plans.map(plan => plan.input),
      ),
      plansByInputId,
      this.renderer.sourcePropertyEvidence,
    );
  }
}
