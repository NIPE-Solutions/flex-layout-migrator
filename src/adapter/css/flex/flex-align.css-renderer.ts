import type { CssDeclaration } from '../css-artifact.model';
import type { FlexAlignSemantics, FlexSelfAlignment } from '../../../flex/flex-align.semantic';

const alignmentValues: Readonly<Record<FlexSelfAlignment, CssDeclaration['value']>> = {
  auto: 'auto',
  start: 'flex-start',
  end: 'flex-end',
  center: 'center',
  baseline: 'baseline',
  stretch: 'stretch',
};

export function renderFlexAlignCss(value: FlexAlignSemantics): readonly CssDeclaration[] {
  return Object.freeze([Object.freeze({ property: 'align-self', value: alignmentValues[value.alignment] })]);
}
