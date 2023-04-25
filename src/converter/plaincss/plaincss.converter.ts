import { AttributeConverter } from "../attribute.converter";
import { Converter } from "../converter";

export class PlainCssConverter extends Converter {
  protected converters: Map<string, AttributeConverter> = new Map([]);
}
