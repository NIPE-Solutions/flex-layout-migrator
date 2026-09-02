import type { BreakpointMigrationConfig } from '../config/breakpoint-migration-config';
import type { OwnedCssRule } from './css/css-artifact.model';
import type { ConversionAdapter, ConversionContext, PlannedConversion } from './conversion-adapter';
import { TailwindAdapter } from './tailwind/tailwind.adapter';

export interface ConversionAdapterSession {
  readonly adapter: ConversionAdapter;
  finalize(): AdapterSessionResult;
}

export type AdapterSessionResult =
  { readonly target: 'tailwind' } | { readonly target: 'css'; readonly rules: readonly OwnedCssRule[] };

type AdapterInput = Parameters<ConversionAdapter['plan']>[0];

export function sessionBoundAdapter(adapter: ConversionAdapter, assertActive: () => void): ConversionAdapter {
  return Object.freeze({
    name: adapter.name,
    plan(input: AdapterInput, context: ConversionContext): PlannedConversion {
      assertActive();
      return adapter.plan(input, context);
    },
    planElement(inputs: readonly AdapterInput[], context: ConversionContext): readonly PlannedConversion[] {
      assertActive();
      return adapter.planElement?.(inputs, context) ?? inputs.map(input => adapter.plan(input, context));
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
      return adapter.closePlanDependencies?.(plans, context, plansByInputId) ?? plans;
    },
  });
}

export class TailwindAdapterSession implements ConversionAdapterSession {
  readonly adapter: ConversionAdapter;
  private finalized = false;

  constructor(config: BreakpointMigrationConfig = { orientationBreakpoints: false }) {
    this.adapter = sessionBoundAdapter(new TailwindAdapter(config), () => this.assertActive());
  }

  finalize(): AdapterSessionResult {
    if (this.finalized) throw new Error('Adapter session already finalized');
    this.finalized = true;
    return Object.freeze({ target: 'tailwind' as const });
  }

  private assertActive(): void {
    if (this.finalized) throw new Error('Adapter session is finalized');
  }
}
