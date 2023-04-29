import * as cheerio from "cheerio";
import { Cheerio } from "cheerio";
import { AttributeConverter } from "../../attribute.converter";

export class FxFlexAttributeConverter extends AttributeConverter {
  public convert(value: string, element: Cheerio<cheerio.Element>): void {
    element.addClass("flex");
  }

  public getAttributeName(): string {
    return "fxTest";
  }

  public usesBreakpoints(): boolean {
    return true;
  }
}
