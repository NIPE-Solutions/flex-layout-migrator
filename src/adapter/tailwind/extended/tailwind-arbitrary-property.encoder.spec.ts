import { compile } from 'tailwindcss';
import type { LiteralStyleDeclaration } from '../../../semantic/literal-style-declaration';
import { TailwindArbitraryPropertyEncoder } from './tailwind-arbitrary-property.encoder';

async function compileCandidate(candidate: string, source = '@tailwind utilities;'): Promise<string> {
  const compiler = await compile(source);
  return compiler.build([candidate]);
}

async function producesOutput(candidate: string, source = '@tailwind utilities;'): Promise<boolean> {
  const compiler = await compile(source);
  const emptyCss = compiler.build([]);
  return compiler.build([candidate]) !== emptyCss;
}

const encoder = new TailwindArbitraryPropertyEncoder();

describe('TailwindArbitraryPropertyEncoder', () => {
  test.each([
    {
      case: 'source spaces',
      declaration: { property: 'font-family', value: 'Open Sans' },
      candidate: '[font-family:Open_Sans]',
      cssValue: 'Open Sans',
    },
    {
      case: 'slashes',
      declaration: { property: 'font', value: '14px/1.5 sans-serif' },
      candidate: '[font:14px/1.5_sans-serif]',
      cssValue: '14px/1.5 sans-serif',
    },
    {
      case: 'hashes',
      declaration: { property: 'color', value: '#334155' },
      candidate: '[color:#334155]',
      cssValue: '#334155',
    },
    {
      case: 'parentheses',
      declaration: { property: 'width', value: 'calc(100% - 1rem)' },
      candidate: '[width:calc(100%_-_1rem)]',
      cssValue: 'calc(100% - 1rem)',
    },
    {
      case: 'custom properties',
      declaration: { property: '--Card_Gap', value: '1rem' },
      candidate: '[--Card_Gap:1rem]',
      cssValue: '1rem',
    },
    {
      case: 'literal underscores',
      declaration: { property: 'font-family', value: 'Open_Sans' },
      candidate: '[font-family:Open\\_Sans]',
      cssValue: 'Open_Sans',
    },
  ] satisfies readonly {
    readonly case: string;
    readonly declaration: LiteralStyleDeclaration;
    readonly candidate: string;
    readonly cssValue: string;
  }[])('encodes and compiles exact $case', async ({ declaration, candidate, cssValue }) => {
    expect(encoder.encode(declaration)).toBe(candidate);

    const css = await compileCandidate(candidate);
    expect(css).toContain(`  ${declaration.property}: ${cssValue};`);
  });

  test('distinguishes a source space from a source underscore in the compiled declaration', async () => {
    const sourceSpace = encoder.encode({ property: '--label', value: 'one two' });
    const sourceUnderscore = encoder.encode({ property: '--label', value: 'one_two' });

    expect(sourceSpace).toBe('[--label:one_two]');
    expect(sourceUnderscore).toBe('[--label:one\\_two]');
    expect(await compileCandidate(sourceSpace)).toContain('  --label: one two;');
    expect(await compileCandidate(sourceUnderscore)).toContain('  --label: one_two;');
  });

  test('shows that Tailwind rewrites --alpha() instead of preserving the source CSS value', async () => {
    const candidate = encoder.encode({ property: 'color', value: '--alpha(red/50%)' });

    expect(candidate).toBe('[color:--alpha(red/50%)]');
    const css = await compileCandidate(candidate);
    expect(css).toContain('  color: color-mix(in oklab, red 50%, transparent);');
    expect(css).not.toContain('  color: --alpha(red/50%);');
  });

  test.each([
    {
      case: 'theme()',
      declaration: { property: 'color', value: 'theme(colors.red.500)' },
      candidate: '[color:theme(colors.red.500)]',
      themedDeclaration: '  color: #ef4444;',
    },
    {
      case: '--theme()',
      declaration: { property: 'color', value: '--theme(--color-brand)' },
      candidate: '[color:--theme(--color-brand)]',
      themedDeclaration: '  color: var(--color-brand);',
    },
    {
      case: '--spacing()',
      declaration: { property: 'margin', value: '--spacing(4)' },
      candidate: '[margin:--spacing(4)]',
      themedDeclaration: '  margin: calc(var(--spacing) * 4);',
    },
  ] satisfies readonly {
    readonly case: string;
    readonly declaration: LiteralStyleDeclaration;
    readonly candidate: string;
    readonly themedDeclaration: string;
  }[])(
    'shows that $case is compiler-empty or theme-dependent',
    async ({ declaration, candidate, themedDeclaration }) => {
      expect(encoder.encode(declaration)).toBe(candidate);

      expect(await producesOutput(candidate)).toBe(false);

      const withTheme = await compileCandidate(
        candidate,
        '@theme { --color-red-500: #ef4444; --color-brand: #123456; --spacing: 0.25rem; } @tailwind utilities;',
      );
      expect(withTheme).toContain(themedDeclaration);
    },
  );

  test.each([
    ['backslashes', { property: 'color', value: 'r\\65 d' }],
    ['square brackets', { property: 'content', value: '"[unsafe]"' }],
    ['line breaks', { property: 'content', value: 'one\ntwo' }],
    ['raw-source quotes', { property: 'font-family', value: '"IBM Plex Sans", sans-serif' }],
    ['raw-source references', { property: 'content', value: '&copy;' }],
  ] satisfies readonly [string, LiteralStyleDeclaration][])('refuses unprovable %s', (_case, declaration) => {
    expect(() => encoder.encode(declaration)).toThrow(/cannot be encoded/u);
  });
});
