import type { BreakpointMigrationConfig } from '../../config/breakpoint-migration-config';
import type { ConversionRenderer } from '../../render/conversion-renderer';
import { TailwindRenderer } from '../../render/tailwind/tailwind.renderer';
import { RendererBackedConversionAdapter } from '../renderer-backed-conversion.adapter';

/** @deprecated Remove in Slice 8 after all external compatibility tests use RenderSession. */
export class TailwindAdapter extends RendererBackedConversionAdapter {
  constructor(configOrDelegate: BreakpointMigrationConfig | ConversionRenderer = { orientationBreakpoints: false }) {
    const renderer = 'target' in configOrDelegate ? configOrDelegate : new TailwindRenderer(configOrDelegate);
    if (renderer.target !== 'tailwind') throw new Error('TailwindAdapter requires a Tailwind renderer');
    super(renderer);
  }
}
