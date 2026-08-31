import { logger } from '../logger';
import type { ConversionAdapter } from '../adapter/conversion-adapter';
import { TailwindAdapter } from '../adapter/tailwind/tailwind.adapter';

class ConverterFactory {
  public static createConverter(type: string): ConversionAdapter {
    logger.info(`Creating adapter [${type}]`);
    switch (type) {
      case 'tailwind':
        return new TailwindAdapter();
      default:
        throw new Error(`Converter [${type}] not found`);
    }
  }
}

export { ConverterFactory };
