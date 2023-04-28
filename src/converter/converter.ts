import { AttributeConverter } from "./attribute.converter";
import * as cheerio from "cheerio";

export abstract class Converter {
  private converters: Map<string, AttributeConverter> = new Map();

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
    element: cheerio.Cheerio<any>,
    breakPoint?: string
  ): void {
    const converter = this.converters.get(attribute);
    if (!converter) {
      throw new Error(`Unknown attribute: ${attribute}`);
    }
    converter.convert(value, element, breakPoint);
  }

  /**
   * Returns true if the converter can convert the attribute
   * @param attribute attribute name
   * @returns
   */
  public canConvert(
    attribute: string,
    isBreakpointAttribute: boolean = false
  ): boolean {
    const normalizedAttribute = this.normalizeAttribute(attribute);

    if (isBreakpointAttribute) {
      const [attributeName] = attribute.split(".");
      const normalizedAttributeName = this.normalizeAttribute(attributeName);

      const targetConverter = this.converters.get(normalizedAttributeName);
      if (!targetConverter) return false;

      return targetConverter.usesBreakpoints();
    }

    return this.converters.has(normalizedAttribute);
  }

  /**
   * Adds a converter to the converter list so that it can be used to convert attributes
   * @param converter
   * @returns the converter itself so that it can be chained
   */
  protected addConverter(converter: AttributeConverter): Converter {
    this.converters.set(
      this.normalizeAttribute(converter.getAttributeName()),
      converter
    );
    return this;
  }

  /**
   * Returns all the selectors that the converter can convert
   * @returns a list of selectors that the converter can convert
   */
  public getAllSelectors(): string {
    return Array.from(this.converters.values())
      .map((converter) => converter.getAttributeName())
      .join(", ");
  }

  private normalizeAttribute(attribute: string): string {
    return attribute.replace("[", "").replace("]", "").trim();
  }
}
