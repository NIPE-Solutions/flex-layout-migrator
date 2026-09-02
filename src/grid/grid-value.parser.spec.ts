import type { FlexLayoutInput } from '../analyzer/flex-layout-attribute.analyzer';
import type { FlexLayoutDirective } from '../analyzer/flex-layout.catalog';
import { parseGridValue } from './grid-value.parser';

function input(
  directive: FlexLayoutDirective,
  value: string,
  binding: 'literal' | 'property' = 'literal',
): FlexLayoutInput {
  return { sourceName: directive, directive, value, binding, breakpoint: undefined };
}

describe('parseGridValue', () => {
  test.each([
    [
      'gdAlignColumns',
      '',
      [
        ['align-content', 'start'],
        ['align-items', 'stretch'],
      ],
    ],
    [
      'gdAlignColumns',
      'space-evenly center',
      [
        ['align-content', 'space-evenly'],
        ['align-items', 'center'],
      ],
    ],
    [
      'gdAlignColumns',
      'bogus baseline',
      [
        ['align-content', 'start'],
        ['align-items', 'stretch'],
      ],
    ],
    [
      'gdAlignRows',
      '',
      [
        ['justify-content', 'start'],
        ['justify-items', 'stretch'],
      ],
    ],
    [
      'gdAlignRows',
      'space-between end',
      [
        ['justify-content', 'space-between'],
        ['justify-items', 'end'],
      ],
    ],
    [
      'gdAreas',
      'header header | nav main | footer footer',
      [['grid-template-areas', '"header header" "nav main" "footer footer"']],
    ],
    ['gdAreas', '', [['grid-template-areas', '"none"']]],
    ['gdAuto', '', [['grid-auto-flow', 'row']]],
    ['gdAuto', 'column dense', [['grid-auto-flow', 'column dense']]],
    ['gdAuto', 'dense dense', [['grid-auto-flow', 'dense']]],
    ['gdAuto', 'invalid dense', [['grid-auto-flow', 'row dense']]],
    ['gdColumns', '', [['grid-template-columns', 'none']]],
    ['gdColumns', '[first] 1fr [last]', [['grid-template-columns', '[first] 1fr [last]']]],
    ['gdColumns', 'minmax(0, 1fr)!', [['grid-auto-columns', 'minmax(0, 1fr)']]],
    ['gdRows', '', [['grid-template-rows', 'none']]],
    ['gdRows', 'auto 1fr!', [['grid-auto-rows', 'auto 1fr']]],
    ['gdGap', '', [['grid-gap', '0']]],
    ['gdGap', '1rem 2rem', [['grid-gap', '1rem 2rem']]],
    ['gdArea', '', [['grid-area', 'auto']]],
    ['gdArea', 'hero', [['grid-area', 'hero']]],
    ['gdColumn', '', [['grid-column', 'auto']]],
    ['gdColumn', '1 / span 2', [['grid-column', '1 / span 2']]],
    ['gdRow', '', [['grid-row', 'auto']]],
    ['gdRow', '2 / 4', [['grid-row', '2 / 4']]],
    [
      'gdGridAlign',
      '',
      [
        ['justify-self', 'stretch'],
        ['align-self', 'stretch'],
      ],
    ],
    [
      'gdGridAlign',
      'start end',
      [
        ['justify-self', 'start'],
        ['align-self', 'end'],
      ],
    ],
    [
      'gdGridAlign',
      'baseline unsafe',
      [
        ['justify-self', 'stretch'],
        ['align-self', 'stretch'],
      ],
    ],
  ] as const)('reproduces %s value %j', (directive, value, expected) => {
    const result = parseGridValue(input(directive, value));
    expect(result).toEqual({
      status: 'parsed',
      plan: {
        role:
          directive.startsWith('gdAlign') || ['gdAreas', 'gdAuto', 'gdColumns', 'gdGap', 'gdRows'].includes(directive)
            ? 'container'
            : 'child',
        declarations: expected.map(([property, declarationValue]) => ({ property, value: declarationValue })),
        displayDependency:
          directive.startsWith('gdAlign') || ['gdAreas', 'gdAuto', 'gdColumns', 'gdGap', 'gdRows'].includes(directive),
      },
    });
  });

  test.each([
    ['', true],
    ['true', true],
    ['false', false],
    ['0', true],
  ] as const)('uses Angular boolean coercion for gdInline=%j', (value, inline) => {
    expect(parseGridValue(input('gdInline', value))).toEqual({
      status: 'parsed',
      plan: { role: 'modifier', declarations: [], displayDependency: true, inline },
    });
  });

  test('preserves property-bound Grid values', () => {
    expect(parseGridValue(input('gdColumns', 'columns', 'property'))).toMatchObject({
      status: 'review',
      code: 'dynamic-binding',
    });
  });
});
