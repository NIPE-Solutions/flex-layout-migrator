import { readFile } from 'node:fs/promises';
import postcss from 'postcss';
import { __unstable__loadDesignSystem, compile } from 'tailwindcss';
import { cssPropertyOwnershipCovers } from './extended/css-property-ownership';
import {
  describeTailwindDisplay,
  describeTailwindUtility,
  findTailwindClassConflicts,
} from './tailwind-class-conflict';

const tailwindSource = readFile(new URL('../../../node_modules/tailwindcss/theme.css', import.meta.url), 'utf8').then(
  theme => `${theme}\n@tailwind utilities;`,
);

const xs = (utility: string) => `[@media_screen_and_(min-width:_0px)_and_(max-width:_599.98px)]:${utility}`;
const sm = (utility: string) => `[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:${utility}`;
const gtXs = (utility: string) => `[@media_screen_and_(min-width:_600px)]:${utility}`;

async function compiledClassCssProperties(candidate: string): Promise<readonly string[]> {
  const compiler = await compile(await tailwindSource);
  return classRuleCssProperties(compiler.build([candidate]));
}

function classRuleCssProperties(css: string): readonly string[] {
  const properties: string[] = [];

  postcss.parse(css).walkRules(rule => {
    // candidatesToCss also emits global registrations and keyframes; only
    // declarations nested under a class selector belong to this utility.
    if (!rule.selector.includes('.')) return;
    rule.walkDecls(declaration => {
      if (!properties.includes(declaration.prop)) properties.push(declaration.prop);
    });
  });
  return properties;
}

const existingCompilerOwnershipMatrix = [
  'flex',
  'flex-row',
  'flex-wrap',
  'flex-1',
  'grow',
  'shrink-0',
  'basis-1/2',
  'box-border',
  'justify-center',
  'justify-items-center',
  'justify-self-end',
  'items-center',
  'content-between',
  "content-['card']",
  'self-end',
  'gap-4',
  'gap-x-4',
  'gap-y-4',
  '-mt-2',
  'mx-4',
  'p-4',
  'px-4',
  'size-4',
  'w-1/2',
  'h-dvh',
  'min-w-0',
  'max-h-screen',
  'text-sm',
  'text-sm/5',
  'text-red-500',
  'text-[xx-small]',
  'text-[larger]',
  'text-[--spacing(4)]',
  'text-[absolute-size:xx-small]',
  'text-[relative-size:larger]',
  'text-[percentage:50%]',
  'text-[size:12px]',
  'text-[foo:xx-small]',
  'text-[color:red]',
  'text-left',
  'text-balance',
  'bg-red-500',
  'bg-[url(hero.png)]',
  'bg-cover',
  'bg-center',
  'bg-repeat',
  'bg-fixed',
  'bg-blend-multiply',
  'border',
  'border-2',
  'border-x-2',
  'border-y-2',
  'border-s-2',
  'border-e-2',
  'border-bs-2',
  'border-be-2',
  'border-t-2',
  'border-r-2',
  'border-b-2',
  'border-l-2',
  'border-[thin]',
  'border-[thin_medium]',
  'border-[1px_2px]',
  'border-[line-width:thin]',
  'border-[length:--spacing(4)]',
  'border-[--spacing(4)]',
  'border-x-[thin_medium]',
  'border-red-500',
  'border-x-red-500',
  'border-be-red-500',
  'border-[foo:thin]',
  'border-solid',
  'border-collapse',
  'border-spacing-2',
  'rounded-lg',
  'rounded-t-lg',
  'shadow',
  'shadow-sm',
  'shadow-none',
  'shadow-red-500',
  'shadow-red-500/50',
  'shadow-transparent',
  'shadow-current',
  'shadow-[red]',
  'shadow-[1px_2px_3px_red]',
  'shadow-[foo:red]',
  'shadow-(--card-shadow)',
  'ring-2',
  'ring-red-500',
  'ring-inset',
  'ring-offset-2',
  'ring-offset-red-500',
  'truncate',
  'opacity-50',
  'overflow-x-auto',
  'relative',
  'inset-x-0',
  'top-0',
  'rotate-45',
  'rotate-x-45',
  'scale-50',
  'scale-x-50',
  'translate-x-4',
  'translate-z-4',
  'skew-x-3',
  'transition-colors',
  'duration-200',
  'delay-200',
  'ease-in',
  'grid-cols-3',
  'auto-cols-fr',
  'grid-rows-2',
  'auto-rows-min',
  'grid-flow-row',
  'col-span-2',
  'row-span-2',
  'table-auto',
  'list-disc',
  'list-inside',
  'object-cover',
  'object-left-top',
  'cursor-pointer',
  'pointer-events-none',
  'visible',
  'sr-only',
  'not-sr-only',
  'font-bold',
  'leading-5',
  'tracking-wide',
  'underline',
  'outline',
  'divide-x-2',
  'blur-sm',
  'drop-shadow-sm',
  'z-10',
  'aspect-square',
  'columns-2',
  'align-middle',
  'backface-hidden',
  'block-auto',
  'grayscale',
  'max-inline-full',
  'placeholder-red-500',
  'scheme-dark',
  'scrollbar-thin',
  'select-none',
  'uppercase',
  'wrap-anywhere',
  'zoom-50',
  'focus-within:text-[xx-small]',
  'focus-within:border-x-2',
  'focus-within:shadow-red-500',
] as const;

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
  test('exposes ordinary variants, normalized importance, and complete CSS ownership', () => {
    expect(describeTailwindUtility('dark:hover:!text-white')).toEqual({
      token: 'dark:hover:!text-white',
      variants: ['dark', 'hover'],
      utility: 'text-white',
      cssProperties: ['color'],
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
      cssProperties: ['display'],
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

  test.each([
    ['text-[.5rem]', ['font-size']],
    ['text-[0]', ['color']],
    ['border-[.5rem]', ['border-style', 'border-width']],
    ['border-[50%]', ['border-color']],
    ['shadow-[red]', ['--tw-shadow-color']],
    ['shadow-[rebeccapurple]', ['--tw-shadow-color']],
    ['shadow-[transparent]', ['--tw-shadow-color']],
    ['shadow-[currentColor]', ['--tw-shadow-color']],
    ['shadow-[#fff]', ['--tw-shadow-color']],
    ['shadow-[rgb(1_2_3)]', ['--tw-shadow-color']],
    ['shadow-[1px_2px_3px_red]', ['--tw-shadow', 'box-shadow']],
    ['shadow-[var(--shadow)]', ['--tw-shadow', 'box-shadow']],
  ])('describes compiler-selected arbitrary ownership for %s', (token, cssProperties) => {
    expect(describeTailwindUtility(token)).toMatchObject({ cssProperties });
  });

  test.each([
    ['text-[xx-small]', ['font-size']],
    ['text-[larger]', ['font-size']],
    ['text-[--spacing(4)]', ['font-size']],
    ['text-[absolute-size:xx-small]', ['font-size']],
    ['text-[relative-size:larger]', ['font-size']],
    ['text-[percentage:50%]', ['font-size']],
    ['text-[size:12px]', ['font-size']],
    ['border-x-2', ['border-inline-style', 'border-inline-width']],
    ['border-y-2', ['border-block-style', 'border-block-width']],
    ['border-s-2', ['border-inline-start-style', 'border-inline-start-width']],
    ['border-e-2', ['border-inline-end-style', 'border-inline-end-width']],
    ['border-bs-2', ['border-block-start-style', 'border-block-start-width']],
    ['border-be-2', ['border-block-end-style', 'border-block-end-width']],
    ['border-t-2', ['border-top-style', 'border-top-width']],
    ['border-r-2', ['border-right-style', 'border-right-width']],
    ['border-b-2', ['border-bottom-style', 'border-bottom-width']],
    ['border-l-2', ['border-left-style', 'border-left-width']],
    ['border-[thin_medium]', ['border-style', 'border-width']],
    ['border-[1px_2px]', ['border-style', 'border-width']],
    ['border-[line-width:thin]', ['border-style', 'border-width']],
    ['border-[length:--spacing(4)]', ['border-style', 'border-width']],
    ['border-x-red-500', ['border-inline-color']],
    ['border-be-red-500', ['border-block-end-color']],
    ['shadow-red-500', ['--tw-shadow-color']],
    ['shadow-red-500/50', ['--tw-shadow-color']],
    ['shadow-sm', ['--tw-shadow', 'box-shadow']],
    ['content-none', ['--tw-content', 'content']],
    ['inset-shadow-sm', ['--tw-inset-shadow', 'box-shadow']],
    ['inset-shadow-red-500', ['--tw-inset-shadow-color']],
    ['inset-ring-2', ['--tw-inset-ring-shadow', 'box-shadow']],
    ['inset-ring-red-500', ['--tw-inset-ring-color']],
    ['rotate-z-45', ['--tw-rotate-z', 'transform']],
    ['transition-discrete', ['transition-behavior']],
    ['transition-normal', ['transition-behavior']],
  ] as const)('reports the exact pinned property set for existing utility %s', (token, cssProperties) => {
    expect(describeTailwindUtility(token)).toMatchObject({ cssProperties });
  });

  test.each([
    ['bg-[image:url(hero.png)]', 'background-image'],
    ['bg-[url:url(hero.png)]', 'background-image'],
    ['bg-[linear-gradient(red,blue)]', 'background-image'],
    ['bg-[repeating-linear-gradient(red,blue)]', 'background-image'],
    ['bg-[image-set(url(one.png)_1x,url(two.png)_2x)]', 'background-image'],
    ['bg-[position:left_top]', 'background-position'],
    ['bg-[percentage:50%]', 'background-position'],
    ['bg-[length:50%_auto]', 'background-size'],
    ['bg-[bg-size:cover]', 'background-size'],
    ['bg-[size:cover]', 'background-size'],
    ['bg-[color:red]', 'background-color'],
    ['bg-[color:red]/50', 'background-color'],
    ['bg-[center]', 'background-position'],
    ['bg-[left_top]', 'background-position'],
    ['bg-[right_10px_bottom_20px]', 'background-position'],
    ['bg-[cover]', 'background-size'],
    ['bg-[auto_50%]', 'background-size'],
    ['bg-[auto_auto]', 'background-size'],
    ['bg-[red]', 'background-color'],
    ['bg-[rebeccapurple]', 'background-color'],
    ['bg-[transparent]', 'background-color'],
    ['bg-[#fff]', 'background-color'],
    ['bg-[rgb(1_2_3)]', 'background-color'],
    ['bg-[color-mix(in_oklab,_red,_blue)]', 'background-color'],
  ] as const)(
    'maps the typed or unambiguous arbitrary background %s to its compiler-selected property',
    async (token, property) => {
      expect(await compiledClassCssProperties(token)).toEqual([property]);
      expect(describeTailwindUtility(token)).toMatchObject({ cssProperties: [property] });
      expect(describeTailwindUtility(token)).not.toHaveProperty('hasUnknownCssAuthority');
    },
  );

  test.each([
    ['bg-[50%]', 'background-position'],
    ['bg-[12px]', 'background-position'],
    ['bg-[50%_50%]', 'background-position'],
    ['bg-[calc(50%_-_1rem)]', 'background-position'],
    ['bg-[var(--surface)]', 'background-color'],
    ['bg-(--surface)', 'background-color'],
    ['bg-[linear-gradient(red,blue),rgb(1_2_3)]', 'background-color'],
    ['bg-[var(--layer),url(hero.png)]', 'background-color'],
    ['bg-[url(hero.png),rgb(1_2_3)]', 'background-image'],
  ] as const)(
    'keeps the untyped arbitrary background %s conservative despite the pinned compiler choosing %s',
    async (token, property) => {
      expect(await compiledClassCssProperties(token)).toEqual([property]);
      expect(describeTailwindUtility(token)).toMatchObject({
        cssProperties: [],
        hasUnknownCssAuthority: true,
      });
    },
  );

  test.each(existingCompilerOwnershipMatrix)(
    'never under-reports parsed Tailwind declarations for compiler-valid existing utility %s',
    async token => {
      const emitted = await compiledClassCssProperties(token);
      const descriptor = describeTailwindUtility(token);

      expect(emitted.length).toBeGreaterThan(0);
      expect(descriptor).toBeDefined();
      if (descriptor === undefined) return;
      expect(
        emitted.filter(
          property =>
            descriptor.hasUnknownCssAuthority !== true &&
            !descriptor.cssProperties.some(owner => cssPropertyOwnershipCovers(owner, property)),
        ),
      ).toEqual([]);
    },
  );

  test('covers every class-owned declaration from all 23,286 pinned default-theme utilities', async () => {
    const designSystem = await __unstable__loadDesignSystem(await tailwindSource);
    const candidates = designSystem.getClassList().map(([candidate]) => candidate);
    const compiled = designSystem.candidatesToCss(candidates);
    const compilerEmpty: string[] = [];
    const declarationEmpty: string[] = [];
    const underCovered: Array<{
      readonly candidate: string;
      readonly emitted: readonly string[];
      readonly owners: readonly string[];
      readonly uncovered: readonly string[];
    }> = [];

    for (const [index, candidate] of candidates.entries()) {
      const css = compiled[index];
      if (css === null || css === undefined) {
        compilerEmpty.push(candidate);
        continue;
      }

      const emitted = classRuleCssProperties(css);
      if (emitted.length === 0) declarationEmpty.push(candidate);
      const descriptor = describeTailwindUtility(candidate);
      if (descriptor?.hasUnknownCssAuthority === true) continue;
      const owners = descriptor?.cssProperties ?? [];
      const uncovered = emitted.filter(property => !owners.some(owner => cssPropertyOwnershipCovers(owner, property)));
      if (uncovered.length > 0) underCovered.push({ candidate, emitted, owners, uncovered });
    }

    expect(candidates).toHaveLength(23_286);
    expect(compilerEmpty).toEqual([]);
    expect(declarationEmpty).toEqual([]);
    expect(
      underCovered,
      JSON.stringify({ count: underCovered.length, sample: underCovered.slice(0, 30) }, null, 2),
    ).toHaveLength(0);
  }, 30_000);

  test('marks a recognized but unmodeled Tailwind utility as an unknown CSS authority', () => {
    expect(describeTailwindUtility('font-bold')).toMatchObject({
      cssProperties: [],
      hasUnknownCssAuthority: true,
    });
    expect(describeTailwindUtility('card')).toMatchObject({ cssProperties: [] });
    expect(describeTailwindUtility('card')).not.toHaveProperty('hasUnknownCssAuthority');
  });

  test.each(['text-[foo:xx-small]', 'border-[foo:thin]', 'shadow-[foo:red]'])(
    'marks compiler-valid unmodeled arbitrary inference in %s as unknown authority',
    token => {
      expect(describeTailwindUtility(token)).toMatchObject({
        cssProperties: [],
        hasUnknownCssAuthority: true,
      });
    },
  );

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

  test('does not conflict when generated orientation conditions are disjoint', () => {
    const portrait = '[@media_(orientation:_portrait)_and_(max-width:_599.98px)]:flex-row';
    const landscape = '[@media_(orientation:_landscape)_and_(max-width:_959.98px)]:flex-col';

    expect(findTailwindClassConflicts([portrait], [landscape])).toEqual(new Set());
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

  test('recognizes the line-height side effect of a responsive text-size utility', () => {
    const generated = sm('text-sm/5');

    expect(findTailwindClassConflicts(['[line-height:2]'], [generated])).toEqual(new Set([generated]));
  });

  test.each([
    ['[--tw-shadow:none]', sm('shadow-md')],
    ['[transition-duration:1s]', sm('transition-colors')],
    ['[--tw-scale-x:2]', sm('scale-50')],
    ['[border-width:1px]', sm('sr-only')],
  ])('uses every modeled declaration of multi-property existing %s against %s', (existing, generated) => {
    expect(findTailwindClassConflicts([existing], [generated])).toEqual(new Set([generated]));
  });

  test('does not manufacture border ownership for not-sr-only', () => {
    expect(findTailwindClassConflicts(['[border-width:1px]'], [sm('not-sr-only')])).toEqual(new Set());
  });

  test('uses direct scale ownership for arbitrary scale values without theme-variable side effects', () => {
    const generated = sm('scale-[1.2]');

    expect(findTailwindClassConflicts(['[--tw-scale-x:2]'], [generated])).toEqual(new Set());
    expect(findTailwindClassConflicts(['[scale:2]'], [generated])).toEqual(new Set([generated]));
  });

  test('finds an existing arbitrary shadow-color writer against a generated inline-color utility', () => {
    const generated = sm('[--tw-shadow-color:blue]');

    expect(findTailwindClassConflicts(['shadow-[red]'], [generated])).toEqual(new Set([generated]));
  });

  test('treats a recognized unknown existing authority as conflicting with generated ownership', () => {
    const generated = sm('[font-weight:500]');

    expect(findTailwindClassConflicts(['font-bold'], [generated])).toEqual(new Set([generated]));
    expect(findTailwindClassConflicts(['card'], [generated])).toEqual(new Set());
  });
});
