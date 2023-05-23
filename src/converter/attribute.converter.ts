import * as cheerio from 'cheerio';
import { Cheerio, CheerioAPI } from 'cheerio';
import { BreakPoint, breakpoints } from './converter.type';
import { AttributeContext } from './converter';

export interface IAttributeConverter<T> {
  /**
   * This method is called before the converter is used. You can use this method to prepare the element.
   * For exmample, some converters need to check the parent element.
   *
   * @param root the root element of the document
   * @param element the element that will be converted
   */
  prepare(root: CheerioAPI, element: Cheerio<cheerio.Element>): T;

  /**
   * Converts the attribute value to the target format and adds it to the element.
   *
   * @param value A list of values if present or empty if not
   * @param element The element that contains the attribute
   * @param breakPoint The breakpoint if present or undefined if not
   * @param context The context that was created in the {@link prepare} method or undefined if not
   */
  convert(
    value: string[],
    element: Cheerio<cheerio.Element>,
    breakPoint?: BreakPoint,
    context?: AttributeContext<T>,
  ): void;

  /**
   * Returns the name of the attribute that the converter is responsible for. It is important that the name does not contain square brackets [].
   *
   * Dont return any CSS selectors here, only the name of the attribute. Because the selectors will be generated automatically.
   *
   * Overide the {@link usesBreakpoints} method and return false if you dont want to use breakpoints.
   *
   * @returns {string} the name of the attribute
   */
  getAttributeName(): string;

  /**
   * Returns true if the converter uses breakpoints. If true, the converter will be called for each breakpoint.
   * For example:
   *
   * [attribute] = "value" <- no breakpoint
   * [attribute.xs] = "value" <- breakpoint xs
   *
   * If true, the selector will be populated to reflect the breakpoints as well.
   * For example the selector for the above example will be:
   *
   * [attribute], [attribute.xs], [attribute.sm], [attribute.md], ...
   *
   * @returns {boolean} true if the converter uses breakpoints
   */
  usesBreakpoints(): boolean;

  /**
   * Returns all the attribute names that the converter is responsible for.
   * If the converter uses breakpoints, the selector will be populated to reflect the breakpoints as well.
   * For example the selector "attribute" will be:
   *
   * [attribute], [attribute.xs], [attribute.sm], [attribute.md], ...
   *
   * @returns {string[]} list of attribute names
   */
  getAttributeNames(): string[];
}

export abstract class AttributeConverter<T> implements IAttributeConverter<T> {
  constructor(protected attributeName: string) {}

  public prepare(_root: CheerioAPI, _element: cheerio.Cheerio<cheerio.Element>): T {
    // Override this method to prepare the element
    return {} as T;
  }

  public abstract convert(
    value: string[],
    element: Cheerio<cheerio.Element>,
    breakPoint?: BreakPoint,
    context?: T,
  ): void;

  public getAttributeName(): string {
    return this.attributeName;
  }

  public usesBreakpoints(): boolean {
    return true;
  }

  public getAttributeNames(): string[] {
    if (!this.usesBreakpoints()) {
      return [this.getAttributeName()];
    }

    // If the converter uses breakpoints, we need to create a selector for each breakpoint as well as the default one
    return ['', ...breakpoints].map(breakpoint => {
      const attr = breakpoint ? `${this.getAttributeName()}.${breakpoint}` : this.getAttributeName();
      return attr;
    });
  }

  public getSelectors(): string {
    return this.getAttributeNames()
      .map(attribute => `[${attribute}]`)
      .join(', ');
  }
}
