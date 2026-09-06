import { readFile } from 'node:fs/promises';
import { compile } from 'tailwindcss';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { previewTemplate } from '../../src/browser/template-preview';
import { resolveTailwindTargetProfile } from '../../src/config/tailwind-target-profile';

function effectiveDirection(css: string, width: number): string | undefined {
  let value: string | undefined;
  postcss.parse(css).walkDecls('flex-direction', declaration => {
    let matches = true;
    for (
      let parent: postcss.ChildNode | postcss.Root | postcss.Document | undefined = declaration.parent;
      parent;
      parent = parent.parent
    ) {
      if (parent.type !== 'atrule' || parent.name !== 'media') continue;
      if (/print/.test(parent.params)) matches = false;
      for (const match of parent.params.matchAll(/(?:min-width:\s*|width\s*>=\s*)([\d.]+)px/g))
        if (width < Number(match[1])) matches = false;
      for (const match of parent.params.matchAll(/max-width:\s*([\d.]+)px/g))
        if (width > Number(match[1])) matches = false;
    }
    if (matches) value = declaration.value;
  });
  return value;
}
describe('source to target semantics', () => {
  it.each([
    ['base', '<div fxLayout="row"></div>', ['row', 'row', 'row', 'row']],
    ['bounded override', '<div fxLayout="row" fxLayout.md="column"></div>', ['row', 'row', 'column', 'row']],
    [
      'missing intermediate',
      '<div fxLayout="row" fxLayout.xs="column" fxLayout.md="column"></div>',
      ['column', 'row', 'column', 'row'],
    ],
    ['minimum', '<div fxLayout="row" fxLayout.gt-sm="column"></div>', ['row', 'row', 'column', 'column']],
    ['maximum', '<div fxLayout="row" fxLayout.lt-md="column"></div>', ['column', 'column', 'row', 'row']],
  ])('matches responsive truth table for %s under CSS and two Tailwind profiles', async (_label, source, expected) => {
    for (const prefix of [null, 'tw']) {
      const targetProfile = resolveTailwindTargetProfile({
        explicit: { prefix, breakpoints: { '*': null, desktop: '960px' } },
      });
      const output = previewTemplate({ source: source as string, target: 'tailwind', targetProfile });
      expect(output.diagnostics).toEqual([]);
      const candidates = output.html.match(/class="([^"]*)"/)![1]!.split(' ');
      const compiler = await compile(
        `${prefix ? `@theme prefix(${prefix}) { --breakpoint-desktop: 960px; }` : '@theme { --breakpoint-desktop: 960px; }'} @tailwind utilities;`,
      );
      const css = compiler.build(candidates);
      expect([300, 700, 1000, 1400].map(width => effectiveDirection(css, width))).toEqual(expected);
    }
    const native = previewTemplate({ source: source as string, target: 'css' });
    expect(native.diagnostics).toEqual([]);
    expect([300, 700, 1000, 1400].map(width => effectiveDirection(native.css!, width))).toEqual(expected);
  });
  it('preserves unknown source aliases and accepts explicit custom source media', () => {
    const source = '<div fxLayout="row" fxLayout.narrow="column"></div>';
    const unknown = previewTemplate({ source, target: 'tailwind' });
    expect(unknown.html).toContain('fxLayout.narrow');
    expect(unknown.diagnostics.some(item => item.code === 'custom-breakpoint')).toBe(true);
    for (const target of ['tailwind', 'css'] as const) {
      const output = previewTemplate({
        source,
        target,
        sourceConfig: {
          orientationBreakpoints: false,
          sourceBreakpoints: { narrow: { mediaQuery: 'screen and (max-width: 599px)', priority: 1100 } },
        },
      });
      expect(output.diagnostics).toEqual([]);
      expect(output.html).not.toContain('fxLayout');
    }
  });
  it.each(['angular-5-8', 'angular-9-12', 'angular-13-15', 'modern'])(
    'preserves representative %s Angular template syntax',
    async era => {
      const source = await readFile(new URL(`../fixtures/angular-eras/${era}.html`, import.meta.url), 'utf8');
      for (const target of ['css', 'tailwind'] as const) {
        const output = previewTemplate({ source, target });
        expect(output.state).toBe('valid');
        expect(output.html).not.toContain('fxLayout');
        expect(output.results.every(item => item.status === 'converted')).toBe(true);
      }
    },
  );
});
