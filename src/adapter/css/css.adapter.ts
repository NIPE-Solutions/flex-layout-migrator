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
export class CssAdapterSession extends CssRenderSession implements ConversionAdapterSession {
  readonly adapter: CompatibilityConversionAdapter;

  constructor(config: BreakpointMigrationConfig = { orientationBreakpoints: false }) {
    super(config);
    this.adapter = sessionBoundAdapter(new CssAdapter(this.renderer), () => this.assertActive());
  }
}
