import { compile } from 'tailwindcss';
import { BreakpointCatalog, type BreakpointDefinition } from '../../src/breakpoint/breakpoint-catalog';
import type { LocatedFlexLayoutInput } from '../../src/analyzer/flex-layout-attribute.analyzer';
import { ResponsiveVariantEmitter } from '../../src/adapter/tailwind/responsive-variant.emitter';
import { VisibilityEmitter } from '../../src/adapter/tailwind/visibility/visibility.emitter';
import type { VisibilityIntent, VisibilityState } from '../../src/adapter/tailwind/visibility/visibility.model';

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

function visibilityState(intent: VisibilityIntent, alias?: string): VisibilityState {
  const sourceName = `fxShow${alias === undefined ? '' : `.${alias}`}`;
  const input: LocatedFlexLayoutInput = {
    id: `fixture:${sourceName}`,
    fileName: 'fixture.html',
    elementId: '0',
    sourceName,
    directive: 'fxShow',
    value: '',
    binding: 'literal',
    breakpoint: alias,
    source: { start: 0, end: 1 },
    nameSource: { start: 0, end: 1 },
  };
  return alias === undefined
    ? { input, intent, activation: { kind: 'base' } }
    : { input, intent, activation: { kind: 'media', definition: definition(alias) } };
}

function mediaBlock(css: string, query: string): string {
  const marker = `@media ${query} {`;
  const start = css.indexOf(marker);
  if (start < 0) throw new Error(`Expected compiled CSS to contain ${marker}`);

  let depth = 0;
  for (let index = start; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    if (css[index] !== '}') continue;
    depth -= 1;
    if (depth === 0) return css.slice(start, index + 1);
  }
  throw new Error(`Expected ${marker} to contain a complete block.`);
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

  test('compiles visibility display ownership in base, bounded, min-only, and max-only activations', async () => {
    const emitter = new VisibilityEmitter();
    const css = await compileCandidates([
      ...emitter.emit(visibilityState('hidden'), undefined),
      ...emitter.emit(visibilityState('hidden', 'sm'), undefined),
      ...emitter.emit(visibilityState('shown', 'gt-xs'), 'flex'),
      ...emitter.emit(visibilityState('shown', 'lt-sm'), 'inline-flex'),
    ]);

    expect(css).toMatch(/\.hidden\s*\{\s*display: none;\s*\}/u);
    expect(mediaBlock(css, 'screen and (min-width: 600px) and (max-width: 959.98px)')).toContain('display: none');
    expect(mediaBlock(css, 'screen and (min-width: 600px)')).toContain('display: flex');
    expect(mediaBlock(css, 'screen and (max-width: 599.98px)')).toContain('display: inline-flex');
  });

  test('keeps a base layout display while responsive hidden owns the exact bounded range', async () => {
    const emitter = new VisibilityEmitter();
    const css = await compileCandidates(['flex', ...emitter.emit(visibilityState('hidden', 'sm'), undefined)]);
    const responsiveRule = mediaBlock(css, 'screen and (min-width: 600px) and (max-width: 959.98px)');

    expect(css).toMatch(/\.flex\s*\{\s*display: flex;\s*\}/u);
    expect(responsiveRule).toContain('display: none');
    expect(css.indexOf(responsiveRule)).toBeGreaterThan(css.indexOf('.flex'));
  });
});
