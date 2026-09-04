import type { LocatedFlexLayoutInput } from '../analyzer/flex-layout-attribute.analyzer';
import type { BreakpointMigrationConfig } from '../config/breakpoint-migration-config';
import type { ConversionRenderer } from '../render/conversion-renderer';
import { TailwindRenderSession, type RenderSession } from '../render/render-session';
import type { ConversionAdapter, ConversionContext, PlannedConversion } from './conversion-adapter';
import { TailwindAdapter } from './tailwind/tailwind.adapter';

export type { AdapterSessionResult } from '../render/render-session';

/** @deprecated Use RenderSession. */
export interface ConversionAdapterSession extends RenderSession {
  readonly adapter: CompatibilityConversionAdapter;
}

/** @deprecated Slice 8 removes the pre-Render adapter test facade. */
export interface CompatibilityConversionAdapter extends ConversionAdapter {
  planElement(inputs: readonly LocatedFlexLayoutInput[], context: ConversionContext): readonly PlannedConversion[];
  closePlanDependencies(
    plans: readonly PlannedConversion[],
    context: ConversionContext,
    plansByInputId: ReadonlyMap<string, PlannedConversion>,
  ): readonly PlannedConversion[];
  acceptPlans(plans: readonly PlannedConversion[]): void;
}

type AdapterInput = Parameters<CompatibilityConversionAdapter['plan']>[0];

export function sessionBoundAdapter(
  adapter: CompatibilityConversionAdapter,
  assertActive: () => void,
): CompatibilityConversionAdapter {
  return Object.freeze({
    name: adapter.name,
    target: adapter.target,
    breakpointConfig: adapter.breakpointConfig,
    sourcePropertyEvidence: adapter.sourcePropertyEvidence,
    plan(input: AdapterInput, context: ConversionContext): PlannedConversion {
      assertActive();
      return adapter.plan(input, context);
    },
    planElement(inputs: readonly AdapterInput[], context: ConversionContext): readonly PlannedConversion[] {
      assertActive();
      return adapter.planElement(inputs, context);
    },
    resolveClassConflicts(
      plans: readonly PlannedConversion[],
      existingClassNames: readonly string[],
    ): readonly PlannedConversion[] {
      assertActive();
      return adapter.resolveClassConflicts?.(plans, existingClassNames) ?? plans;
    },
    closePlanDependencies(
      plans: readonly PlannedConversion[],
      context: ConversionContext,
      plansByInputId: ReadonlyMap<string, PlannedConversion>,
    ): readonly PlannedConversion[] {
      assertActive();
      return adapter.closePlanDependencies(plans, context, plansByInputId);
    },
    acceptPlans(plans: readonly PlannedConversion[]): void {
      assertActive();
      adapter.acceptPlans(plans);
    },
    eligibility(input: Parameters<ConversionRenderer['eligibility']>[0]) {
      assertActive();
      return adapter.eligibility(input);
    },
    render(plan: Parameters<ConversionRenderer['render']>[0], context: Parameters<ConversionRenderer['render']>[1]) {
      assertActive();
      return adapter.render(plan, context);
    },
    resolveConflicts(
      plans: Parameters<ConversionRenderer['resolveConflicts']>[0],
      context: Parameters<ConversionRenderer['resolveConflicts']>[1],
    ) {
      assertActive();
      return adapter.resolveConflicts(plans, context);
    },
    record(plans: Parameters<ConversionRenderer['record']>[0]) {
      assertActive();
      adapter.record(plans);
    },
  });
}

/** @deprecated Use TailwindRenderSession. */
export class TailwindAdapterSession extends TailwindRenderSession implements ConversionAdapterSession {
  readonly adapter: CompatibilityConversionAdapter;

  constructor(config: BreakpointMigrationConfig = { orientationBreakpoints: false }) {
    super(config);
    this.adapter = sessionBoundAdapter(new TailwindAdapter(this.renderer), () => this.assertActive());
  }
}
