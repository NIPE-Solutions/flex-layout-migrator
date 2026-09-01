import type { LocatedFlexLayoutInput } from '../../../analyzer/flex-layout-attribute.analyzer';
import { parseVisibilityValue } from './visibility-value.parser';

function input(overrides: Partial<LocatedFlexLayoutInput> = {}): LocatedFlexLayoutInput {
  return {
    id: 'fixture:0',
    fileName: 'fixture.html',
    elementId: '0',
    sourceName: 'fxShow',
    directive: 'fxShow',
    value: '',
    binding: 'literal',
    breakpoint: undefined,
    source: { start: 0, end: 8 },
    nameSource: { start: 0, end: 6 },
    ...overrides,
  };
}

describe('parseVisibilityValue', () => {
  test.each([
    ['fxShow', '', 'shown'],
    ['fxShow', 'false', 'hidden'],
    ['fxShow', '0', 'shown'],
    ['fxShow', 'FALSE', 'shown'],
    ['fxHide', '', 'hidden'],
    ['fxHide', 'false', 'shown'],
    ['fxHide', '0', 'hidden'],
  ] as const)('%s=%j normalizes to %s', (directive, value, expected) => {
    expect(parseVisibilityValue(input({ directive, value }))).toBe(expected);
  });

  test('rejects another directive because callers must classify visibility inputs first', () => {
    expect(() => parseVisibilityValue(input({ directive: 'fxLayout', sourceName: 'fxLayout', value: 'row' }))).toThrow(
      'Visibility value parser requires a literal fxShow or fxHide input.',
    );
  });

  test('rejects property bindings because callers must classify bindings first', () => {
    expect(() =>
      parseVisibilityValue(input({ binding: 'property', sourceName: '[fxShow]', value: 'isVisible' })),
    ).toThrow('Visibility value parser requires a literal fxShow or fxHide input.');
  });
});
