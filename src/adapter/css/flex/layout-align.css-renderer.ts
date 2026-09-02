import type { CssDeclaration } from '../css-artifact.model';
import type {
  LayoutContentAlignment,
  LayoutItemsAlignment,
  LayoutMainAlignment,
  LayoutAlignmentSemantics,
} from '../../../flex/layout-align.semantic';
import { renderLayoutCss } from './layout.css-renderer';

const mainAlignmentValues: Readonly<Record<LayoutMainAlignment, CssDeclaration['value']>> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  'space-around': 'space-around',
  'space-between': 'space-between',
  'space-evenly': 'space-evenly',
};

const itemsAlignmentValues: Readonly<Record<LayoutItemsAlignment, CssDeclaration['value']>> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  baseline: 'baseline',
  stretch: 'stretch',
};

const contentAlignmentValues: Readonly<Record<LayoutContentAlignment, CssDeclaration['value']>> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
  'space-around': 'space-around',
  'space-between': 'space-between',
};

const stretchMaximumProperties: Readonly<Record<NonNullable<LayoutAlignmentSemantics['stretchMaximum']>, string>> = {
  width: 'max-width',
  height: 'max-height',
};

function freezeDeclarations(declarations: readonly CssDeclaration[]): readonly CssDeclaration[] {
  return Object.freeze(declarations.map(declaration => Object.freeze({ ...declaration })));
}

export function renderLayoutAlignmentCss(value: LayoutAlignmentSemantics): readonly CssDeclaration[] {
  return freezeDeclarations([
    { property: 'justify-content', value: mainAlignmentValues[value.main] },
    { property: 'align-items', value: itemsAlignmentValues[value.items] },
    { property: 'align-content', value: contentAlignmentValues[value.content] },
    ...renderLayoutCss(value.layout),
    ...(value.stretchMaximum === undefined
      ? []
      : [{ property: stretchMaximumProperties[value.stretchMaximum], value: '100%' }]),
  ]);
}
