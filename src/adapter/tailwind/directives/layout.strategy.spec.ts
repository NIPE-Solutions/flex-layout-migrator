import { planLayout } from './layout.strategy';

describe('planLayout', () => {
  test.each([
    ['', ['flex', 'flex-row', 'box-border']],
    ['row', ['flex', 'flex-row', 'box-border']],
    ['row-reverse wrap', ['flex', 'flex-row-reverse', 'flex-wrap', 'box-border']],
    ['column nowrap', ['flex', 'flex-col', 'flex-nowrap', 'box-border']],
    ['column-reverse wrap-reverse inline', ['inline-flex', 'flex-col-reverse', 'flex-wrap-reverse', 'box-border']],
    ['row inline wrap', ['inline-flex', 'flex-row', 'flex-wrap', 'box-border']],
  ] as const)('emits complete layout semantics for %j', (value, expected) => {
    expect(planLayout(value)).toEqual({ ok: true, value: { classNames: expected } });
  });

  test.each(['diagonal', 'row row', 'row wrap nowrap', 'inline', 'row inline inline', 'row unknown'])(
    'rejects invalid layout %j',
    value => {
      expect(planLayout(value)).toEqual({ ok: false });
    },
  );
});
