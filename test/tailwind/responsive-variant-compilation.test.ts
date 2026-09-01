import { compile } from 'tailwindcss';
import { BreakpointCatalog, type BreakpointDefinition } from '../../src/breakpoint/breakpoint-catalog';
import type { LocatedFlexLayoutInput } from '../../src/analyzer/flex-layout-attribute.analyzer';
import type { PlannedConversion } from '../../src/adapter/conversion-adapter';
import { ResponsiveVariantEmitter } from '../../src/adapter/tailwind/responsive-variant.emitter';
import { ExtendedResponsiveEmitter } from '../../src/adapter/tailwind/extended/extended-responsive.emitter';
import type {
  ExtendedResponsiveState,
  ResponsiveClassValue,
} from '../../src/adapter/tailwind/extended/responsive-class.model';
import type { ResponsiveStyleValue } from '../../src/adapter/tailwind/extended/responsive-style.model';
import { parseResponsiveStyleValue } from '../../src/adapter/tailwind/extended/responsive-style-value.parser';
import { DisplayCompositionPlanner } from '../../src/adapter/tailwind/visibility/display-composition.planner';
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

function responsiveUtility(alias: string, utility: string): string {
  return new ResponsiveVariantEmitter().emit(definition(alias), utility);
}

function layoutPlan(alias: string): PlannedConversion {
  return {
    status: 'converted',
    input: {
      ...visibilityState('shown', alias).input,
      id: `fixture:fxLayout.${alias}`,
      sourceName: `fxLayout.${alias}`,
      directive: 'fxLayout',
      value: 'row',
    },
    classNames: [responsiveUtility(alias, 'flex'), responsiveUtility(alias, 'flex-row')],
  };
}

function composedCandidates(states: readonly VisibilityState[], layout: PlannedConversion): readonly string[] {
  const result = new DisplayCompositionPlanner().compose({
    visibilityPlan: { status: 'converted', states },
    displayResolution: { status: 'resolved', utility: undefined },
    layoutPlans: [layout],
  });
  if (result.status !== 'converted') throw new Error('Expected display composition to convert.');
  return result.plans.flatMap(plan => (plan.status === 'converted' ? plan.classNames : []));
}

function compose(states: readonly VisibilityState[], layout: PlannedConversion) {
  return new DisplayCompositionPlanner().compose({
    visibilityPlan: { status: 'converted', states },
    displayResolution: { status: 'resolved', utility: undefined },
    layoutPlans: [layout],
  });
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
      expect(parseResponsiveStyleValue(styleInput)).toMatchObject({ status: 'unverified' });
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

  test('suppresses a responsive layout display that would otherwise override inherited base hiding', async () => {
    const responsiveFlex = responsiveUtility('sm', 'flex');
    const unsafeCss = await compileCandidates(['hidden', responsiveFlex]);
    const unsafeResponsiveRule = mediaBlock(unsafeCss, 'screen and (min-width: 600px) and (max-width: 959.98px)');

    expect(unsafeResponsiveRule).toContain('display: flex');
    expect(unsafeCss.indexOf(unsafeResponsiveRule)).toBeGreaterThan(unsafeCss.indexOf('.hidden'));

    const candidates = composedCandidates([visibilityState('hidden')], layoutPlan('sm'));
    const css = await compileCandidates(candidates);
    const responsiveRule = mediaBlock(css, 'screen and (min-width: 600px) and (max-width: 959.98px)');

    expect(candidates).not.toContain(responsiveFlex);
    expect(responsiveRule).toContain('flex-direction: row');
    expect(responsiveRule).not.toContain('display: flex');
  });

  test.each([
    ['nested max-only', 'lt-md', 'lt-sm', 'screen and (max-width: 959.98px)', 'screen and (max-width: 599.98px)'],
    ['crossing min/max', 'gt-xs', 'lt-md', 'screen and (min-width: 600px)', 'screen and (max-width: 959.98px)'],
  ])(
    'preserves %s partial overlap when compiled layout display can override hiding',
    async (_case, layoutAlias, hideAlias, layoutQuery, hideQuery) => {
      const responsiveFlex = responsiveUtility(layoutAlias, 'flex');
      const responsiveHidden = responsiveUtility(hideAlias, 'hidden');
      const unsafeCss = await compileCandidates([responsiveFlex, responsiveHidden]);
      const flexRule = mediaBlock(unsafeCss, layoutQuery);
      const hiddenRule = mediaBlock(unsafeCss, hideQuery);

      expect(flexRule).toContain('display: flex');
      expect(hiddenRule).toContain('display: none');
      expect(unsafeCss.indexOf(flexRule)).toBeGreaterThan(unsafeCss.indexOf(hiddenRule));

      const result = compose([visibilityState('hidden', hideAlias)], layoutPlan(layoutAlias));
      expect(result).toMatchObject({ status: 'unresolved' });
      expect(result.plans.every(plan => plan.status === 'review' && plan.code === 'context-unverified')).toBe(true);
    },
  );
});
