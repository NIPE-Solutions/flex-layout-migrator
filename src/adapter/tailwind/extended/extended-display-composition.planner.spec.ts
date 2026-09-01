import type { LocatedFlexLayoutInput } from '../../../analyzer/flex-layout-attribute.analyzer';
import { BreakpointCatalog } from '../../../breakpoint/breakpoint-catalog';
import type { PlannedConversion } from '../../conversion-adapter';
import { ResponsiveVariantEmitter } from '../responsive-variant.emitter';
import type { VisibilityState } from '../visibility/visibility.model';
import type { VisibilityFamilyPlan } from '../visibility/visibility-state.planner';
import type { VisibleDisplayResolution } from '../visibility/visible-display.resolver';
import { ExtendedDisplayCompositionPlanner } from './extended-display-composition.planner';

const catalog = new BreakpointCatalog();
const emitter = new ResponsiveVariantEmitter();

function definition(alias: string) {
  const classification = catalog.classify(alias);
  if (classification.kind !== 'verified') throw new Error(`Expected ${alias} to be verified.`);
  return classification.definition;
}

function responsive(alias: string, utility: string): string {
  return emitter.emit(definition(alias), utility);
}

function responsiveExtended(alias: string, utility: string): string {
  const ordinary = responsive(alias, 'block');
  return `${ordinary.slice(0, -'block'.length)}${utility}`;
}

function input(
  directive: LocatedFlexLayoutInput['directive'],
  alias: string | undefined,
  value: string,
  index: number,
): LocatedFlexLayoutInput {
  return {
    id: `fixture:${directive}.${alias ?? 'base'}:${index}`,
    fileName: 'fixture.html',
    elementId: '0',
    sourceName: `${directive}${alias === undefined ? '' : `.${alias}`}`,
    directive,
    value,
    binding: 'literal',
    breakpoint: alias,
    source: { start: index, end: index + 1 },
    nameSource: { start: index, end: index + 1 },
  };
}

function converted(
  directive: LocatedFlexLayoutInput['directive'],
  alias: string,
  value: string,
  classNames: readonly string[],
  index = 0,
): PlannedConversion {
  return { status: 'converted', input: input(directive, alias, value, index), classNames };
}

function visibility(intent: 'shown' | 'hidden', alias?: string, index = 10): VisibilityState {
  const directive = intent === 'shown' ? 'fxShow' : 'fxHide';
  const visibilityInput = input(directive, alias, '', index);
  return alias === undefined
    ? { input: visibilityInput, intent, activation: { kind: 'base' } }
    : { input: visibilityInput, intent, activation: { kind: 'media', definition: definition(alias) } };
}

function visibilityPlan(...states: readonly VisibilityState[]): VisibilityFamilyPlan {
  return { status: 'converted', states };
}

describe('ExtendedDisplayCompositionPlanner', () => {
  test.each([
    {
      name: 'all-shown exact class display',
      className: responsive('sm', 'block'),
      states: [visibility('shown', 'sm')],
      expectedStatus: 'unverified',
    },
    {
      name: 'all-shown inner variant class display',
      className: responsiveExtended('sm', 'hover:block'),
      states: [visibility('shown', 'sm')],
      expectedStatus: 'unverified',
    },
    {
      name: 'base-hidden responsive-shown class display',
      className: responsive('sm', 'block'),
      states: [visibility('hidden'), visibility('shown', 'sm')],
      expectedStatus: 'unverified',
    },
    {
      name: 'disjoint all-shown range',
      className: responsive('sm', 'block'),
      states: [visibility('shown', 'md')],
      expectedStatus: 'resolved',
    },
  ] as const)('resolves $name conservatively', ({ className, states, expectedStatus }) => {
    const current: VisibleDisplayResolution = { status: 'resolved', utility: undefined };
    const plans = [converted('ngClass', 'sm', 'block', [className])];

    const result = new ExtendedDisplayCompositionPlanner().resolveVisibleDisplay(
      current,
      plans,
      visibilityPlan(...states),
    );

    expect(result.status).toBe(expectedStatus);
    if (expectedStatus === 'resolved') expect(result).toBe(current);
  });

  test.each([
    {
      name: 'class display under exact hidden inline ownership',
      plan: converted('ngClass', 'sm', 'block', [responsive('sm', 'block')]),
      states: [visibility('hidden', 'sm')],
      strategyStatus: 'converted',
      classNames: [],
      visibilityStatus: 'converted',
    },
    {
      name: 'style display competing with exact hidden inline ownership',
      plan: converted('ngStyle', 'sm', 'display:block', [responsive('sm', '[display:block]')]),
      states: [visibility('hidden', 'sm')],
      strategyStatus: 'review',
      classNames: undefined,
      visibilityStatus: 'unresolved',
    },
    {
      name: 'class display with a partially hidden range',
      plan: converted('ngClass', 'lt-md', 'block', [responsive('lt-md', 'block')]),
      states: [visibility('hidden', 'lt-sm')],
      strategyStatus: 'review',
      classNames: undefined,
      visibilityStatus: 'unresolved',
    },
  ] as const)('composes $name', ({ plan, states, strategyStatus, classNames, visibilityStatus }) => {
    const result = new ExtendedDisplayCompositionPlanner().compose([plan], visibilityPlan(...states));

    expect(result.strategyPlans[0]?.status).toBe(strategyStatus);
    expect(result.strategyPlans[0]?.status === 'converted' ? result.strategyPlans[0].classNames : undefined).toEqual(
      classNames,
    );
    expect(result.visibilityPlan.status).toBe(visibilityStatus);
  });

  test.each([
    {
      name: 'layout inline display owns an exact class display',
      extended: converted('ngClass', 'sm', 'hidden', [responsive('sm', 'hidden')], 1),
      statuses: ['converted', 'converted'],
      extendedClasses: [],
    },
    {
      name: 'layout and style remain competing inline display writers',
      extended: converted('ngStyle', 'sm', 'display:block', [responsive('sm', '[display:block]')], 1),
      statuses: ['review', 'review'],
      extendedClasses: undefined,
    },
  ] as const)('$name', ({ extended, statuses, extendedClasses }) => {
    const layout = converted('fxLayout', 'sm', 'row', [responsive('sm', 'flex')]);
    const result = new ExtendedDisplayCompositionPlanner().composeWithLayout([layout, extended]);

    expect(result.map(plan => plan.status)).toEqual(statuses);
    expect(result[1]?.status === 'converted' ? result[1].classNames : undefined).toEqual(extendedClasses);
  });
});
