import * as cheerio from "cheerio";
import { Cheerio } from "cheerio";
import { AttributeConverter } from "../../attribute.converter";

export class FxFlexAttributeConverter extends AttributeConverter {
  constructor() {
    super("fxFlex");
  }

  public convert(value: string, element: Cheerio<cheerio.Element>): void {
    element.addClass("flex");
  }

  public usesBreakpoints(): boolean {
    return true;
  }
}
