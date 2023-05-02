import { AttributeConverter } from './attribute.converter';
import { BreakPoint } from './converter.type';

import * as cheerio from 'cheerio';
import { Cheerio } from 'cheerio';

export interface IConverter {
  canConvert(attribute: string, isBreakpointAttribute?: boolean): boolean;
  convert(
    attribute: string,
    value: string[],
    element: Cheerio<cheerio.Element>,
    breakPoint?: BreakPoint,
  ): void;

  getAllAttributes(): string[];
}

export abstract class Converter implements IConverter {
  private converters: Map<string, AttributeConverter> = new Map();

  /**
   * Creates a new converter instance. You need to add your converters here.
   *
   * @example
   * ```typescript
   * constructor() {
   *  super();
   *  this.addConverter(new MyConverter());
   * }
   * ```
   */
  constructor() {
    // Override this method to add your converters
  }

  /**
   * Converts the attribute value to the target format
   * @param attribute attribute name
   * @param value attribute value
   * @param element element that contains the attribute
   * @returns converted value
   */
  public convert(
    attribute: string,
    value: string[],
    element: Cheerio<cheerio.Element>,
    breakPoint?: BreakPoint,
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
  public canConvert(attribute: string, isBreakpointAttribute = false): boolean {
    const normalizedAttribute = this.normalizeAttribute(attribute);

    if (isBreakpointAttribute) {
      const [attributeName] = attribute.split('.');
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
      converter,
    );
    return this;
  }

  /**
   * Returns all the selectors that the converter can convert
   * @returns a list of selectors that the converter can convert
   */
  public getAllSelectors(): string {
    return Array.from(this.converters.values())
      .map(converter => converter.getSelectors())
      .join(', ');
  }

  public getAllAttributes(): string[] {
    return Array.from(this.converters.values())
      .map(converter => converter.getAttributeNames())
      .flat();
  }

  private normalizeAttribute(attribute: string): string {
    return attribute.replace('[', '').replace(']', '').trim();
  }
}
