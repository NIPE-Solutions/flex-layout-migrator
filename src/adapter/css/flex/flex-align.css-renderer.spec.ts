import { planFlexAlignSemantics } from '../../../flex/flex-align.semantic';
import { renderFlexAlignCss } from './flex-align.css-renderer';

describe('renderFlexAlignCss', () => {
  test.each([
    ['auto', 'auto'],
    ['start', 'flex-start'],
    ['end', 'flex-end'],
    ['center', 'center'],
    ['baseline', 'baseline'],
    ['stretch', 'stretch'],
  ] as const)('renders %j self alignment as %j', (source, expectedValue) => {
    const planned = planFlexAlignSemantics(source);

    expect(planned.status).toBe('planned');
    if (planned.status !== 'planned') throw new Error('Expected a planned flex alignment semantic value');

    expect(renderFlexAlignCss(planned.value)).toEqual([{ property: 'align-self', value: expectedValue }]);
  });

  test('returns immutable self alignment declarations', () => {
    const planned = planFlexAlignSemantics('start');

    expect(planned.status).toBe('planned');
    if (planned.status !== 'planned') throw new Error('Expected a planned flex alignment semantic value');

    const declarations = renderFlexAlignCss(planned.value);

    expect(Object.isFrozen(declarations)).toBe(true);
    expect(Object.isFrozen(declarations[0])).toBe(true);
  });
});
