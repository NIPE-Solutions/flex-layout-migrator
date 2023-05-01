import * as cheerio from "cheerio";
import { Cheerio } from "cheerio";
import { BreakPoint, breakpoints } from "./converter.type";

export abstract class AttributeConverter {
  constructor(protected attributeName: string) {}

  public abstract convert(
    value: string,
    element: Cheerio<cheerio.Element>,
    breakPoint?: BreakPoint
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
  public getAttributeName(): string {
    return this.attributeName;
  }

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
  public usesBreakpoints(): boolean {
    return true;
  }

  public getAttributeNames(): string[] {
    if (!this.usesBreakpoints()) {
      return [this.getAttributeName()];
    }

    // If the converter uses breakpoints, we need to create a selector for each breakpoint as well as the default one
    return breakpoints.map((breakpoint) => {
      const attr = breakpoint
        ? `${this.getAttributeName()}.${breakpoint}`
        : this.getAttributeName();
      return attr;
    });
  }

  public getSelectors(): string {
    return this.getAttributeNames()
      .map((attribute) => `[${attribute}]`)
      .join(", ");
  }
}
