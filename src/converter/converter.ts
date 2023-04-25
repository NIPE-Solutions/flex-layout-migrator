import { AttributeConverter } from "./attribute.converter";
import * as cheerio from "cheerio";

export abstract class Converter {
  protected abstract converters: Map<string, AttributeConverter>;

  /**
   * Converts the attribute value to the target format
   * @param attribute attribute name
   * @param value attribute value
   * @param element element that contains the attribute
   * @returns converted value
   */
  public convert(
    attribute: string,
    value: string,
    element: cheerio.Cheerio<any>
  ): void {
    const converter = this.converters.get(attribute);
    if (!converter) {
      throw new Error(`Unknown attribute: ${attribute}`);
    }
    converter.convert(value, element);
  }

  /**
   * Returns true if the converter can convert the attribute
   * @param attribute attribute name
   * @returns
   */
  public canConvert(attribute: string): boolean {
    return this.converters.has(attribute);
  }

  /**
   * Returns all the selectors that the converter can convert
   * @returns a list of selectors that the converter can convert
   */
  public getAllSelectors(): string {
    return Array.from(this.converters.keys()).join(", ");
  }
}
