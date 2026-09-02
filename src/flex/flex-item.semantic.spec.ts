import { planFlexItemSemantics } from './flex-item.semantic';

describe('planFlexItemSemantics', () => {
  test.each([
    [
      { basis: '', layout: 'row' },
      { grow: '1', shrink: '1', basis: '0%', axis: 'width', splitProperties: false },
    ],
    [
      { basis: '0px', layout: 'row-reverse' },
      { grow: '1', shrink: '1', basis: '0%', axis: 'width', splitProperties: false },
    ],
    [
      { basis: '', layout: 'column' },
      { grow: '1', shrink: '1', basis: '0.000000001px', axis: 'height', splitProperties: false },
    ],
    [
      { basis: '25', layout: 'row' },
      { grow: '1', shrink: '1', basis: '100%', axis: 'width', max: '25%', splitProperties: false },
    ],
    [
      { basis: '25%', layout: 'row wrap' },
      { grow: '1', shrink: '1', basis: '25%', axis: 'width', max: '25%', splitProperties: false },
    ],
    [
      { basis: '25%', layout: 'row wrap-reverse' },
      { grow: '1', shrink: '1', basis: '100%', axis: 'width', max: '25%', splitProperties: false },
    ],
    [
      { basis: '10rem', layout: 'column' },
      {
        grow: '1',
        shrink: '1',
        basis: '10rem',
        axis: 'height',
        min: '10rem',
        max: '10rem',
        splitProperties: false,
      },
    ],
    [
      { basis: '12px', layout: 'column-reverse' },
      {
        grow: '1',
        shrink: '1',
        basis: '12px',
        axis: 'height',
        min: '12px',
        max: '12px',
        splitProperties: false,
      },
    ],
  ] as const)('derives effective sizing for %o', (input, expected) => {
    expect(planFlexItemSemantics(input)).toEqual({ status: 'planned', value: expected });
  });

  test.each([
    ['initial', { grow: '0', shrink: '1', basis: 'auto' }],
    ['nogrow', { grow: '0', shrink: '1', basis: 'auto' }],
    ['grow', { grow: '1', shrink: '1', basis: '100%', max: '100%' }],
    ['noshrink', { grow: '1', shrink: '0', basis: 'auto' }],
    ['none', { grow: '0', shrink: '0', basis: 'auto' }],
  ] as const)('expands the %j sizing keyword', (basis, expected) => {
    expect(planFlexItemSemantics({ basis, layout: 'row' })).toEqual({
      status: 'planned',
      value: { ...expected, axis: 'width', splitProperties: false },
    });
  });

  test('lets explicit factors control percentage constraints', () => {
    expect(planFlexItemSemantics({ basis: '25', grow: '2', shrink: '0', layout: 'row' })).toEqual({
      status: 'planned',
      value: { grow: '2', shrink: '0', basis: '25%', axis: 'width', splitProperties: false },
    });
  });

  test('extracts all three shorthand components before applying sizing rules', () => {
    expect(planFlexItemSemantics({ basis: '0 0 10rem', grow: '4', shrink: '5', layout: 'row' })).toEqual({
      status: 'planned',
      value: {
        grow: '0',
        shrink: '0',
        basis: '10rem',
        axis: 'width',
        min: '10rem',
        max: '10rem',
        splitProperties: false,
      },
    });
  });

  test('marks calc sizing for split-property rendering and omits its unsafe maximum', () => {
    expect(planFlexItemSemantics({ basis: '3 2 calc(100% - 2rem)', layout: 'row' })).toEqual({
      status: 'planned',
      value: {
        grow: '3',
        shrink: '2',
        basis: 'calc(100% - 2rem)',
        axis: 'width',
        min: 'calc(100% - 2rem)',
        splitProperties: true,
      },
    });
  });

  test('uses both constraints for a fixed calc basis and wrapping chooses the maximum fallback', () => {
    expect(planFlexItemSemantics({ basis: '0 0 calc(50% - 1rem)', layout: 'column wrap' })).toEqual({
      status: 'planned',
      value: {
        grow: '0',
        shrink: '0',
        basis: 'calc(50% - 1rem)',
        axis: 'height',
        min: 'calc(50% - 1rem)',
        max: 'calc(50% - 1rem)',
        splitProperties: true,
      },
    });
  });

  test.each([
    { basis: 'wide', layout: 'row' },
    { basis: '10 px', layout: 'row' },
    { basis: '1 2', layout: 'row' },
    { basis: '25', grow: 'fast', layout: 'row' },
    { basis: '25', grow: '-1', layout: 'row' },
    { basis: '25', shrink: '.5', layout: 'row' },
    { basis: '1 fast 25px', layout: 'row' },
    { basis: '25', layout: 'diagonal' },
  ] as const)('rejects invalid sizing input %o', input => {
    expect(planFlexItemSemantics(input)).toEqual({ status: 'invalid', code: 'invalid-value' });
  });

  test('preserves sizing for review when parent layout context is missing', () => {
    expect(planFlexItemSemantics({ basis: '25', layout: undefined })).toEqual({
      status: 'review',
      code: 'context-unverified',
      reason: 'Flex sizing depends on a dynamic parent direction or wrapping mode.',
      suggestion: 'Make the parent layout static or migrate this flex item manually.',
    });
  });
});
