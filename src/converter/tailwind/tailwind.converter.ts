import { AttributeConverter } from "../attribute.converter";
import { Converter } from "../converter";
import { FxFlexAttributeConverter } from "./attribute/fxflex.attribute";

export class TailwindCssConverter extends Converter {
  protected converters: Map<string, AttributeConverter> = new Map([
    ["fxFlex", new FxFlexAttributeConverter()],
  ]);
}
