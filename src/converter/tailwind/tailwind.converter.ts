import { Converter } from "../converter";
import { FxFlexAttributeConverter } from "./attribute/fxflex.attribute";

export class TailwindCssConverter extends Converter {
  constructor() {
    super();

    this.addConverter(new FxFlexAttributeConverter());
  }
}
