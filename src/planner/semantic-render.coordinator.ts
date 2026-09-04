import type { LocatedFlexLayoutInput } from '../analyzer/flex-layout-attribute.analyzer';
import type { ConversionContext, PlannedConversion } from '../adapter/conversion-adapter';
import { MigrationApplicationError } from '../migrator/migration-application.error';
import type { ConversionRenderer } from '../render/conversion-renderer';
import type { SemanticConversionContext } from '../semantic/conversion-context';
import { ElementSemanticPlanner } from '../semantic/element-semantic.planner';
import type { ResolvedSemanticPlan, UnresolvedSemanticPlan } from '../semantic/semantic-plan';

type TargetDiagnostic = Exclude<PlannedConversion, { readonly status: 'converted' }>;
type ResultBoundary = 'Initial target rendering' | 'Target conflict resolution';

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
    this.assertUniqueInputIds(inputs);
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
    this.assertResultCorrespondence(inputs, rendered, 'Initial target rendering');
    const resolved = this.renderer.resolveConflicts(rendered, semanticContext);
    this.assertResultCorrespondence(inputs, resolved, 'Target conflict resolution');
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
    this.assertUniqueInputIds(plans.map(plan => plan.input));
    const resolved = this.renderer.resolveConflicts(plans, {
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
    this.assertResultCorrespondence(
      plans.map(plan => plan.input),
      resolved,
      'Target conflict resolution',
    );
    return resolved;
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

  private assertUniqueInputIds(inputs: readonly LocatedFlexLayoutInput[]): void {
    const seen = new Set<string>();
    for (const input of inputs) {
      if (seen.has(input.id)) {
        throw internalInvariant(`Semantic render inputs contain duplicate ID "${input.id}".`, inputPaths(inputs));
      }
      seen.add(input.id);
    }
  }

  private assertResultCorrespondence(
    inputs: readonly LocatedFlexLayoutInput[],
    results: readonly PlannedConversion[],
    boundary: ResultBoundary,
  ): void {
    const paths = inputPaths(inputs, results);
    if (results.length !== inputs.length) {
      throw internalInvariant(
        `${boundary} returned ${results.length} ${results.length === 1 ? 'result' : 'results'} for ${inputs.length} inputs; results must be one-to-one and in stable order.`,
        paths,
      );
    }

    const seen = new Set<string>();
    for (const result of results) {
      if (seen.has(result.input.id)) {
        throw internalInvariant(`${boundary} returned duplicate input ID "${result.input.id}".`, paths);
      }
      seen.add(result.input.id);
    }

    for (let index = 0; index < inputs.length; index += 1) {
      const expected = inputs[index]!;
      const result = results[index]!;
      if (result.input.id !== expected.id) {
        throw internalInvariant(
          `${boundary} returned input ID "${result.input.id}" at index ${index}; expected "${expected.id}".`,
          paths,
        );
      }
      if (result.input !== expected) {
        throw internalInvariant(
          `${boundary} replaced the input identity for ID "${expected.id}" at index ${index}.`,
          paths,
        );
      }
    }
  }
}

function inputPaths(
  inputs: readonly LocatedFlexLayoutInput[],
  results: readonly PlannedConversion[] = [],
): readonly string[] {
  return [...new Set([...inputs.map(input => input.fileName), ...results.map(result => result.input.fileName)])];
}

function internalInvariant(message: string, paths: readonly string[]): MigrationApplicationError {
  return new MigrationApplicationError('internal-invariant', message, paths);
}
