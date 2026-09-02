import type { CssDeclaration } from '../css-artifact.model';
import type { LayoutDirection, LayoutSemantics, LayoutWrap } from '../../../flex/layout.semantic';

const displayValues: Readonly<Record<LayoutSemantics['display'], CssDeclaration['value']>> = {
  flex: 'flex',
  'inline-flex': 'inline-flex',
};

const directionValues: Readonly<Record<LayoutDirection, CssDeclaration['value']>> = {
  row: 'row',
  'row-reverse': 'row-reverse',
  column: 'column',
  'column-reverse': 'column-reverse',
};

const wrapValues: Readonly<Record<LayoutWrap, CssDeclaration['value']>> = {
  nowrap: 'nowrap',
  wrap: 'wrap',
  'wrap-reverse': 'wrap-reverse',
};

function freezeDeclarations(declarations: readonly CssDeclaration[]): readonly CssDeclaration[] {
  return Object.freeze(declarations.map(declaration => Object.freeze({ ...declaration })));
}

export function renderLayoutCss(value: LayoutSemantics): readonly CssDeclaration[] {
  return freezeDeclarations([
    { property: 'display', value: displayValues[value.display] },
    { property: 'box-sizing', value: value.boxSizing },
    { property: 'flex-direction', value: directionValues[value.direction] },
    ...(value.explicitWrap ? [{ property: 'flex-wrap', value: wrapValues[value.wrap] }] : []),
  ]);
}
