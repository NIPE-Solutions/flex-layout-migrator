import { parseLayout } from './layout.semantic';

describe('parseLayout', () => {
  test.each([
    ['', { direction: 'row', wrap: 'nowrap', explicitWrap: false, display: 'flex', boxSizing: 'border-box' }],
    ['row', { direction: 'row', wrap: 'nowrap', explicitWrap: false, display: 'flex', boxSizing: 'border-box' }],
    [
      'row-reverse nowrap',
      { direction: 'row-reverse', wrap: 'nowrap', explicitWrap: true, display: 'flex', boxSizing: 'border-box' },
    ],
    [
      'column wrap',
      { direction: 'column', wrap: 'wrap', explicitWrap: true, display: 'flex', boxSizing: 'border-box' },
    ],
    [
      'column-reverse wrap-reverse inline',
      {
        direction: 'column-reverse',
        wrap: 'wrap-reverse',
        explicitWrap: true,
        display: 'inline-flex',
        boxSizing: 'border-box',
      },
    ],
    [
      'column wrap inline',
      { direction: 'column', wrap: 'wrap', explicitWrap: true, display: 'inline-flex', boxSizing: 'border-box' },
    ],
  ] as const)('derives target-neutral semantics for %j', (value, expected) => {
    expect(parseLayout(value)).toEqual({ ok: true, value: expected });
  });

  test.each(['diagonal', 'row row', 'row wrap nowrap', 'inline', 'row inline inline', 'row unknown'])(
    'rejects duplicate or unknown layout tokens in %j',
    value => {
      expect(parseLayout(value)).toEqual({ ok: false });
    },
  );
});
