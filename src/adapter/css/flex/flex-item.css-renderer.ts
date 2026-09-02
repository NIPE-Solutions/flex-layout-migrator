import type { CssDeclaration } from '../css-artifact.model';
import type { FlexItemSemantics } from '../../../flex/flex-item.semantic';

function freezeDeclarations(declarations: readonly CssDeclaration[]): readonly CssDeclaration[] {
  return Object.freeze(declarations.map(declaration => Object.freeze({ ...declaration })));
}

export function renderFlexItemCss(value: FlexItemSemantics): readonly CssDeclaration[] {
  const flexDeclarations =
    value.basis.kind === 'computed'
      ? [
          { property: 'flex-grow', value: value.grow },
          { property: 'flex-shrink', value: value.shrink },
          { property: 'flex-basis', value: value.basis.value },
        ]
      : [{ property: 'flex', value: `${value.grow} ${value.shrink} ${value.basis.value}` }];

  return freezeDeclarations([
    ...flexDeclarations,
    ...(value.min ? [{ property: `min-${value.axis}`, value: value.min }] : []),
    ...(value.max ? [{ property: `max-${value.axis}`, value: value.max }] : []),
    { property: 'box-sizing', value: value.boxSizing },
  ]);
}
