import { Cheerio } from "cheerio";
import { AttributeConverter } from "../../attribute.converter";

export class FxFlexAttributeConverter extends AttributeConverter {
  public convert(value: string, element: Cheerio<any>): void {
    element.addClass(`flex-${value}`);
  }

  public getSelector(): string {
    return "[fxFlex]";
  }
}
