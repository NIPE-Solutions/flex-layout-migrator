import { logger } from "../logger";
import { Converter } from "./converter";
import { PlainCssConverter } from "./plaincss/plaincss.converter";
import { TailwindCssConverter } from "./tailwind/tailwind.converter";

class ConverterFactory {
  public static createConverter(type: string): Converter {
    logger.info(`Creating converter [${type}]`);
    switch (type) {
      case "tailwind":
        return new TailwindCssConverter();
      case "plain-css":
        return new PlainCssConverter();
      default:
        throw new Error(`Converter [${type}] not found`);
    }
  }
}

export { ConverterFactory };
