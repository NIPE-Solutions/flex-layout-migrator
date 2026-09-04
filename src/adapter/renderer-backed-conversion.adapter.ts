import type { LocatedFlexLayoutInput } from '../analyzer/flex-layout-attribute.analyzer';
import { SemanticRenderCoordinator } from '../planner/semantic-render.coordinator';
import type { ConversionRenderer } from '../render/conversion-renderer';
import type { SemanticConversionContext } from '../semantic/conversion-context';
import type { ConversionAdapter, ConversionContext, PlannedConversion } from './conversion-adapter';

/** Shared forwarding shell retained only for pre-Slice-8 adapter compatibility. */
export class RendererBackedConversionAdapter implements ConversionAdapter {
  readonly name: 'css' | 'tailwind';
  readonly target: 'css' | 'tailwind';
  readonly breakpointConfig;
  readonly sourcePropertyEvidence;
  private readonly coordinator: SemanticRenderCoordinator;

  constructor(protected readonly delegate: ConversionRenderer) {
    this.name = delegate.target;
    this.target = delegate.target;
    this.breakpointConfig = delegate.breakpointConfig;
    this.sourcePropertyEvidence = delegate.sourcePropertyEvidence;
    this.coordinator = new SemanticRenderCoordinator(delegate);
  }

  plan(input: LocatedFlexLayoutInput, context: ConversionContext): PlannedConversion {
    return this.coordinator.plan(input, context);
  }

  planElement(
    inputs: readonly LocatedFlexLayoutInput[],
    context: ConversionContext,
  ): readonly PlannedConversion[] {
    return this.coordinator.planElement(inputs, context);
  }

  resolveClassConflicts(
    plans: readonly PlannedConversion[],
    existingClassNames: readonly string[],
  ): readonly PlannedConversion[] {
    return this.coordinator.resolveClassConflicts(plans, existingClassNames);
  }

  closePlanDependencies(
    plans: readonly PlannedConversion[],
    context: ConversionContext,
    plansByInputId: ReadonlyMap<string, PlannedConversion>,
  ): readonly PlannedConversion[] {
    return this.coordinator.closeDependencies(plans, context, plansByInputId);
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
