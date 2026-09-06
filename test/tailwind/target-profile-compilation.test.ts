import { readFile } from 'node:fs/promises';
import { compile } from 'tailwindcss';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { previewTemplate } from '../../src/browser/template-preview';
import { analyzeTailwindStylesheet, resolveTailwindTargetProfile } from '../../src/config/tailwind-target-profile';

const source =
  '<div fxLayout="row" fxLayout.md="column" fxLayoutGap="13px"></div><div fxLayout="row" fxLayoutAlign="space-between center"><span fxFlex="25" fxFlexOrder="2"></span></div>';
async function engine(prefix: string | null, important: boolean, theme: string) {
  return compile(
    `@import "tailwindcss"${prefix ? ` prefix(${prefix})` : ''}${important ? ' important' : ''}; ${theme}`,
    {
      loadStylesheet: async id => ({
        path: id,
        base: '',
        content: await readFile(
          new URL(
            `../../node_modules/${id === 'tailwindcss' ? 'tailwindcss/index.css' : `tailwindcss/${id.replace('./', '')}`}`,
            import.meta.url,
          ),
          'utf8',
        ),
      }),
      loadModule: async () => {
        throw new Error('Project code execution is forbidden');
      },
    },
  );
}
describe('Tailwind 4.3.3 profile compilation oracle', () => {
  it.each([null, 'tw', 'acme'])(
    'compiles every generated candidate with prefix %s and exact declarations/media',
    async prefix => {
      for (const important of [false, true]) {
        const targetProfile = resolveTailwindTargetProfile({
          explicit: { prefix, important: important ? 'important' : 'normal' },
        });
        const result = previewTemplate({ source, target: 'tailwind', targetProfile });
        expect(result.diagnostics).toEqual([]);
        const tokens = [...result.html.matchAll(/class="([^"]*)"/g)].flatMap(match => match[1]!.split(/\s+/));
        const compiler = await engine(prefix, important, '');
        for (const token of tokens) {
          const single = await engine(prefix, important, '');
          const css = single.build([token]);
          const rules: string[] = [];
          postcss.parse(css).walkRules(rule => {
            if (rule.selector.startsWith('.')) rules.push(rule.selector);
          });
          expect(rules.length, token).toBeGreaterThan(0);
        }
        const css = compiler.build(tokens);
        expect(css).toContain('display: flex');
        expect(css).toContain('flex-direction: column');
        expect(css).toContain('gap: 13px');
        expect(css).toContain('(min-width: 960px) and (max-width: 1279.98px)');
        expect(css.includes('display: flex !important')).toBe(important);
      }
    },
  );
  it('uses an exact named px minimum with screen restriction and preserves unmatched bounded ranges', async () => {
    const targetProfile = resolveTailwindTargetProfile({
      explicit: { prefix: 'tw', breakpoints: { '*': null, desktop: '960px' } },
    });
    const result = previewTemplate({
      source: '<div fxLayout="row" fxLayout.gt-sm="column"></div>',
      target: 'tailwind',
      targetProfile,
    });
    expect(result.html).toContain('tw:[@media_screen]:desktop:flex-col');
    const compiler = await engine('tw', false, '@theme { --breakpoint-*: initial; --breakpoint-desktop: 960px; }');
    const css = compiler.build(['tw:[@media_screen]:desktop:flex-col']);
    expect(css).toContain('@media screen');
    expect(css).toContain('(width >= 960px)');
    expect(css).toContain('flex-direction: column');
  });
  it('rejects misplaced prefixes and accepts prefix before arbitrary/state variants', async () => {
    const compiler = await engine('tw', false, '');
    const css = compiler.build(['hover:tw:flex', 'tw:hover:gap-[13px]!', 'tw:[@media_print]:hidden']);
    expect(css).not.toContain('display: flex');
    expect(css).toContain('gap: 13px !important');
    expect(css).toContain('@media print');
  });
});

it.each(['print', 'portrait', 'hover', 'max-sm'])('preserves exact width for colliding target name %s', async name => {
  const targetProfile = resolveTailwindTargetProfile({ explicit: { breakpoints: { '*': null, [name]: '960px' } } });
  const result = previewTemplate({
    source: '<div fxLayout="row" fxLayout.gt-sm="column"></div>',
    target: 'tailwind',
    targetProfile,
  });
  expect(result.html).toContain('[@media_screen_and_(min-width:_960px)]:flex-col');
});

it('guards the builtin variant collision list against the supported compiler', async () => {
  const { __unstable__loadDesignSystem } = await import('tailwindcss');
  const { tailwindBuiltinVariants } = await import('../../src/config/tailwind-builtin-variants');
  const designSystem = await __unstable__loadDesignSystem('@tailwind utilities;');
  expect([...designSystem.variants.variants.keys()].sort()).toEqual(tailwindBuiltinVariants);
});

it.each([false, true])('respects a global theme reset with later redefinition %s', async redefine => {
  const theme =
    '@theme { --breakpoint-desktop: 960px; } @theme { --*: initial; }' +
    (redefine ? '@theme { --breakpoint-desktop: 960px; }' : '');
  const targetProfile = resolveTailwindTargetProfile({
    detected: analyzeTailwindStylesheet('@import "tailwindcss"; ' + theme, 'styles.css'),
  });
  expect(Object.keys(targetProfile.breakpoints)).toEqual(redefine ? ['desktop'] : []);
  const result = previewTemplate({
    source: '<div fxLayout="row" fxLayout.gt-sm="column"></div>',
    target: 'tailwind',
    targetProfile,
  });
  const tokens = [...result.html.matchAll(/class="([^"]*)"/g)].flatMap(match => match[1]!.split(/\s+/));
  const compiler = await engine(null, false, theme);
  const css = compiler.build(tokens);
  expect(css).toContain('flex-direction: column');
  expect(css).toContain(redefine ? '(width >= 960px)' : '(min-width: 960px)');
});
