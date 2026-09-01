import { compile } from 'tailwindcss';
import type { LiteralStyleDeclaration } from '../visibility/literal-style-display';
import { TailwindArbitraryPropertyEncoder } from './tailwind-arbitrary-property.encoder';

async function compileCandidate(candidate: string): Promise<string> {
  const compiler = await compile('@tailwind utilities;');
  return compiler.build([candidate]);
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
      case: 'quoted values, commas, and spaces',
      declaration: { property: 'font-family', value: '"IBM Plex Sans", sans-serif' },
      candidate: '[font-family:"IBM_Plex_Sans",_sans-serif]',
      cssValue: '"IBM Plex Sans", sans-serif',
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

  test.each([
    ['backslashes', { property: 'color', value: 'r\\65 d' }],
    ['square brackets', { property: 'content', value: '"[unsafe]"' }],
    ['line breaks', { property: 'content', value: 'one\ntwo' }],
  ] satisfies readonly [string, LiteralStyleDeclaration][])('refuses unprovable %s', (_case, declaration) => {
    expect(() => encoder.encode(declaration)).toThrow(/cannot be encoded/u);
  });
});
