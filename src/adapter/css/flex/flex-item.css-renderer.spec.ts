import { planFlexItemSemantics } from '../../../flex/flex-item.semantic';
import { renderFlexItemCss } from './flex-item.css-renderer';

describe('renderFlexItemCss', () => {
  test.each([
    [
      { basis: '3 2 calc(100% - 2rem)', layout: 'row' },
      [
        { property: 'flex-grow', value: '3' },
        { property: 'flex-shrink', value: '2' },
        { property: 'flex-basis', value: 'calc(100% - 2rem)' },
        { property: 'min-width', value: 'calc(100% - 2rem)' },
        { property: 'box-sizing', value: 'border-box' },
      ],
    ],
    [
      { basis: '0 0 calc(50% - 1rem)', layout: 'column wrap' },
      [
        { property: 'flex-grow', value: '0' },
        { property: 'flex-shrink', value: '0' },
        { property: 'flex-basis', value: 'calc(50% - 1rem)' },
        { property: 'min-height', value: 'calc(50% - 1rem)' },
        { property: 'max-height', value: 'calc(50% - 1rem)' },
        { property: 'box-sizing', value: 'border-box' },
      ],
    ],
    [
      { basis: 'auto', layout: 'row' },
      [
        { property: 'flex', value: '1 1 auto' },
        { property: 'box-sizing', value: 'border-box' },
      ],
    ],
    [
      { basis: '', layout: 'row' },
      [
        { property: 'flex', value: '1 1 0%' },
        { property: 'box-sizing', value: 'border-box' },
      ],
    ],
    [
      { basis: '', layout: 'column' },
      [
        { property: 'flex', value: '1 1 0.000000001px' },
        { property: 'box-sizing', value: 'border-box' },
      ],
    ],
    [
      { basis: '0 0 10rem', layout: 'row' },
      [
        { property: 'flex', value: '0 0 10rem' },
        { property: 'min-width', value: '10rem' },
        { property: 'max-width', value: '10rem' },
        { property: 'box-sizing', value: 'border-box' },
      ],
    ],
    [
      { basis: '12px', layout: 'column' },
      [
        { property: 'flex', value: '1 1 12px' },
        { property: 'min-height', value: '12px' },
        { property: 'max-height', value: '12px' },
        { property: 'box-sizing', value: 'border-box' },
      ],
    ],
    [
      { basis: '25%', layout: 'row wrap' },
      [
        { property: 'flex', value: '1 1 25%' },
        { property: 'max-width', value: '25%' },
        { property: 'box-sizing', value: 'border-box' },
      ],
    ],
    [
      { basis: 'initial', layout: 'row' },
      [
        { property: 'flex', value: '0 1 auto' },
        { property: 'box-sizing', value: 'border-box' },
      ],
    ],
    [
      { basis: 'nogrow', layout: 'row' },
      [
        { property: 'flex', value: '0 1 auto' },
        { property: 'box-sizing', value: 'border-box' },
      ],
    ],
    [
      { basis: 'grow', layout: 'row' },
      [
        { property: 'flex', value: '1 1 100%' },
        { property: 'max-width', value: '100%' },
        { property: 'box-sizing', value: 'border-box' },
      ],
    ],
    [
      { basis: 'noshrink', layout: 'row' },
      [
        { property: 'flex', value: '1 0 auto' },
        { property: 'box-sizing', value: 'border-box' },
      ],
    ],
    [
      { basis: 'none', layout: 'row' },
      [
        { property: 'flex', value: '0 0 auto' },
        { property: 'box-sizing', value: 'border-box' },
      ],
    ],
  ] as const)('renders verified item semantics from %o as ordered native CSS declarations', (input, expected) => {
    const planned = planFlexItemSemantics(input);

    expect(planned.status).toBe('planned');
    if (planned.status !== 'planned') throw new Error('Expected a planned flex item semantic value');

    expect(renderFlexItemCss(planned.value)).toEqual(expected);
  });

  test('returns immutable flex item declarations', () => {
    const planned = planFlexItemSemantics({ basis: '12px', layout: 'column' });

    expect(planned.status).toBe('planned');
    if (planned.status !== 'planned') throw new Error('Expected a planned flex item semantic value');

    const declarations = renderFlexItemCss(planned.value);

    expect(Object.isFrozen(declarations)).toBe(true);
    expect(Object.isFrozen(declarations[0])).toBe(true);
  });
});
