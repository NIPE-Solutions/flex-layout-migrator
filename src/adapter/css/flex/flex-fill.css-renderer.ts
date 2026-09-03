import type { CssDeclaration } from '../css-artifact.model';
import type { FlexFillSemantics } from '../../../flex/flex-fill.semantic';

function freezeDeclarations(declarations: readonly CssDeclaration[]): readonly CssDeclaration[] {
  return Object.freeze(declarations.map(declaration => Object.freeze({ ...declaration })));
}

export function renderFlexFillCss(value: FlexFillSemantics): readonly CssDeclaration[] {
  return freezeDeclarations([
    { property: 'margin', value: value.margin },
    { property: 'width', value: value.width },
    { property: 'height', value: value.height },
    { property: 'min-width', value: value.minWidth },
    { property: 'min-height', value: value.minHeight },
  ]);
}
