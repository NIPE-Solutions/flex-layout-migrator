import type { OwnedCssRule } from '../css-artifact.model';
import { serializeCssRules, type CssNewline } from './css-rule.serializer';

const START_MARKER = '/* flex-layout-codemod:start schema=1 */';
const END_MARKER = '/* flex-layout-codemod:end */';

export { type CssNewline } from './css-rule.serializer';

export function serializeOwnedCssBlock(rules: readonly OwnedCssRule[], newline: CssNewline): string {
  const serializedRules = serializeCssRules(rules, newline);
  if (serializedRules === '') return '';

  return [START_MARKER, serializedRules, END_MARKER].join(newline);
}
