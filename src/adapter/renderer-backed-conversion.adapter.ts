import type { LocatedFlexLayoutInput } from '../analyzer/flex-layout-attribute.analyzer';
import type { ConversionRenderer } from '../render/conversion-renderer';
import type { SemanticConversionContext } from '../semantic/conversion-context';
import { ElementSemanticPlanner } from '../semantic/element-semantic.planner';
import type { ConversionAdapter, ConversionContext, PlannedConversion } from './conversion-adapter';

type StandaloneContextReason = (input: LocatedFlexLayoutInput) => string | undefined;

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

function contextUnverified(input: LocatedFlexLayoutInput, reason: string): PlannedConversion {
  return {
    status: 'review',
    input,
    code: 'context-unverified',
    reason,
    suggestion: 'Migrate the complete layout and visibility context together manually.',
  };
}

/** Shared forwarding shell retained only for pre-Slice-8 adapter compatibility. */
export class RendererBackedConversionAdapter implements ConversionAdapter {
  readonly name: 'css' | 'tailwind';
  readonly target: 'css' | 'tailwind';
  private readonly semanticPlanner = new ElementSemanticPlanner();

  constructor(
    protected readonly delegate: ConversionRenderer,
    private readonly standaloneContextReason: StandaloneContextReason = () => undefined,
  ) {
    this.name = delegate.target;
    this.target = delegate.target;
  }

  plan(input: LocatedFlexLayoutInput, context: ConversionContext): PlannedConversion {
    const inputs = context.inputs?.length ? context.inputs : [input];
    const semanticContext = completeContext(context, inputs);
    const reason = this.standaloneContextReason(input);
    const plan =
      reason === undefined
        ? this.semanticPlanner.planInput(input, semanticContext, this.delegate)
        : this.planElement(inputs, semanticContext).find(candidate => candidate.input.id === input.id);
    if (!plan) throw new Error(`${this.name} adapter did not plan input ${input.id}`);
    this.delegate.record([plan]);
    return reason !== undefined && plan.status === 'converted' ? contextUnverified(input, reason) : plan;
  }

  planElement(
    inputs: readonly LocatedFlexLayoutInput[],
    context: ConversionContext,
  ): readonly PlannedConversion[] {
    const semanticContext = completeContext(context, inputs);
    const plans = this.semanticPlanner.plan(inputs, semanticContext, this.delegate);
    const resolved = this.delegate.resolveConflicts(plans, semanticContext);
    this.delegate.record(resolved);
    return resolved;
  }

  resolveClassConflicts(
    plans: readonly PlannedConversion[],
    existingClassNames: readonly string[],
  ): readonly PlannedConversion[] {
    return this.delegate.resolveConflicts(plans, {
      element: {
        id: `${this.name}-adapter-compatibility`,
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

  closePlanDependencies(
    plans: readonly PlannedConversion[],
    context: ConversionContext,
    plansByInputId: ReadonlyMap<string, PlannedConversion>,
  ): readonly PlannedConversion[] {
    return this.semanticPlanner.closeDependencies(
      plans,
      completeContext(context, plans.map(plan => plan.input)),
      plansByInputId,
    );
  }

  acceptPlans(plans: readonly PlannedConversion[]): void {
    this.delegate.record(plans);
  }

  eligibility(input: LocatedFlexLayoutInput): PlannedConversion | undefined {
    return this.delegate.eligibility(input);
  }

  render(plan: Parameters<ConversionRenderer['render']>[0], context: SemanticConversionContext): PlannedConversion {
    return this.delegate.render(plan, context);
  }

  resolveConflicts(
    plans: readonly PlannedConversion[],
    context: SemanticConversionContext,
  ): readonly PlannedConversion[] {
    return this.delegate.resolveConflicts(plans, context);
  }

  record(plans: readonly PlannedConversion[]): void {
    this.delegate.record(plans);
  }
}
