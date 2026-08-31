import { compile } from 'tailwindcss';
import { BreakpointCatalog, type BreakpointDefinition } from '../../src/breakpoint/breakpoint-catalog';
import { ResponsiveVariantEmitter } from '../../src/adapter/tailwind/responsive-variant.emitter';

function definition(alias: string): BreakpointDefinition {
  const classification = new BreakpointCatalog().classify(alias);
  if (classification.kind !== 'verified') {
    throw new Error(`Expected ${alias} to be a verified viewport breakpoint`);
  }
  return classification.definition;
}

async function compileCandidates(candidates: readonly string[]): Promise<string> {
  const compiler = await compile('@tailwind utilities;');
  return compiler.build([...candidates]);
}

describe('Tailwind CSS v4 arbitrary media variants', () => {
  test('compiles representative exact viewport ranges', async () => {
    const emitter = new ResponsiveVariantEmitter();
    const css = await compileCandidates([
      emitter.emit(definition('gt-xs'), 'flex-col'),
      emitter.emit(definition('lt-sm'), 'flex-col'),
      emitter.emit(definition('sm'), 'flex-col'),
    ]);

    expect(css).toContain('@media screen and (min-width: 600px)');
    expect(css).toContain('@media screen and (max-width: 599.98px)');
    expect(css).toContain('@media screen and (min-width: 600px) and (max-width: 959.98px)');
    expect(css).toContain('flex-direction: column');
  });
});
