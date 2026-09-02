import { planFlexFillSemantics } from '../../../flex/flex-fill.semantic';
import { renderFlexFillCss } from './flex-fill.css-renderer';

describe('renderFlexFillCss', () => {
  test('renders verified fill semantics in the CSS family order', () => {
    const planned = planFlexFillSemantics();

    expect(planned.status).toBe('planned');
    if (planned.status !== 'planned') throw new Error('Expected a planned flex fill semantic value');

    expect(renderFlexFillCss(planned.value)).toEqual([
      { property: 'margin', value: '0' },
      { property: 'width', value: '100%' },
      { property: 'height', value: '100%' },
      { property: 'min-width', value: '100%' },
      { property: 'min-height', value: '100%' },
    ]);
  });

  test('returns immutable fill declarations', () => {
    const planned = planFlexFillSemantics();

    expect(planned.status).toBe('planned');
    if (planned.status !== 'planned') throw new Error('Expected a planned flex fill semantic value');

    const declarations = renderFlexFillCss(planned.value);

    expect(Object.isFrozen(declarations)).toBe(true);
    expect(Object.isFrozen(declarations[0])).toBe(true);
  });
});
