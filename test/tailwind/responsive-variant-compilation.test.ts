import { compile } from 'tailwindcss';
import { BreakpointCatalog, type BreakpointDefinition } from '../../src/breakpoint/breakpoint-catalog';
import type { LocatedFlexLayoutInput } from '../../src/analyzer/flex-layout-attribute.analyzer';
import { ResponsiveVariantEmitter } from '../../src/adapter/tailwind/responsive-variant.emitter';
import { ExtendedResponsiveEmitter } from '../../src/adapter/tailwind/extended/extended-responsive.emitter';
import type { ExtendedResponsiveState, ResponsiveClassValue } from '../../src/semantic/extended/responsive-class.model';
import type { ResponsiveStyleValue } from '../../src/semantic/extended/responsive-style.model';
import { parseResponsiveStyleValue } from '../../src/semantic/extended/responsive-style-value.parser';
import { TailwindSourcePropertyEvidence } from '../../src/evidence/tailwind-source-property.evidence';
import { VisibilityEmitter } from '../../src/adapter/tailwind/visibility/visibility.emitter';
import type { VisibilityIntent, VisibilityState } from '../../src/semantic/visibility/visibility.model';

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

function responsiveUtility(alias: string, utility: string): string {
  const emitted = new ResponsiveVariantEmitter().emit(definition(alias), utility)[0];
  if (!emitted) throw new Error(`Expected ${alias} to emit one responsive utility`);
  return emitted;
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
      ...emitter.emit(definition('gt-xs'), 'flex-col'),
      ...emitter.emit(definition('lt-sm'), 'flex-col'),
      ...emitter.emit(definition('sm'), 'flex-col'),
    ]);

    expect(css).toContain('@media screen and (min-width: 600px)');
    expect(css).toContain('@media screen and (max-width: 599.98px)');
    expect(css).toContain('@media screen and (min-width: 600px) and (max-width: 959.98px)');
    expect(css).toContain('flex-direction: column');
  });

  test('compiles exact composite orientation and print variants', async () => {
    const catalog = new BreakpointCatalog({
      orientationBreakpoints: true,
      printWithBreakpoints: [],
    });
    const handset = catalog.classify('handset');
    const print = catalog.classify('print');
    if (handset.kind !== 'verified' || print.kind !== 'verified') {
      throw new Error('Expected configured orientation and print aliases');
    }

    const emitter = new ResponsiveVariantEmitter();
    const css = await compileCandidates([
      ...emitter.emit(handset.definition, 'flex-col'),
      ...emitter.emit(print.definition, 'hidden'),
    ]);

    expect(css).toContain('@media (orientation: portrait) and (max-width: 599.98px)');
    expect(css).toContain('@media (orientation: landscape) and (max-width: 959.98px)');
    expect(css).toContain('@media print');
    expect(css).toContain('flex-direction: column');
    expect(css).toContain('display: none');
  });

  test('compiles emitted responsive class candidates and arbitrary style declarations with exact ownership', async () => {
    const emitter = new ExtendedResponsiveEmitter();
    const classInput = visibilityState('shown', 'sm').input;
    const classState: ExtendedResponsiveState<ResponsiveClassValue> = {
      input: { ...classInput, directive: 'ngClass', sourceName: 'ngClass.sm', value: 'hover:flex w-[17px]' },
      activation: { kind: 'media', definition: definition('sm') },
      value: { tokens: ['hover:flex', 'w-[17px]'] },
    };
    const styleInput = visibilityState('shown', 'gt-xs').input;
    const styleState: ExtendedResponsiveState<ResponsiveStyleValue> = {
      input: { ...styleInput, directive: 'ngStyle', sourceName: 'ngStyle.gt-xs', value: 'font-size:14px' },
      activation: { kind: 'media', definition: definition('gt-xs') },
      value: {
        declarations: [
          { property: 'font-size', value: '14px' },
          { property: '--card-gap', value: '1rem' },
        ],
      },
    };

    const css = await compileCandidates([...emitter.emitClass(classState), ...emitter.emitStyle(styleState)]);
    const bounded = mediaBlock(css, 'screen and (min-width: 600px) and (max-width: 959.98px)');
    const minOnly = mediaBlock(css, 'screen and (min-width: 600px)');

    expect(bounded).toContain('display: flex');
    expect(bounded).toContain('width: 17px');
    expect(minOnly).toContain('font-size: 14px');
    expect(minOnly).toContain('--card-gap: 1rem');
  });

  test.each([
    ['flex direction', 'flex-col', 'flex-row', 'flex-direction: column', 'flex-direction: row'],
    ['arbitrary color', '[color:red]', '[color:blue]', 'color: red', 'color: blue'],
  ])(
    'canonicalizes competing responsive %s rules independently of candidate order',
    async (_case, left, right, leftDeclaration, rightDeclaration) => {
      const candidates = [responsiveUtility('sm', left), responsiveUtility('sm', right)];
      const forward = await compileCandidates(candidates);
      const reverse = await compileCandidates([...candidates].reverse());
      const responsiveRule = mediaBlock(forward, 'screen and (min-width: 600px) and (max-width: 959.98px)');

      expect(reverse).toBe(forward);
      expect(responsiveRule).toContain(leftDeclaration);
      expect(responsiveRule).toContain(rightDeclaration);
    },
  );

  test('emits universal ownership after responsive display regardless of candidate order', async () => {
    const universal = responsiveUtility('sm', '[all:unset]');
    const display = responsiveUtility('sm', 'flex');
    const forward = await compileCandidates([universal, display]);
    const reverse = await compileCandidates([display, universal]);
    const responsiveRule = mediaBlock(forward, 'screen and (min-width: 600px) and (max-width: 959.98px)');

    expect(reverse).toBe(forward);
    expect(responsiveRule.indexOf('all: unset')).toBeGreaterThan(responsiveRule.indexOf('display: flex'));
  });

  test('keeps an inner hover variant conditional inside the exact responsive wrapper', async () => {
    const input = visibilityState('shown', 'sm').input;
    const state: ExtendedResponsiveState<ResponsiveClassValue> = {
      input: { ...input, directive: 'ngClass', sourceName: 'ngClass.sm', value: 'hover:block' },
      activation: { kind: 'media', definition: definition('sm') },
      value: { tokens: ['hover:block'] },
    };
    const css = await compileCandidates(new ExtendedResponsiveEmitter().emitClass(state));
    const responsiveRule = mediaBlock(css, 'screen and (min-width: 600px) and (max-width: 959.98px)');

    expect(responsiveRule).toContain('@media (hover: hover)');
    expect(responsiveRule).toContain(':hover');
    expect(responsiveRule).toContain('display: block');
  });

  test.each([
    [
      'longhand before shorthand',
      'margin-top: 2rem; margin: 1rem',
      [
        { property: 'margin-top', value: '2rem' },
        { property: 'margin', value: '1rem' },
      ],
    ],
    [
      'shorthand before longhand',
      'margin: 1rem; margin-top: 2rem',
      [
        { property: 'margin', value: '1rem' },
        { property: 'margin-top', value: '2rem' },
      ],
    ],
  ] as const)(
    'rejects %s because Tailwind compiler order ignores responsive style source order',
    async (_case, value, declarations) => {
      const emitter = new ExtendedResponsiveEmitter();
      const styleInput: LocatedFlexLayoutInput = {
        ...visibilityState('shown', 'sm').input,
        directive: 'ngStyle',
        sourceName: 'ngStyle.sm',
        value,
      };
      const state: ExtendedResponsiveState<ResponsiveStyleValue> = {
        input: styleInput,
        activation: { kind: 'media', definition: definition('sm') },
        value: { declarations },
      };
      const candidates = emitter.emitStyle(state);
      const sourceOrderCss = await compileCandidates(candidates);
      const reverseOrderCss = await compileCandidates([...candidates].reverse());
      const responsiveRule = mediaBlock(sourceOrderCss, 'screen and (min-width: 600px) and (max-width: 959.98px)');

      expect(reverseOrderCss).toBe(sourceOrderCss);
      expect(responsiveRule).toContain('margin: 1rem');
      expect(responsiveRule).toContain('margin-top: 2rem');
      expect(parseResponsiveStyleValue(styleInput, new TailwindSourcePropertyEvidence())).toMatchObject({
        status: 'unverified',
      });
    },
  );

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
