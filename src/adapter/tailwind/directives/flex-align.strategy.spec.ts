import { planFlexAlign } from './flex-align.strategy';

describe('planFlexAlign', () => {
  test.each([
    ['', ['self-stretch']],
    ['start', ['self-start']],
    ['end', ['self-end']],
    ['center', ['self-center']],
    ['baseline', ['self-baseline']],
    ['stretch', ['self-stretch']],
    ['auto', ['self-auto']],
  ] as const)('maps %j to align-self', (value, classNames) => {
    expect(planFlexAlign(value)).toEqual({ status: 'converted', classNames });
  });

  test.each(['left', 'space-between', 'start end'])('rejects %j', value => {
    expect(planFlexAlign(value)).toEqual({ status: 'invalid', code: 'invalid-value' });
  });
});
