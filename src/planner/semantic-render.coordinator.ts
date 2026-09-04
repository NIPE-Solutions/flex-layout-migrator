import type { LocatedFlexLayoutInput } from '../analyzer/flex-layout-attribute.analyzer';
import { MigrationApplicationError } from '../migrator/migration-application.error';
import type { ConversionRenderer, PlannedConversion } from '../render/conversion-renderer';
import type { SemanticConversionContext } from '../semantic/conversion-context';
import { ElementSemanticPlanner } from '../semantic/element-semantic.planner';
import type { ResolvedSemanticPlan, UnresolvedSemanticPlan } from '../semantic/semantic-plan';

type TargetDiagnostic = Exclude<PlannedConversion, { readonly status: 'converted' }>;
type ResultBoundary = 'Initial target rendering' | 'Target conflict resolution';

/** Coordinates target-neutral semantic planning with exactly one target renderer. */
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

  planElement(
    inputs: readonly LocatedFlexLayoutInput[],
    context: SemanticConversionContext,
    record = true,
  ): readonly PlannedConversion[] {
    this.assertUniqueInputIds(inputs);
    const semanticPlans = this.semanticPlanner.plan(inputs, context, {
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
      plan.status === 'converted' ? this.renderer.render(plan, context) : plan,
    );
    this.assertResultCorrespondence(inputs, rendered, 'Initial target rendering');
    const resolved = this.renderer.resolveConflicts(rendered, context);
    this.assertResultCorrespondence(inputs, resolved, 'Target conflict resolution');
    if (record) this.record(resolved);
    return resolved;
  }

  record(plans: readonly PlannedConversion[]): void {
    this.renderer.record(plans);
  }

  closeDependencies(
    plans: readonly PlannedConversion[],
    context: SemanticConversionContext,
    plansByInputId: ReadonlyMap<string, PlannedConversion>,
  ): readonly PlannedConversion[] {
    return this.semanticPlanner.closeDependencies(plans, context, plansByInputId, this.renderer.sourcePropertyEvidence);
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
