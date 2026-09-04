import type { LocatedFlexLayoutInput } from '../analyzer/flex-layout-attribute.analyzer';
import type { ConversionContext, PlannedConversion } from '../adapter/conversion-adapter';
import type { ConversionRenderer } from '../render/conversion-renderer';
import type { SemanticConversionContext } from '../semantic/conversion-context';
import { ElementSemanticPlanner } from '../semantic/element-semantic.planner';
import type { ResolvedSemanticPlan, UnresolvedSemanticPlan } from '../semantic/semantic-plan';

type TargetDiagnostic = Exclude<PlannedConversion, { readonly status: 'converted' }>;

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
    semanticPlanner: ElementSemanticPlanner = new ElementSemanticPlanner(
      renderer.breakpointConfig,
      renderer.sourcePropertyEvidence,
    ),
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
    this.record([result]);
    return result;
  }

  planElement(
    inputs: readonly LocatedFlexLayoutInput[],
    context: ConversionContext,
    record = true,
  ): readonly PlannedConversion[] {
    const semanticContext = completeContext(context, inputs);
    const semanticPlans = this.semanticPlanner.plan(inputs, semanticContext, {
      breakpointConfig: this.renderer.breakpointConfig,
      sourcePropertyEvidence: this.renderer.sourcePropertyEvidence,
    });
    const targetReady = semanticPlans.map(plan => this.applyTargetEligibility(plan));
    const familyClosed = this.semanticPlanner.closeSiblingFamilies(targetReady);
    const locallyClosed =
      this.renderer.target === 'css'
        ? this.semanticPlanner.closeDisplayDependencies(familyClosed, this.renderer.sourcePropertyEvidence)
        : familyClosed;
    const rendered = locallyClosed.map(plan =>
      plan.status === 'converted' ? this.renderer.render(plan, semanticContext) : plan,
    );
    const resolved = this.renderer.resolveConflicts(rendered, semanticContext);
    if (record) this.record(resolved);
    return resolved;
  }

  record(plans: readonly PlannedConversion[]): void {
    this.renderer.record(plans);
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

  private applyTargetEligibility(
    plan: ResolvedSemanticPlan | UnresolvedSemanticPlan,
  ): ResolvedSemanticPlan | TargetDiagnostic {
    const eligibility = this.renderer.eligibility(plan.input);
    if (eligibility?.status === 'converted') throw new Error('Renderer eligibility must not emit target output');
    if (eligibility !== undefined) return eligibility;
    if (plan.status === 'converted') return plan;
    if (plan.reason === 'Overlapping responsive ranges emit different target outputs for the same directive family.') {
      return {
        ...plan,
        reason:
          this.renderer.target === 'css'
            ? 'Overlapping responsive ranges emit different CSS declarations for the same directive family.'
            : 'Overlapping responsive ranges emit different utilities for the same directive family.',
      };
    }
    if (plan.reason === 'This directive emits different target outputs across its active responsive layout contexts.') {
      return {
        ...plan,
        reason:
          this.renderer.target === 'css'
            ? 'This directive emits different declarations across its active responsive layout contexts.'
            : 'This directive emits different utilities across its active responsive layout contexts.',
      };
    }
    return plan;
  }
}
