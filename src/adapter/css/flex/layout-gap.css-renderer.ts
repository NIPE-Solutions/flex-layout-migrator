import type { CssDeclaration } from '../css-artifact.model';
import type { LayoutGapSemantics } from '../../../flex/layout-gap.semantic';

export function renderLayoutGapCss(value: LayoutGapSemantics): readonly CssDeclaration[] {
  return Object.freeze([Object.freeze({ property: 'gap', value: value.length })]);
}
