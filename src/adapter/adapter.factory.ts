import { logger } from '../logger';
import type { ConversionAdapter } from './conversion-adapter';
import { TailwindAdapter } from './tailwind/tailwind.adapter';
import type { BreakpointMigrationConfig } from '../config/breakpoint-migration-config';

export class AdapterFactory {
  static create(
    target: string,
    config: BreakpointMigrationConfig = { orientationBreakpoints: false },
  ): ConversionAdapter {
    logger.info(`Creating adapter [${target}]`);
    if (target === 'tailwind') return new TailwindAdapter(config);
    throw new Error(`Adapter [${target}] not found`);
  }
}
