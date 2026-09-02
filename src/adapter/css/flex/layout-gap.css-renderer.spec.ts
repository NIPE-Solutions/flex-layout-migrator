import { planLayoutGapSemantics } from '../../../flex/layout-gap.semantic';
import { renderLayoutGapCss } from './layout-gap.css-renderer';

describe('renderLayoutGapCss', () => {
  test.each([
    ['4', 'row', [{ property: 'gap', value: '4px' }]],
    ['1.5rem', 'column', [{ property: 'gap', value: '1.5rem' }]],
    ['0', '', [{ property: 'gap', value: '0px' }]],
  ] as const)('renders verified %j gap semantics as %j', (source, layout, expected) => {
    const planned = planLayoutGapSemantics(source, layout);

    expect(planned.status).toBe('planned');
    if (planned.status !== 'planned') throw new Error('Expected a planned layout gap semantic value');

    expect(renderLayoutGapCss(planned.value)).toEqual(expected);
  });

  test('returns immutable gap declarations', () => {
    const planned = planLayoutGapSemantics('4', 'row');

    expect(planned.status).toBe('planned');
    if (planned.status !== 'planned') throw new Error('Expected a planned layout gap semantic value');

    const declarations = renderLayoutGapCss(planned.value);

    expect(Object.isFrozen(declarations)).toBe(true);
    expect(Object.isFrozen(declarations[0])).toBe(true);
  });
});
