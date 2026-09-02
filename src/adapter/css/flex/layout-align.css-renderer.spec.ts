import { planLayoutAlignment } from '../../../flex/layout-align.semantic';
import { renderLayoutAlignmentCss } from './layout-align.css-renderer';

describe('renderLayoutAlignmentCss', () => {
  test.each([
    [
      'start start',
      'row',
      [
        { property: 'justify-content', value: 'flex-start' },
        { property: 'align-items', value: 'flex-start' },
        { property: 'align-content', value: 'flex-start' },
        { property: 'display', value: 'flex' },
        { property: 'box-sizing', value: 'border-box' },
        { property: 'flex-direction', value: 'row' },
      ],
    ],
    [
      'end end',
      'row-reverse inline',
      [
        { property: 'justify-content', value: 'flex-end' },
        { property: 'align-items', value: 'flex-end' },
        { property: 'align-content', value: 'flex-end' },
        { property: 'display', value: 'inline-flex' },
        { property: 'box-sizing', value: 'border-box' },
        { property: 'flex-direction', value: 'row-reverse' },
      ],
    ],
    [
      'center baseline',
      'column nowrap',
      [
        { property: 'justify-content', value: 'center' },
        { property: 'align-items', value: 'baseline' },
        { property: 'align-content', value: 'stretch' },
        { property: 'display', value: 'flex' },
        { property: 'box-sizing', value: 'border-box' },
        { property: 'flex-direction', value: 'column' },
        { property: 'flex-wrap', value: 'nowrap' },
      ],
    ],
    [
      'space-around space-around',
      'row wrap',
      [
        { property: 'justify-content', value: 'space-around' },
        { property: 'align-items', value: 'stretch' },
        { property: 'align-content', value: 'space-around' },
        { property: 'display', value: 'flex' },
        { property: 'box-sizing', value: 'border-box' },
        { property: 'flex-direction', value: 'row' },
        { property: 'flex-wrap', value: 'wrap' },
      ],
    ],
    [
      'space-between space-between',
      'column wrap-reverse',
      [
        { property: 'justify-content', value: 'space-between' },
        { property: 'align-items', value: 'stretch' },
        { property: 'align-content', value: 'space-between' },
        { property: 'display', value: 'flex' },
        { property: 'box-sizing', value: 'border-box' },
        { property: 'flex-direction', value: 'column' },
        { property: 'flex-wrap', value: 'wrap-reverse' },
      ],
    ],
    [
      'space-evenly stretch',
      'column-reverse',
      [
        { property: 'justify-content', value: 'space-evenly' },
        { property: 'align-items', value: 'stretch' },
        { property: 'align-content', value: 'stretch' },
        { property: 'display', value: 'flex' },
        { property: 'box-sizing', value: 'border-box' },
        { property: 'flex-direction', value: 'column-reverse' },
        { property: 'max-width', value: '100%' },
      ],
    ],
    [
      'center stretch',
      'row',
      [
        { property: 'justify-content', value: 'center' },
        { property: 'align-items', value: 'stretch' },
        { property: 'align-content', value: 'stretch' },
        { property: 'display', value: 'flex' },
        { property: 'box-sizing', value: 'border-box' },
        { property: 'flex-direction', value: 'row' },
        { property: 'max-height', value: '100%' },
      ],
    ],
  ] as const)('renders verified %j alignment semantics with its active %j layout', (source, layout, expected) => {
    const planned = planLayoutAlignment(source, layout);

    expect(planned.status).toBe('planned');
    if (planned.status !== 'planned') throw new Error('Expected a planned layout alignment semantic value');

    expect(renderLayoutAlignmentCss(planned.value)).toEqual(expected);
  });

  test('returns immutable alignment declarations', () => {
    const planned = planLayoutAlignment('center stretch', 'row');

    expect(planned.status).toBe('planned');
    if (planned.status !== 'planned') throw new Error('Expected a planned layout alignment semantic value');

    const declarations = renderLayoutAlignmentCss(planned.value);

    expect(Object.isFrozen(declarations)).toBe(true);
    expect(Object.isFrozen(declarations[0])).toBe(true);
  });
});
