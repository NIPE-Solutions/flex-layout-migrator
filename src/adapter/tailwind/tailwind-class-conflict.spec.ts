import { findTailwindClassConflicts } from './tailwind-class-conflict';

const xs = (utility: string) => `[@media_screen_and_(min-width:_0px)_and_(max-width:_599.98px)]:${utility}`;
const sm = (utility: string) => `[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:${utility}`;
const gtXs = (utility: string) => `[@media_screen_and_(min-width:_600px)]:${utility}`;

describe('findTailwindClassConflicts', () => {
  test('returns the generated base utility whose property conflicts at base', () => {
    expect(findTailwindClassConflicts(['flex-col'], ['flex', 'flex-row', 'box-border'])).toEqual(new Set(['flex-row']));
  });

  test('treats a base utility as intersecting a generated responsive utility', () => {
    const generated = sm('flex-col');

    expect(findTailwindClassConflicts(['flex-row'], [generated])).toEqual(new Set([generated]));
  });

  test('does not conflict when bounded responsive ranges are disjoint', () => {
    expect(findTailwindClassConflicts([xs('flex-row')], [sm('flex-col')])).toEqual(new Set());
  });

  test('returns the generated token when responsive ranges overlap', () => {
    const generated = sm('flex-col');

    expect(findTailwindClassConflicts([gtXs('flex-row')], [generated])).toEqual(new Set([generated]));
  });

  test('does not report an existing token that is identical to a generated token', () => {
    const token = sm('flex-col');

    expect(findTailwindClassConflicts([token], [token])).toEqual(new Set());
  });

  test.each(['!flex-col', 'flex-col!'])('normalizes the important modifier in existing utility %s', existing => {
    expect(findTailwindClassConflicts([existing], ['flex-row'])).toEqual(new Set(['flex-row']));
  });

  test('treats an ordinary Tailwind variant as potentially intersecting', () => {
    const generated = xs('flex-col');

    expect(findTailwindClassConflicts(['sm:flex-row'], [generated])).toEqual(new Set([generated]));
  });

  test('parses arbitrary properties without treating their colon as a variant separator', () => {
    const generated = sm('[flex:1_1_calc(100%_-_1rem)]');

    expect(findTailwindClassConflicts([gtXs('[flex:0_0_auto]')], [generated])).toEqual(new Set([generated]));
    expect(findTailwindClassConflicts([xs('[flex:0_0_auto]')], [generated])).toEqual(new Set());
  });
});
