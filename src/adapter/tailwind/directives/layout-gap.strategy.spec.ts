import { planLayoutGap } from './layout-gap.strategy';

describe('planLayoutGap', () => {
  test.each([
    ['4', 'row', ['gap-[4px]']],
    ['1.5rem', 'column', ['gap-[1.5rem]']],
    ['0', '', ['gap-[0px]']],
  ] as const)('emits a theme-independent gap for %j', (value, layout, expected) => {
    expect(planLayoutGap(value, layout)).toEqual({ status: 'converted', classNames: expected });
  });

  test.each(['row wrap', 'column wrap-reverse'])('preserves wrapping margin semantics for %j', layout => {
    expect(planLayoutGap('4', layout)).toMatchObject({
      status: 'review',
      code: 'semantic-unsupported',
    });
  });

  test('does not confuse the upstream grid gap algorithm with CSS Grid display', () => {
    expect(planLayoutGap('10px grid', 'row')).toMatchObject({
      status: 'review',
      code: 'semantic-unsupported',
    });
  });

  test('preserves a negative margin gap that CSS gap cannot represent', () => {
    expect(planLayoutGap('-4', 'row')).toMatchObject({
      status: 'review',
      code: 'semantic-unsupported',
    });
  });

  test.each(['calc(1px - 2px)', 'var(--gap)', 'min(4px, 2vw)', 'clamp(0px, 1vw, 8px)'])(
    'preserves computed gap %j when non-negativity cannot be proven',
    value => {
      expect(planLayoutGap(value, 'row')).toMatchObject({
        status: 'review',
        code: 'context-unverified',
      });
    },
  );

  test.each(['', 'wide', '1;display:none', '10 px'])('rejects invalid gaps %j', value => {
    expect(planLayoutGap(value, 'row')).toEqual({ status: 'invalid', code: 'invalid-value' });
  });

  test('preserves a valid gap when layout context is dynamic', () => {
    expect(planLayoutGap('4', undefined)).toMatchObject({ status: 'review', code: 'context-unverified' });
  });
});
