import { planFlexItem } from './flex-item.strategy';

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
