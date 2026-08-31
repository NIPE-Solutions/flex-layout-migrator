import { planLayoutAlign } from './layout-align.strategy';

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
