import { logger } from '../logger';
import type { ConversionAdapter } from './conversion-adapter';
import { TailwindAdapter } from './tailwind/tailwind.adapter';
import type { BreakpointMigrationConfig } from '../config/breakpoint-migration-config';
import type { ConversionAdapterSession } from './conversion-adapter.session';
import { TailwindAdapterSession } from './conversion-adapter.session';
import { CssAdapterSession } from './css/css.adapter';

export class AdapterFactory {
  static createSession(
    target: string,
    config: BreakpointMigrationConfig = { orientationBreakpoints: false },
  ): ConversionAdapterSession {
    logger.info(`Creating adapter session [${target}]`);
    if (target === 'tailwind') return new TailwindAdapterSession(config);
    if (target === 'css') return new CssAdapterSession(config);
    throw new Error(`Adapter [${target}] not found`);
  }

  static create(
    target: string,
    config: BreakpointMigrationConfig = { orientationBreakpoints: false },
  ): ConversionAdapter {
    logger.info(`Creating adapter [${target}]`);
    if (target === 'tailwind') return new TailwindAdapter(config);
    throw new Error(`Adapter [${target}] not found`);
  }
}
