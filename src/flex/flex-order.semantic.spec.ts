import { planFlexOrderSemantics } from './flex-order.semantic';

describe('planFlexOrderSemantics', () => {
  test.each([
    ['', undefined],
    ['0', undefined],
    ['2', 2],
    ['-3', -3],
    ['2.9', 2],
    ['2nd', 2],
    ['first', undefined],
  ] as const)('plans source order %j as %j', (source, order) => {
    expect(planFlexOrderSemantics(source)).toEqual({ status: 'planned', value: { order } });
  });
});
