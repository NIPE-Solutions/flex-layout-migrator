import { parseLayout } from '../../../flex/layout.semantic';
import { renderLayoutCss } from './layout.css-renderer';

describe('renderLayoutCss', () => {
  test.each([
    [
      '',
      [
        { property: 'display', value: 'flex' },
        { property: 'box-sizing', value: 'border-box' },
        { property: 'flex-direction', value: 'row' },
      ],
    ],
    [
      'row',
      [
        { property: 'display', value: 'flex' },
        { property: 'box-sizing', value: 'border-box' },
        { property: 'flex-direction', value: 'row' },
      ],
    ],
    [
      'row-reverse',
      [
        { property: 'display', value: 'flex' },
        { property: 'box-sizing', value: 'border-box' },
        { property: 'flex-direction', value: 'row-reverse' },
      ],
    ],
    [
      'column',
      [
        { property: 'display', value: 'flex' },
        { property: 'box-sizing', value: 'border-box' },
        { property: 'flex-direction', value: 'column' },
      ],
    ],
    [
      'column-reverse',
      [
        { property: 'display', value: 'flex' },
        { property: 'box-sizing', value: 'border-box' },
        { property: 'flex-direction', value: 'column-reverse' },
      ],
    ],
    [
      'row inline',
      [
        { property: 'display', value: 'inline-flex' },
        { property: 'box-sizing', value: 'border-box' },
        { property: 'flex-direction', value: 'row' },
      ],
    ],
    [
      'column nowrap',
      [
        { property: 'display', value: 'flex' },
        { property: 'box-sizing', value: 'border-box' },
        { property: 'flex-direction', value: 'column' },
        { property: 'flex-wrap', value: 'nowrap' },
      ],
    ],
    [
      'row wrap',
      [
        { property: 'display', value: 'flex' },
        { property: 'box-sizing', value: 'border-box' },
        { property: 'flex-direction', value: 'row' },
        { property: 'flex-wrap', value: 'wrap' },
      ],
    ],
    [
      'column-reverse wrap-reverse',
      [
        { property: 'display', value: 'flex' },
        { property: 'box-sizing', value: 'border-box' },
        { property: 'flex-direction', value: 'column-reverse' },
        { property: 'flex-wrap', value: 'wrap-reverse' },
      ],
    ],
  ] as const)('renders the verified %j layout semantics in declaration order', (source, expected) => {
    const parsed = parseLayout(source);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('Expected a planned layout semantic value');

    expect(renderLayoutCss(parsed.value)).toEqual(expected);
  });

  test('returns immutable layout declarations', () => {
    const parsed = parseLayout('row wrap');

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('Expected a planned layout semantic value');

    const declarations = renderLayoutCss(parsed.value);

    expect(Object.isFrozen(declarations)).toBe(true);
    expect(Object.isFrozen(declarations[0])).toBe(true);
  });
});
