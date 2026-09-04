import type { BreakpointMigrationConfig } from '../config/breakpoint-migration-config';
import type { OwnedCssRule } from '../adapter/css/css-artifact.model';
import { CssRenderer } from './css/css.renderer';
import type { ConversionRenderer } from './conversion-renderer';
import { TailwindRenderer } from './tailwind/tailwind.renderer';

export type AdapterSessionResult =
  { readonly target: 'tailwind' } | { readonly target: 'css'; readonly rules: readonly OwnedCssRule[] };

export interface RenderSession {
  readonly renderer: ConversionRenderer;
  finalize(): AdapterSessionResult;
}

export function sessionBoundRenderer(renderer: ConversionRenderer, assertActive: () => void): ConversionRenderer {
  return Object.freeze({
    target: renderer.target,
    breakpointConfig: renderer.breakpointConfig,
    sourcePropertyEvidence: renderer.sourcePropertyEvidence,
    eligibility(input: Parameters<ConversionRenderer['eligibility']>[0]) {
      assertActive();
      return renderer.eligibility(input);
    },
    render(plan: Parameters<ConversionRenderer['render']>[0], context: Parameters<ConversionRenderer['render']>[1]) {
      assertActive();
      return renderer.render(plan, context);
    },
    resolveConflicts(
      plans: Parameters<ConversionRenderer['resolveConflicts']>[0],
      context: Parameters<ConversionRenderer['resolveConflicts']>[1],
    ) {
      assertActive();
      return renderer.resolveConflicts(plans, context);
    },
    record(plans: Parameters<ConversionRenderer['record']>[0]) {
      assertActive();
      renderer.record(plans);
    },
  });
}

abstract class SingleUseRenderSession implements RenderSession {
  abstract readonly renderer: ConversionRenderer;
  private finalized = false;

  finalize(): AdapterSessionResult {
    if (this.finalized) throw new Error('Render session already finalized');
    this.finalized = true;
    return Object.freeze(this.result());
  }

  protected assertActive(): void {
    if (this.finalized) throw new Error('Render session is finalized');
  }

  protected abstract result(): AdapterSessionResult;
}

export class TailwindRenderSession extends SingleUseRenderSession {
  readonly renderer: ConversionRenderer;

  constructor(config: BreakpointMigrationConfig = { orientationBreakpoints: false }) {
    super();
    this.renderer = sessionBoundRenderer(new TailwindRenderer(config), () => this.assertActive());
  }

  protected result(): AdapterSessionResult {
    return { target: 'tailwind' };
  }
}

export class CssRenderSession extends SingleUseRenderSession {
  readonly renderer: ConversionRenderer;
  private readonly cssRenderer: CssRenderer;

  constructor(config: BreakpointMigrationConfig = { orientationBreakpoints: false }) {
    super();
    this.cssRenderer = new CssRenderer(undefined, config);
    this.renderer = sessionBoundRenderer(this.cssRenderer, () => this.assertActive());
  }

  protected result(): AdapterSessionResult {
    return { target: 'css', rules: this.cssRenderer.finalizedRules() };
  }
}
