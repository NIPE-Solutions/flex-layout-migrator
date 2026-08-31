import { compile } from 'tailwindcss';

async function compileCandidates(candidates: readonly string[]): Promise<string> {
  const compiler = await compile('@tailwind utilities;');
  return compiler.build([...candidates]);
}

describe('Tailwind CSS v4 arbitrary media variants', () => {
  test('compiles representative exact viewport ranges', async () => {
    const css = await compileCandidates([
      '[@media_screen_and_(min-width:_600px)]:flex-col',
      '[@media_screen_and_(max-width:_599.98px)]:flex-col',
      '[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:flex-col',
    ]);

    expect(css).toContain('@media screen and (min-width: 600px)');
    expect(css).toContain('@media screen and (max-width: 599.98px)');
    expect(css).toContain('@media screen and (min-width: 600px) and (max-width: 959.98px)');
    expect(css).toContain('flex-direction: column');
  });
});
