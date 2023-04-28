import { Cheerio } from "cheerio";
import { BreakPoint } from "src/converter/converter.type";
import { AttributeConverter } from "../../attribute.converter";

export class FxFlexAttributeConverter extends AttributeConverter {
  public convert(value: string, element: Cheerio<any>): void {
    element.addClass(`flex-${value}`);
  }

  public getAttributeName(): string {
    return "fxFlex";
  }
}
