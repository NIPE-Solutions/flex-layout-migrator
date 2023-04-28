import * as cheerio from "cheerio";

const BREAKPOINTS = [
  "", // Without breakpoint
  "xs",
  "sm",
  "md",
  "lg",
  "xl",
  "lt-sm",
  "lt-md",
  "lt-lg",
  "lt-xl",
  "gt-xs",
  "gt-sm",
  "gt-md",
  "gt-lg",
];

export abstract class AttributeConverter {
  public abstract convert(
    value: string,
    element: cheerio.Cheerio<any>,
    breakPoint?: string
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
  public abstract getAttributeName(): string;

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

  public getSelectors(): string {
    if (!this.usesBreakpoints()) {
      return `[${this.getAttributeName()}]`;
    }

    // If the converter uses breakpoints, we need to create a selector for each breakpoint as well as the default one
    return BREAKPOINTS.map((breakpoint) => {
      const attr = breakpoint
        ? `${this.getAttributeName()}.${breakpoint}`
        : this.getAttributeName();
      return `[${attr}]`;
    }).join(", ");
  }
}
