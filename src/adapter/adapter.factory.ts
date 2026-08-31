import { logger } from '../logger';
import type { ConversionAdapter } from './conversion-adapter';
import { TailwindAdapter } from './tailwind/tailwind.adapter';

export class AdapterFactory {
  static create(target: string): ConversionAdapter {
    logger.info(`Creating adapter [${target}]`);
    if (target === 'tailwind') return new TailwindAdapter();
    throw new Error(`Adapter [${target}] not found`);
  }
}
