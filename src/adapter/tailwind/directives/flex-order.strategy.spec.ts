import { planFlexOrder, renderFlexOrder } from './flex-order.strategy';

describe('planFlexOrder', () => {
  test.each([
    ['', []],
    ['0', []],
    ['2', ['[order:2]']],
    ['-3', ['[order:-3]']],
    ['2.9', ['[order:2]']],
    ['2foo', ['[order:2]']],
    ['first', []],
  ] as const)('emits deterministic order for %j', (value, classNames) => {
    expect(planFlexOrder(value)).toEqual({ status: 'converted', classNames });
  });
});

test('renders a planned nonzero order without parsing source text', () => {
  expect(renderFlexOrder({ order: -3 })).toEqual({ status: 'converted', classNames: ['[order:-3]'] });
});
