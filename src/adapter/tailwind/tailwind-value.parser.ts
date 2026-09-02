export { parseCssLength } from '../../flex/css-length';
export type { CssLength, CssLengthOptions, ParsedValue } from '../../flex/css-length';

export function arbitraryValue(value: string): string {
  return `[${value.replaceAll(/\s+/g, '_')}]`;
}
