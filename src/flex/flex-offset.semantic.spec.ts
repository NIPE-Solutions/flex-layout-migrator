import { planFlexOffsetSemantics } from './flex-offset.semantic';

describe('planFlexOffsetSemantics', () => {
  test.each([
    ['', 'row', { axis: 'inline-start', length: '0%' }],
    ['4', 'row-reverse', { axis: 'inline-start', length: '4%' }],
    ['10px', 'row', { axis: 'inline-start', length: '10px' }],
    ['4', 'column', { axis: 'block-start', length: '4%' }],
    ['2rem', 'column-reverse', { axis: 'block-start', length: '2rem' }],
  ] as const)('plans %j in %j without applying Tailwind syntax', (source, layout, value) => {
    expect(planFlexOffsetSemantics(source, layout)).toEqual({ status: 'planned', value });
  });

  test('preserves the dynamic parent layout diagnostic', () => {
    expect(planFlexOffsetSemantics('4', undefined)).toEqual({
      status: 'review',
      code: 'context-unverified',
      reason: 'The offset margin axis depends on a dynamic parent layout.',
      suggestion: 'Make the parent layout static or migrate the offset manually.',
    });
  });

  test.each([
    ['wide', 'row'],
    ['1;display:none', 'row'],
    ['4', 'diagonal'],
  ] as const)('rejects invalid offset %j or layout %j', (source, layout) => {
    expect(planFlexOffsetSemantics(source, layout)).toEqual({ status: 'invalid', code: 'invalid-value' });
  });
});
