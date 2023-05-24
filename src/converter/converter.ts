import { Options } from 'prettier';
import { AttributeConverter } from './attribute.converter';
import { BreakPoint } from './breakpoint.type';

import * as cheerio from 'cheerio';
import { Cheerio, CheerioAPI } from 'cheerio';

export interface IAttributeStandardContext {
  /**
   * Property binding is used if the attribute is enclosed in square brackets.
   * For example: [fxFlex]="value"
   */
  usesPropertyBinding: boolean;
}

export type AttributeContext<T> = T & IAttributeStandardContext;

export interface IConverter {
  /**
   * Prepares the element for the converter and returns the context
   * @param attribute Attribute name
   * @param element Element that contains the attribute
   * @returns context
   */
  prepare<T>(attribute: string, root: CheerioAPI, element: Cheerio<cheerio.Element>): AttributeContext<T>;

  /**
   * Returns true if the converter can convert the attribute
   * @param attribute attribute name
   * @returns
   */
  canConvert(attribute: string, isBreakpointAttribute?: boolean): boolean;

  /**
   * Converts the attribute value to the target format
   * @param attribute attribute name
   * @param value attribute value
   * @param element element that contains the attribute
   * @returns converted value
   */
  convert(
    attribute: string,
    value: string[],
    element: Cheerio<cheerio.Element>,
    breakPoint?: BreakPoint,
    context?: AttributeContext<unknown>,
  ): void;

  /**
   * Returns all the attributes that the converter can convert
   * @returns list of attributes
   */
  getAllAttributes(): string[];

  /**
   * Return true if the converter supports the file
   * @param filExtension file extension (without dot)
   */
  isSupportedFileExtension(filExtension: string): boolean;

  /**
   * Returns a prettier configuration for the converter, if none is provided, the default prettier configuration is used
   */
  getPrettierConfig(): Options;
}

export abstract class Converter implements IConverter {
  private converters: Map<string, AttributeConverter<unknown>> = new Map();

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

  public prepare<T>(
    attribute: string,
    root: CheerioAPI,
    element: cheerio.Cheerio<cheerio.Element>,
  ): AttributeContext<T> {
    const converter = this.receiveConverter(attribute);
    const data = converter.prepare(root, element) as T;

    return {
      usesPropertyBinding: false,
      ...data,
    };
  }

  public convert(
    attribute: string,
    value: string[],
    element: Cheerio<cheerio.Element>,
    breakPoint?: BreakPoint,
    context?: AttributeContext<unknown>,
  ): void {
    const converter = this.receiveConverter(attribute);
    converter.convert(value, element, breakPoint, context);
  }

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
  protected addConverter(converter: AttributeConverter<unknown>): Converter {
    this.converters.set(this.normalizeAttribute(converter.getAttributeName()), converter);
    return this;
  }

  private receiveConverter(attribute: string): AttributeConverter<unknown> {
    const converter = this.converters.get(attribute);
    if (!converter) {
      throw new Error(`Unknown attribute: ${attribute}`);
    }
    return converter;
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

  public isSupportedFileExtension(filExtension: string): boolean {
    return filExtension === 'html' || filExtension === 'htm';
  }

  getPrettierConfig(): Options {
    return {
      parser: 'angular',
    };
  }
}
