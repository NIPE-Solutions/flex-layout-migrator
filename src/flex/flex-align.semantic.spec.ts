import { planFlexAlignSemantics } from './flex-align.semantic';

describe('planFlexAlignSemantics', () => {
  test.each([
    ['', 'stretch'],
    ['auto', 'auto'],
    ['start', 'start'],
    ['end', 'end'],
    ['center', 'center'],
    ['baseline', 'baseline'],
    ['stretch', 'stretch'],
  ] as const)('plans %j as self alignment %j', (source, alignment) => {
    expect(planFlexAlignSemantics(source)).toEqual({ status: 'planned', value: { alignment } });
  });

  test.each(['sideways', 'start end', 'flex-start'] as const)('rejects unsupported self alignment %j', source => {
    expect(planFlexAlignSemantics(source)).toEqual({ status: 'invalid', code: 'invalid-value' });
  });
});
