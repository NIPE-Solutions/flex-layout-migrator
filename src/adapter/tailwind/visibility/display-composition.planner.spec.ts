import type { LocatedFlexLayoutInput } from '../../../analyzer/flex-layout-attribute.analyzer';
import { BreakpointCatalog } from '../../../breakpoint/breakpoint-catalog';
import type { PlannedConversion } from '../../conversion-adapter';
import { ResponsiveVariantEmitter } from '../responsive-variant.emitter';
import type { VisibilityIntent, VisibilityState } from './visibility.model';
import type { VisibilityFamilyPlan } from './visibility-state.planner';
import type { VisibleDisplayResolution } from './visible-display.resolver';
import { DisplayCompositionPlanner, type DisplayCompositionRequest } from './display-composition.planner';

function input(
  directive: LocatedFlexLayoutInput['directive'],
  breakpoint?: string,
  id = `fixture:${directive}${breakpoint === undefined ? '' : `.${breakpoint}`}`,
): LocatedFlexLayoutInput {
  const sourceName = `${directive}${breakpoint === undefined ? '' : `.${breakpoint}`}`;
  return {
    id,
    fileName: 'fixture.html',
    elementId: '0',
    sourceName,
    directive,
    value: directive === 'fxLayout' ? 'row' : '',
    binding: 'literal',
    breakpoint,
    source: { start: 0, end: 1 },
    nameSource: { start: 0, end: 1 },
  };
}

function state(
  intent: VisibilityIntent,
  breakpoint?: string,
  id?: string,
  directive: 'fxShow' | 'fxHide' = 'fxShow',
): VisibilityState {
  const member = input(directive, breakpoint, id);
  if (breakpoint === undefined) return { input: member, intent, activation: { kind: 'base' } };
  const classification = new BreakpointCatalog().classify(breakpoint);
  if (classification.kind !== 'verified') throw new Error(`Expected ${breakpoint} to be verified.`);
  return { input: member, intent, activation: { kind: 'media', definition: classification.definition } };
}

function layout(classNames: readonly string[], breakpoint?: string, id?: string): PlannedConversion {
  return { status: 'converted', input: input('fxLayout', breakpoint, id), classNames };
}

function variant(breakpoint: string, utility: string): string {
  const classification = new BreakpointCatalog().classify(breakpoint);
  if (classification.kind !== 'verified') throw new Error(`Expected ${breakpoint} to be verified.`);
  return new ResponsiveVariantEmitter().emit(classification.definition, utility);
}

function request(
  states: readonly VisibilityState[],
  overrides: Partial<DisplayCompositionRequest> = {},
): DisplayCompositionRequest {
  return {
    visibilityPlan: { status: 'converted', states },
    displayResolution: { status: 'resolved', utility: undefined },
    layoutPlans: [],
    ...overrides,
  };
}

function compose(states: readonly VisibilityState[], overrides: Partial<DisplayCompositionRequest> = {}) {
  return new DisplayCompositionPlanner().compose(request(states, overrides));
}

function convertedClasses(result: ReturnType<typeof compose>): ReadonlyMap<string, readonly string[]> {
  return new Map(
    result.plans.flatMap(plan => (plan.status === 'converted' ? [[plan.input.id, plan.classNames] as const] : [])),
  );
}

describe('DisplayCompositionPlanner', () => {
  test('removes an always-shown family as a no-op while still planning its input', () => {
    const shown = state('shown');

    expect(compose([shown])).toEqual({
      status: 'converted',
      plans: [{ status: 'converted', input: shown.input, classNames: [] }],
    });
  });

  test('emits a base hide on the canonical visibility owner', () => {
    const hidden = state('hidden');

    expect(convertedClasses(compose([hidden])).get(hidden.input.id)).toEqual(['hidden']);
  });

  test('emits an exact responsive hide on the canonical visibility owner', () => {
    const hidden = state('hidden', 'sm');

    expect(convertedClasses(compose([hidden])).get(hidden.input.id)).toEqual([variant('sm', 'hidden')]);
  });

  test('emits base hiding and a proven responsive restoration exactly once', () => {
    const responsive = state('shown', 'sm', 'fixture:z-responsive');
    const base = state('hidden', undefined, 'fixture:a-base', 'fxHide');

    const classes = convertedClasses(
      compose([responsive, base], {
        displayResolution: { status: 'resolved', utility: 'flex' },
      }),
    );

    expect(classes.get(base.input.id)).toEqual(['hidden', variant('sm', 'flex')]);
    expect(classes.get(responsive.input.id)).toEqual([]);
  });

  test('suppresses a same-range responsive layout display when visibility fully hides that activation', () => {
    const hidden = state('hidden', 'sm');
    const responsiveLayout = layout(
      [variant('sm', 'flex'), variant('sm', 'flex-row'), variant('sm', 'box-border')],
      'sm',
    );

    const classes = convertedClasses(compose([hidden], { layoutPlans: [responsiveLayout] }));

    expect(classes.get(responsiveLayout.input.id)).toEqual([variant('sm', 'flex-row'), variant('sm', 'box-border')]);
    expect(classes.get(hidden.input.id)).toEqual([variant('sm', 'hidden')]);
  });

  test('suppresses a responsive layout display inherited under a hidden base state', () => {
    const hidden = state('hidden');
    const responsiveLayout = layout(
      [variant('sm', 'flex'), variant('sm', 'flex-row'), variant('sm', 'box-border')],
      'sm',
    );

    const classes = convertedClasses(compose([hidden], { layoutPlans: [responsiveLayout] }));

    expect(classes.get(responsiveLayout.input.id)).toEqual([variant('sm', 'flex-row'), variant('sm', 'box-border')]);
  });

  test.each(['lt-md', 'gt-xs'])('suppresses a nested layout fully covered by the hidden %s range', breakpoint => {
    const hidden = state('hidden', breakpoint);
    const responsiveLayout = layout(
      [variant('sm', 'inline-flex'), variant('sm', 'flex-col'), variant('sm', 'box-border')],
      'sm',
    );

    const classes = convertedClasses(compose([hidden], { layoutPlans: [responsiveLayout] }));

    expect(classes.get(responsiveLayout.input.id)).toEqual([variant('sm', 'flex-col'), variant('sm', 'box-border')]);
  });

  test('suppresses a base layout display when hidden responsive ranges jointly cover its complete activation', () => {
    const hiddenBelowMd = state('hidden', 'lt-md');
    const hiddenAboveXs = state('hidden', 'gt-xs');
    const baseLayout = layout(['flex', 'flex-row', 'box-border']);

    const classes = convertedClasses(
      compose([hiddenAboveXs, hiddenBelowMd], {
        layoutPlans: [baseLayout],
      }),
    );

    expect(classes.get(baseLayout.input.id)).toEqual(['flex-row', 'box-border']);
  });

  test('retains a wider responsive layout display when hiding covers only a narrower subrange', () => {
    const hidden = state('hidden', 'sm');
    const widerLayout = layout(
      [variant('lt-md', 'flex'), variant('lt-md', 'flex-row'), variant('lt-md', 'box-border')],
      'lt-md',
    );

    const classes = convertedClasses(compose([hidden], { layoutPlans: [widerLayout] }));

    expect(classes.get(widerLayout.input.id)).toEqual([
      variant('lt-md', 'flex'),
      variant('lt-md', 'flex-row'),
      variant('lt-md', 'box-border'),
    ]);
  });

  test('retains a responsive layout display when a shown override interrupts inherited base hiding', () => {
    const baseHidden = state('hidden');
    const responsiveShown = state('shown', 'sm');
    const responsiveLayout = layout([variant('sm', 'flex'), variant('sm', 'flex-row')], 'sm');

    const classes = convertedClasses(
      compose([responsiveShown, baseHidden], {
        displayResolution: { status: 'resolved', utility: 'flex' },
        layoutPlans: [responsiveLayout],
      }),
    );

    expect(classes.get(responsiveLayout.input.id)).toEqual([variant('sm', 'flex'), variant('sm', 'flex-row')]);
  });

  test('keeps a base layout display when only a narrower responsive range is hidden', () => {
    const hidden = state('hidden', 'sm');
    const baseLayout = layout(['flex', 'flex-row', 'box-border']);

    const classes = convertedClasses(compose([hidden], { layoutPlans: [baseLayout] }));

    expect(classes.get(baseLayout.input.id)).toEqual(['flex', 'flex-row', 'box-border']);
    expect(classes.get(hidden.input.id)).toEqual([variant('sm', 'hidden')]);
  });

  test('removes only the owned display token and preserves every non-display layout utility', () => {
    const hidden = state('hidden');
    const baseLayout = layout(['flex', 'flex-row', 'flex-wrap', 'items-center', 'basis-auto', 'box-border']);

    const classes = convertedClasses(compose([hidden], { layoutPlans: [baseLayout] }));

    expect(classes.get(baseLayout.input.id)).toEqual([
      'flex-row',
      'flex-wrap',
      'items-center',
      'basis-auto',
      'box-border',
    ]);
  });

  test('preserves the complete visibility family when restoration is unresolved', () => {
    const base = state('hidden');
    const responsive = state('shown', 'sm');
    const displayResolution: VisibleDisplayResolution = {
      status: 'unverified',
      reason: 'The visible display value cannot be proven from one unambiguous source.',
    };

    const result = compose([responsive, base], { displayResolution });

    expect(result.status).toBe('unresolved');
    expect(result.plans).toHaveLength(2);
    expect(result.plans).toMatchObject([
      { input: base.input, status: 'review', code: 'display-restoration-unverified' },
      { input: responsive.input, status: 'review', code: 'display-restoration-unverified' },
    ]);
  });

  test('produces canonical plans and class ownership independent of request order', () => {
    const states = [
      state('shown', 'gt-lg', 'fixture:show-gt-lg'),
      state('hidden', undefined, 'fixture:hide-base', 'fxHide'),
      state('shown', 'sm', 'fixture:show-sm'),
    ];
    const layouts = [
      layout([variant('sm', 'inline-flex'), variant('sm', 'flex-row')], 'sm', 'fixture:layout-sm'),
      layout(['flex', 'flex-col'], undefined, 'fixture:layout-base'),
    ];
    const displayResolution: VisibleDisplayResolution = { status: 'resolved', utility: 'inline-flex' };

    const forward = new DisplayCompositionPlanner().compose({
      visibilityPlan: { status: 'converted', states },
      displayResolution,
      layoutPlans: layouts,
    });
    const reverse = new DisplayCompositionPlanner().compose({
      visibilityPlan: { status: 'converted', states: [...states].reverse() },
      displayResolution,
      layoutPlans: [...layouts].reverse(),
    });

    expect(forward).toEqual(reverse);
    expect(forward.plans).toHaveLength(states.length + layouts.length);
    expect(convertedClasses(forward).get('fixture:hide-base')).toEqual([
      'hidden',
      variant('sm', 'inline-flex'),
      variant('gt-lg', 'inline-flex'),
    ]);
    expect(convertedClasses(forward).get('fixture:show-sm')).toEqual([]);
    expect(convertedClasses(forward).get('fixture:show-gt-lg')).toEqual([]);
  });

  test('passes through an already-unresolved visibility family with every layout plan', () => {
    const unresolvedInput = input('fxShow');
    const visibilityPlan: VisibilityFamilyPlan = {
      status: 'unresolved',
      plans: [
        {
          status: 'review',
          input: unresolvedInput,
          code: 'dynamic-binding',
          reason: 'Angular property bindings may depend on runtime state.',
          suggestion: 'Replace the binding manually.',
        },
      ],
    };
    const baseLayout = layout(['flex', 'flex-row']);

    const result = new DisplayCompositionPlanner().compose({
      visibilityPlan,
      displayResolution: { status: 'resolved', utility: undefined },
      layoutPlans: [baseLayout],
    });

    expect(result).toMatchObject({ status: 'unresolved' });
    expect(result.plans).toHaveLength(2);
  });
});
