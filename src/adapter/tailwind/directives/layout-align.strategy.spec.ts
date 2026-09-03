import { planLayoutAlign, renderLayoutAlignment } from './layout-align.strategy';

describe('planLayoutAlign', () => {
  test.each([
    ['', 'row', ['justify-start', 'items-stretch', 'content-stretch', 'flex', 'flex-row', 'box-border', 'max-h-full']],
    ['center end', 'row', ['justify-center', 'items-end', 'content-end', 'flex', 'flex-row', 'box-border']],
    [
      'space-between space-around',
      'column inline',
      ['justify-between', 'items-stretch', 'content-around', 'inline-flex', 'flex-col', 'box-border'],
    ],
    ['end baseline', 'column', ['justify-end', 'items-baseline', 'content-stretch', 'flex', 'flex-col', 'box-border']],
  ] as const)('emits both alignment axes for %j in %j', (value, layout, expected) => {
    expect(planLayoutAlign(value, layout)).toEqual({ ok: true, value: { classNames: expected } });
  });

  test.each([
    ['left center', 'row'],
    ['center auto', 'row'],
    ['center center extra', 'row'],
    ['center', 'diagonal'],
  ])('rejects invalid alignment %j or layout context %j', (value, layout) => {
    expect(planLayoutAlign(value, layout)).toEqual({ ok: false });
  });
});

describe('renderLayoutAlignment', () => {
  test('renders semantic alignment without reinterpreting its source values', () => {
    expect(
      renderLayoutAlignment({
        main: 'space-between',
        items: 'stretch',
        content: 'space-around',
        stretchMaximum: 'width',
        layout: {
          direction: 'column',
          wrap: 'nowrap',
          explicitWrap: false,
          display: 'flex',
          boxSizing: 'border-box',
        },
      }),
    ).toEqual({
      classNames: [
        'justify-between',
        'items-stretch',
        'content-around',
        'flex',
        'flex-col',
        'box-border',
        'max-w-full',
      ],
    });
  });
});
