import {
  describeTailwindDisplay,
  describeTailwindUtility,
  findTailwindClassConflicts,
} from './tailwind-class-conflict';

const xs = (utility: string) => `[@media_screen_and_(min-width:_0px)_and_(max-width:_599.98px)]:${utility}`;
const sm = (utility: string) => `[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:${utility}`;
const gtXs = (utility: string) => `[@media_screen_and_(min-width:_600px)]:${utility}`;

describe('describeTailwindDisplay', () => {
  test.each([
    'inline',
    'block',
    'inline-block',
    'flow-root',
    'flex',
    'inline-flex',
    'grid',
    'inline-grid',
    'contents',
    'table',
    'inline-table',
    'table-caption',
    'table-cell',
    'table-column',
    'table-column-group',
    'table-footer-group',
    'table-header-group',
    'table-row-group',
    'table-row',
    'list-item',
    'hidden',
  ])('describes the standard Tailwind display utility %s', utility => {
    expect(describeTailwindDisplay(utility)).toEqual({
      token: utility,
      utility,
      activation: { kind: 'base' },
      important: false,
    });
  });

  test.each([
    ['!block', 'block'],
    ['inline-flex!', 'inline-flex'],
  ])('normalizes the important display utility %s', (token, utility) => {
    expect(describeTailwindDisplay(token)).toEqual({
      token,
      utility,
      activation: { kind: 'base' },
      important: true,
    });
  });

  test.each([
    [sm('grid'), { min: 600, max: 959.98 }],
    [gtXs('flex'), { min: 600 }],
    ['[@media_screen_and_(max-width:_599.98px)]:inline', { max: 599.98 }],
  ])('describes the generated media activation for %s', (token, range) => {
    expect(describeTailwindDisplay(token)).toEqual({
      token,
      utility: token.slice(token.lastIndexOf(':') + 1),
      activation: { kind: 'media', range },
      important: false,
    });
  });

  test('retains an ordinary variant as a modified base display token', () => {
    expect(describeTailwindDisplay('hover:contents')).toEqual({
      token: 'hover:contents',
      utility: 'contents',
      activation: { kind: 'base' },
      important: false,
    });
  });

  test('does not split an arbitrary display property at its inner colon', () => {
    expect(describeTailwindDisplay('[display:block]')).toEqual({
      token: '[display:block]',
      utility: '[display:block]',
      activation: { kind: 'base' },
      important: false,
    });
    expect(describeTailwindDisplay('[flex:1_1_auto]')).toBeUndefined();
  });
});

describe('describeTailwindUtility', () => {
  test('exposes ordinary variants, normalized importance, and a stable property group', () => {
    expect(describeTailwindUtility('dark:hover:!text-white')).toEqual({
      token: 'dark:hover:!text-white',
      variants: ['dark', 'hover'],
      utility: 'text-white',
      propertyGroup: 'color',
      activation: { kind: 'base' },
      hasGeneratedMediaVariant: false,
      important: true,
    });
  });

  test.each([
    ['![color:red]', '[color:red]'],
    ['[color:red]!', '[color:red]'],
    ['[color:red!important]', '[color:red!important]'],
    ['[color:red_!important]', '[color:red_!important]'],
    ['[color:red!important_]', '[color:red!important_]'],
    ['[color:red!important/**/]', '[color:red!important/**/]'],
    ['[color:red!/**/important]', '[color:red!/**/important]'],
    ['[color:red_!_important_]', '[color:red_!_important_]'],
    ['text-[color:red!important]', 'text-[color:red!important]'],
    ['text-[color:red!important_]', 'text-[color:red!important_]'],
    ['w-[17px!important]', 'w-[17px!important]'],
    ['w-[17px!important/**/]', 'w-[17px!important/**/]'],
    ['[color:var(--fallback,_red)!important_]', '[color:var(--fallback,_red)!important_]'],
    ['[color:oklch(50%_0.2_10)!important/**/]', '[color:oklch(50%_0.2_10)!important/**/]'],
  ])('reports canonical declaration importance for %s', (token, utility) => {
    expect(describeTailwindUtility(token)).toMatchObject({ utility, important: true });
  });

  test.each([
    '[color:"red!important"]',
    "[color:'red!important']",
    '[color:var(--fallback!important)]',
    '[color:var(--fallback_!important)]',
    '[color:oklch(50%_0.2_10_!important)]',
    '[color:red\\!important]',
    '[color:red!important\\_]',
  ])('does not mistake quoted, nested, or escaped content for declaration importance in %s', token => {
    expect(describeTailwindUtility(token)).toMatchObject({ important: false });
  });

  test('reports internal importance for an arbitrary display declaration', () => {
    expect(describeTailwindDisplay('[display:block!important]')).toMatchObject({
      utility: '[display:block!important]',
      important: true,
    });
  });

  test('finds a generated media activation before an ordinary variant', () => {
    const token = `${sm('hover:flex')}`;

    expect(describeTailwindUtility(token)).toEqual({
      token,
      variants: ['[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]', 'hover'],
      utility: 'flex',
      propertyGroup: 'display',
      activation: { kind: 'media', range: { min: 600, max: 959.98 } },
      hasGeneratedMediaVariant: true,
      important: false,
    });
  });

  test('tracks inverted generated-media syntax without manufacturing a valid media activation', () => {
    const token = '[@media_screen_and_(min-width:_700px)_and_(max-width:_600px)]:flex';

    expect(describeTailwindUtility(token)).toMatchObject({
      activation: { kind: 'base' },
      hasGeneratedMediaVariant: true,
    });
  });

  test.each(['w-[17px', 'w-17px]', 'hover:', 'hover::flex', 'flex\\'])(
    'rejects malformed bracket, variant, or escape structure in %j',
    token => {
      expect(describeTailwindUtility(token)).toBeUndefined();
    },
  );
});

describe('findTailwindClassConflicts', () => {
  test.each([
    'inline',
    'block',
    'inline-block',
    'flow-root',
    'flex',
    'inline-flex',
    'grid',
    'inline-grid',
    'contents',
    'table',
    'inline-table',
    'table-caption',
    'table-cell',
    'table-column',
    'table-column-group',
    'table-footer-group',
    'table-header-group',
    'table-row-group',
    'table-row',
    'list-item',
    'hidden',
  ])('recognizes the standard Tailwind display utility %s at base', existing => {
    const generated = existing === 'flex' ? 'inline-flex' : 'flex';

    expect(findTailwindClassConflicts([existing], [generated])).toEqual(new Set([generated]));
  });

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

  test('recognizes display utilities in the same exact responsive range', () => {
    const generated = sm('flex');

    expect(findTailwindClassConflicts([sm('inline')], [generated])).toEqual(new Set([generated]));
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

  test('recognizes display utilities behind ordinary Tailwind variants', () => {
    const generated = xs('flex');

    expect(findTailwindClassConflicts(['hover:contents'], [generated])).toEqual(new Set([generated]));
  });

  test.each(['!flow-root', 'table-row!'])(
    'normalizes the important modifier on existing display utility %s',
    existing => {
      expect(findTailwindClassConflicts([existing], ['flex'])).toEqual(new Set(['flex']));
    },
  );

  test('parses arbitrary properties without treating their colon as a variant separator', () => {
    const generated = sm('[flex:1_1_calc(100%_-_1rem)]');

    expect(findTailwindClassConflicts([gtXs('[flex:0_0_auto]')], [generated])).toEqual(new Set([generated]));
    expect(findTailwindClassConflicts([xs('[flex:0_0_auto]')], [generated])).toEqual(new Set());
  });

  test('uses the general property registry for non-layout utility conflicts', () => {
    const generated = sm('text-blue-500');

    expect(findTailwindClassConflicts(['text-slate-700'], [generated])).toEqual(new Set([generated]));
    expect(findTailwindClassConflicts(['bg-slate-700'], [generated])).toEqual(new Set());
  });

  test.each([
    ['[margin-top:1rem]', sm('mt-2')],
    ['[padding-left:1rem]', sm('p-4')],
    ['[border-color:red]', sm('border-blue-500')],
    ['[left:0]', sm('inset-x-0')],
    ['[rotate:10deg]', sm('rotate-45')],
  ])('normalizes arbitrary property %s against built-in family %s', (existing, generated) => {
    expect(findTailwindClassConflicts([existing], [generated])).toEqual(new Set([generated]));
  });

  test.each([
    ['[all:unset]', sm('flex')],
    ['[row-gap:1rem]', sm('gap-y-4')],
    ['gap-y-4', sm('[row-gap:2rem]')],
    ['sr-only', sm('relative')],
    ['relative', sm('sr-only')],
  ])('uses complete CSS ownership for existing %s against generated %s', (existing, generated) => {
    expect(findTailwindClassConflicts([existing], [generated])).toEqual(new Set([generated]));
  });
});
