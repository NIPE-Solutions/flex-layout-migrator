import { Cheerio } from "cheerio";
import { AttributeConverter } from "../../attribute.converter";

export class FxFlexAttributeConverter extends AttributeConverter {
  public convert(value: string, element: Cheerio<any>): void {
    throw new Error("Method not implemented.");
  }

  public getSelector(): string {
    return "[fxFlex]";
  }
}
