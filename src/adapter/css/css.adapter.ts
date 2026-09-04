import type { BreakpointMigrationConfig } from '../../config/breakpoint-migration-config';
import type { ConversionRenderer } from '../../render/conversion-renderer';
import { CssRenderer } from '../../render/css/css.renderer';
import { CssRenderSession } from '../../render/render-session';
import type { CompatibilityConversionAdapter, ConversionAdapterSession } from '../conversion-adapter.session';
import { sessionBoundAdapter } from '../conversion-adapter.session';
import { RendererBackedConversionAdapter } from '../renderer-backed-conversion.adapter';
import { CssArtifactRegistry } from './css-artifact.registry';

/** @deprecated Remove in Slice 8 after all external compatibility tests use RenderSession. */
export class CssAdapter extends RendererBackedConversionAdapter {
  constructor(registryOrDelegate: CssArtifactRegistry | ConversionRenderer = new CssArtifactRegistry()) {
    const renderer = 'target' in registryOrDelegate ? registryOrDelegate : new CssRenderer(registryOrDelegate);
    if (renderer.target !== 'css') throw new Error('CssAdapter requires a CSS renderer');
    super(renderer);
  }

  referencedClassNames(): ReadonlySet<string> {
    return this.delegate instanceof CssRenderer ? this.delegate.referencedClassNames() : new Set();
  }
}

/** @deprecated Use CssRenderSession. */
export class CssAdapterSession implements ConversionAdapterSession {
  readonly renderer: ConversionRenderer;
  readonly adapter: CompatibilityConversionAdapter;
  private readonly delegate: CssRenderSession;
  private finalized = false;

  constructor(config: BreakpointMigrationConfig = { orientationBreakpoints: false }) {
    this.delegate = new CssRenderSession(config);
    this.renderer = this.delegate.renderer;
    this.adapter = sessionBoundAdapter(new CssAdapter(this.renderer), () => this.assertActive());
  }

  finalize() {
    if (this.finalized) throw new Error('Render session already finalized');
    this.finalized = true;
    return this.delegate.finalize();
  }

  private assertActive(): void {
    if (this.finalized) throw new Error('Render session is finalized');
  }
}
