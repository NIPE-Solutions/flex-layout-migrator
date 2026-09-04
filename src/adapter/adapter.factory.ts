import { logger } from '../logger';
import type { BreakpointMigrationConfig } from '../config/breakpoint-migration-config';
import { CssRenderSession, TailwindRenderSession, type RenderSession } from '../render/render-session';

export class AdapterFactory {
  static createRenderSession(
    target: string,
    config: BreakpointMigrationConfig = { orientationBreakpoints: false },
  ): RenderSession {
    logger.info(`Creating adapter session [${target}]`);
    if (target === 'tailwind') return new TailwindRenderSession(config);
    if (target === 'css') return new CssRenderSession(config);
    throw new Error(`Adapter [${target}] not found`);
  }
}
