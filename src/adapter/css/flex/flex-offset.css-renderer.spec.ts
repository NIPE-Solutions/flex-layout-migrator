import { planFlexOffsetSemantics } from '../../../flex/flex-offset.semantic';
import { renderFlexOffsetCss } from './flex-offset.css-renderer';

describe('renderFlexOffsetCss', () => {
  test.each([
    ['10px', 'row', [{ property: 'margin-inline-start', value: '10px' }]],
    ['2rem', 'column', [{ property: 'margin-block-start', value: '2rem' }]],
  ] as const)('renders %j on the verified %j axis', (source, layout, expected) => {
    const planned = planFlexOffsetSemantics(source, layout);

    expect(planned.status).toBe('planned');
    if (planned.status !== 'planned') throw new Error('Expected a planned flex offset semantic value');

    expect(renderFlexOffsetCss(planned.value)).toEqual(expected);
  });

  test('returns immutable offset declarations', () => {
    const planned = planFlexOffsetSemantics('10px', 'row');

    expect(planned.status).toBe('planned');
    if (planned.status !== 'planned') throw new Error('Expected a planned flex offset semantic value');

    const declarations = renderFlexOffsetCss(planned.value);

    expect(Object.isFrozen(declarations)).toBe(true);
    expect(Object.isFrozen(declarations[0])).toBe(true);
  });
});
