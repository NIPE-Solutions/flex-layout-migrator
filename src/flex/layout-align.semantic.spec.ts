import { planLayoutAlignment } from './layout-align.semantic';

describe('planLayoutAlignment', () => {
  test.each([
    [
      '',
      'row',
      {
        main: 'start',
        items: 'stretch',
        content: 'stretch',
        stretchMaximum: 'height',
        layout: {
          direction: 'row',
          wrap: 'nowrap',
          explicitWrap: false,
          display: 'flex',
          boxSizing: 'border-box',
        },
      },
    ],
    [
      'flex-end flex-start',
      'row-reverse inline',
      {
        main: 'end',
        items: 'start',
        content: 'start',
        layout: {
          direction: 'row-reverse',
          wrap: 'nowrap',
          explicitWrap: false,
          display: 'inline-flex',
          boxSizing: 'border-box',
        },
      },
    ],
    [
      'space-between baseline',
      'column',
      {
        main: 'space-between',
        items: 'baseline',
        content: 'stretch',
        layout: {
          direction: 'column',
          wrap: 'nowrap',
          explicitWrap: false,
          display: 'flex',
          boxSizing: 'border-box',
        },
      },
    ],
    [
      'space-around stretch',
      'column-reverse',
      {
        main: 'space-around',
        items: 'stretch',
        content: 'stretch',
        stretchMaximum: 'width',
        layout: {
          direction: 'column-reverse',
          wrap: 'nowrap',
          explicitWrap: false,
          display: 'flex',
          boxSizing: 'border-box',
        },
      },
    ],
  ] as const)('derives target-neutral alignment semantics for %j in %j', (value, layout, expected) => {
    expect(planLayoutAlignment(value, layout)).toEqual({ status: 'planned', value: expected });
  });

  test.each([
    ['left center', 'row'],
    ['center auto', 'row'],
    ['center center extra', 'row'],
    ['center', 'diagonal'],
  ])('rejects invalid alignment %j or layout context %j', (value, layout) => {
    expect(planLayoutAlignment(value, layout)).toEqual({ status: 'invalid', code: 'invalid-value' });
  });
});
