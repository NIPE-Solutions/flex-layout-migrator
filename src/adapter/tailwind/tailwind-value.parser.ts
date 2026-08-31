import type { CssLength, ParsedValue } from './tailwind-semantic.model';

const NUMBER = String.raw`-?(?:\d+(?:\.\d+)?|\.\d+)`;
const LENGTH = new RegExp(`^${NUMBER}(?:%|px|r?em|v(?:w|h|min|max)|ch|ex|cm|mm|in|pt|pc)$`);
const UNITLESS = new RegExp(`^${NUMBER}$`);
const CSS_FUNCTION = /^(?:calc|clamp|min|max|var)\([a-zA-Z0-9_%+*/.,()\-\s]+\)$/;

export interface CssLengthOptions {
  readonly fallbackUnit: 'px' | '%';
}

export function parseCssLength(source: string, options: CssLengthOptions): ParsedValue<CssLength> {
  const value = source.trim();
  if (UNITLESS.test(value)) {
    return { ok: true, value: `${value}${options.fallbackUnit}` as CssLength };
  }
  if (LENGTH.test(value) || CSS_FUNCTION.test(value)) {
    return { ok: true, value: value as CssLength };
  }
  return { ok: false };
}

export function arbitraryValue(value: string): string {
  return `[${value.replaceAll(' ', '_')}]`;
}
