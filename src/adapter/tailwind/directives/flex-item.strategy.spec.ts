import type { CssLength } from '../../../flex/css-length';
import { planFlexItem, renderFlexItem } from './flex-item.strategy';

describe('planFlexItem', () => {
  test.each([
    ['', undefined, undefined, 'row', ['[flex:1_1_0%]', 'box-border']],
    ['0px', undefined, undefined, 'row', ['[flex:1_1_0%]', 'box-border']],
    ['25', undefined, undefined, 'row', ['[flex:1_1_100%]', '[max-width:25%]', 'box-border']],
    ['25px', undefined, undefined, 'row', ['[flex:1_1_25px]', '[min-width:25px]', '[max-width:25px]', 'box-border']],
    ['25', '2', '0', 'row', ['[flex:2_0_25%]', 'box-border']],
    ['initial', undefined, undefined, 'row', ['[flex:0_1_auto]', 'box-border']],
    ['none', undefined, undefined, 'row', ['[flex:0_0_auto]', 'box-border']],
    ['grow', undefined, undefined, 'row', ['[flex:1_1_100%]', '[max-width:100%]', 'box-border']],
    [
      '10rem',
      undefined,
      undefined,
      'column',
      ['[flex:1_1_10rem]', '[min-height:10rem]', '[max-height:10rem]', 'box-border'],
    ],
    [
      '3 2 calc(100% - 2rem)',
      undefined,
      undefined,
      'row',
      [
        '[flex-grow:3]',
        '[flex-shrink:2]',
        '[flex-basis:calc(100%_-_2rem)]',
        '[min-width:calc(100%_-_2rem)]',
        'box-border',
      ],
    ],
    ['25', undefined, undefined, 'row wrap-reverse', ['[flex:1_1_100%]', '[max-width:25%]', 'box-border']],
  ] as const)('reproduces fxFlex=%j grow=%j shrink=%j in %j', (basis, grow, shrink, layout, expected) => {
    expect(planFlexItem({ basis, grow, shrink, layout })).toEqual({
      status: 'converted',
      classNames: expected,
    });
  });

  test.each([
    [{ basis: 'wide', layout: 'row' }, 'invalid-value'],
    [{ basis: '25', grow: 'fast', layout: 'row' }, 'invalid-value'],
    [{ basis: '25', layout: undefined }, 'context-unverified'],
  ] as const)('preserves or rejects invalid flex input %o', (input, code) => {
    expect(planFlexItem(input)).toMatchObject({ code });
  });
});

describe('renderFlexItem', () => {
  test('renders shorthand sizing and semantic axis constraints in the existing order', () => {
    expect(
      renderFlexItem({
        grow: '1',
        shrink: '1',
        basis: { kind: 'literal', value: '10rem' as CssLength },
        axis: 'height',
        min: '10rem' as CssLength,
        max: '10rem' as CssLength,
        boxSizing: 'border-box',
      }),
    ).toEqual(['[flex:1_1_10rem]', '[min-height:10rem]', '[max-height:10rem]', 'box-border']);
  });

  test('renders a computed basis as separate arbitrary properties', () => {
    expect(
      renderFlexItem({
        grow: '3',
        shrink: '2',
        basis: { kind: 'computed', value: 'calc(100% - 2rem)' as CssLength },
        axis: 'width',
        min: 'calc(100% - 2rem)' as CssLength,
        boxSizing: 'border-box',
      }),
    ).toEqual([
      '[flex-grow:3]',
      '[flex-shrink:2]',
      '[flex-basis:calc(100%_-_2rem)]',
      '[min-width:calc(100%_-_2rem)]',
      'box-border',
    ]);
  });
});
