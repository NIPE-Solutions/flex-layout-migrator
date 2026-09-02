import type { CssDeclaration } from '../css-artifact.model';
import type { FlexOrderSemantics } from '../../../flex/flex-order.semantic';

const noDeclarations: readonly CssDeclaration[] = Object.freeze([]);

export function renderFlexOrderCss(value: FlexOrderSemantics): readonly CssDeclaration[] {
  return value.order === undefined
    ? noDeclarations
    : Object.freeze([Object.freeze({ property: 'order', value: String(value.order) })]);
}
