import { AttributeConverter } from "../attribute.converter";
import { Converter } from "../converter";

export class TailwindCssConverter extends Converter {
  protected converters: Map<string, AttributeConverter> = new Map([]);
}
