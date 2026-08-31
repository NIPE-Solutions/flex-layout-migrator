import { planFlexOrder } from './flex-order.strategy';

describe('planFlexOrder', () => {
  test.each([
    ['', ['[order:0]']],
    ['0', ['[order:0]']],
    ['2', ['[order:2]']],
    ['-3', ['[order:-3]']],
  ] as const)('emits deterministic order for %j', (value, classNames) => {
    expect(planFlexOrder(value)).toEqual({ status: 'converted', classNames });
  });

  test.each(['first', '2nd', '1.5', '1 2'])('rejects %j instead of approximating parseInt', value => {
    expect(planFlexOrder(value)).toEqual({ status: 'invalid', code: 'invalid-value' });
  });
});
