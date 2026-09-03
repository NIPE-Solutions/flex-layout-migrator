import { planFlexOrderSemantics } from '../../../flex/flex-order.semantic';
import { renderFlexOrderCss } from './flex-order.css-renderer';

describe('renderFlexOrderCss', () => {
  test.each([
    ['2', [{ property: 'order', value: '2' }]],
    ['-3', [{ property: 'order', value: '-3' }]],
    ['0', []],
    ['first', []],
  ] as const)(
    'renders source order %j without introducing an artifact for zero-equivalent values',
    (source, expected) => {
      const planned = planFlexOrderSemantics(source);

      expect(planned.status).toBe('planned');
      if (planned.status !== 'planned') throw new Error('Expected a planned flex order semantic value');

      expect(renderFlexOrderCss(planned.value)).toEqual(expected);
    },
  );

  test('returns frozen declarations and shares the empty no-order result', () => {
    const positive = planFlexOrderSemantics('2');
    const zero = planFlexOrderSemantics('0');
    const nonnumeric = planFlexOrderSemantics('first');

    expect(positive.status).toBe('planned');
    expect(zero.status).toBe('planned');
    expect(nonnumeric.status).toBe('planned');
    if (positive.status !== 'planned' || zero.status !== 'planned' || nonnumeric.status !== 'planned') {
      throw new Error('Expected planned flex order semantic values');
    }

    const positiveDeclarations = renderFlexOrderCss(positive.value);
    const zeroDeclarations = renderFlexOrderCss(zero.value);

    expect(Object.isFrozen(positiveDeclarations)).toBe(true);
    expect(Object.isFrozen(positiveDeclarations[0])).toBe(true);
    expect(Object.isFrozen(zeroDeclarations)).toBe(true);
    expect(renderFlexOrderCss(nonnumeric.value)).toBe(zeroDeclarations);
  });
});
