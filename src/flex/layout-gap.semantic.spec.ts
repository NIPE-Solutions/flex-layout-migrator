import { planLayoutGapSemantics } from './layout-gap.semantic';

describe('planLayoutGapSemantics', () => {
  test.each([
    ['4', 'row', '4px'],
    ['1.5rem', 'column', '1.5rem'],
    ['0', '', '0px'],
  ] as const)('normalizes static gap %j independently of its non-wrapping layout', (value, layout, length) => {
    expect(planLayoutGapSemantics(value, layout)).toEqual({ status: 'planned', value: { length } });
  });

  test('preserves the negative gap diagnostic exactly', () => {
    expect(planLayoutGapSemantics('-4', 'row')).toEqual({
      status: 'review',
      code: 'semantic-unsupported',
      reason: 'Flex-Layout accepts a negative margin gap, but CSS gap does not accept negative values.',
      suggestion: 'Preserve the margin-based spacing or migrate the child margins manually.',
    });
  });

  test.each(['calc(1px - 2px)', 'var(--gap)', 'min(4px, 2vw)', 'clamp(0px, 1vw, 8px)'] as const)(
    'preserves the computed-gap diagnostic for %j',
    value => {
      expect(planLayoutGapSemantics(value, 'row')).toEqual({
        status: 'review',
        code: 'context-unverified',
        reason: 'The computed gap may resolve to a negative value that CSS gap cannot represent.',
        suggestion: 'Prove the value is nonnegative or migrate the margin-based spacing manually.',
      });
    },
  );

  test('preserves the upstream grid gap diagnostic', () => {
    expect(planLayoutGapSemantics('10px grid', 'row')).toEqual({
      status: 'review',
      code: 'semantic-unsupported',
      reason: 'The Flex-Layout grid gap mode changes child padding and compensating host margins.',
      suggestion: 'Replace the grid gap manually after reviewing the child padding behavior.',
    });
  });

  test.each(['row wrap', 'column wrap-reverse'] as const)('preserves the wrapped-layout diagnostic for %j', layout => {
    expect(planLayoutGapSemantics('4', layout)).toEqual({
      status: 'review',
      code: 'semantic-unsupported',
      reason: 'Flex-Layout margins and CSS gap differ when flex items wrap across lines.',
      suggestion: 'Verify the wrapped layout and migrate its spacing manually.',
    });
  });

  test('preserves the missing-layout diagnostic', () => {
    expect(planLayoutGapSemantics('4', undefined)).toEqual({
      status: 'review',
      code: 'context-unverified',
      reason: 'The active flex direction and wrapping behavior depend on a dynamic layout.',
      suggestion: 'Make the layout static or migrate the gap and responsive layout together.',
    });
  });

  test.each(['', 'wide', '1;display:none', '10 px'] as const)('rejects invalid gaps %j', value => {
    expect(planLayoutGapSemantics(value, 'row')).toEqual({ status: 'invalid', code: 'invalid-value' });
  });
});
