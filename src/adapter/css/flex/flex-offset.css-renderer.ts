import type { CssDeclaration } from '../css-artifact.model';
import type { FlexOffsetSemantics } from '../../../flex/flex-offset.semantic';

const propertyByAxis: Readonly<Record<FlexOffsetSemantics['axis'], CssDeclaration['property']>> = {
  'inline-start': 'margin-inline-start',
  'block-start': 'margin-block-start',
};

export function renderFlexOffsetCss(value: FlexOffsetSemantics): readonly CssDeclaration[] {
  return Object.freeze([Object.freeze({ property: propertyByAxis[value.axis], value: value.length })]);
}
