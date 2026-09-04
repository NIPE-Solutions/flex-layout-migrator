import type { LocatedFlexLayoutInput } from '../analyzer/flex-layout-attribute.analyzer';
import { BreakpointCatalog } from '../breakpoint/breakpoint-catalog';
import type { SemanticConversionContext } from './conversion-context';
import {
  ResponsiveFamilyPlanner,
  type ResponsiveOrchestrationPlan,
  type SemanticTargetPolicy,
} from './responsive-family.planner';

const element = {
  id: '0',
  name: 'div',
  source: { start: 0, end: 5 },
  startTag: { start: 0, end: 5 },
  structural: false,
  attributes: [],
} as const;

function input(
  sourceName: string,
  value: string,
  overrides: Partial<LocatedFlexLayoutInput> = {},
): LocatedFlexLayoutInput {
  const breakpoint = sourceName.includes('.')
    ? sourceName.slice(sourceName.indexOf('.') + 1).replaceAll(']', '')
    : undefined;
  return {
    id: `fixture:${sourceName}`,
    fileName: 'fixture.html',
    elementId: '0',
    sourceName,
    directive: 'fxFlexAlign',
    value,
    binding: sourceName.startsWith('[') ? 'property' : 'literal',
    breakpoint,
    source: { start: 0, end: 1 },
    nameSource: { start: 0, end: 1 },
    ...overrides,
  };
}

const literal = (directive: LocatedFlexLayoutInput['directive'], value: string) =>
  input(directive, value, { directive });
const responsive = (
  directive: LocatedFlexLayoutInput['directive'],
  value: string,
  breakpoint: string,
  binding: LocatedFlexLayoutInput['binding'] = 'literal',
) =>
  input(`${binding === 'property' ? `[${directive}.${breakpoint}]` : `${directive}.${breakpoint}`}`, value, {
    directive,
    binding,
    breakpoint,
  });

interface FixturePlan extends ResponsiveOrchestrationPlan {
  readonly output?: string;
  readonly code?: string;
  readonly reason?: string;
  readonly suggestion?: string;
}

function converted(input: LocatedFlexLayoutInput, output: string): FixturePlan {
  return { status: 'converted', input, output };
}

function unresolved(input: LocatedFlexLayoutInput, code: string, reason: string): FixturePlan {
  return { status: 'review', input, code, reason, suggestion: 'migrate manually' };
}

const policy: SemanticTargetPolicy<FixturePlan> = {
  emptyPlan: item => converted(item, ''),
  targetEligibility: () => undefined,
  validateActivation: plan => plan,
  isTargetEligibilityFailure: plan =>
    plan.status !== 'converted' && (plan.code === 'breakpoint-unverified' || plan.code === 'custom-breakpoint'),
  sameOutput: (left, right) =>
    left.status === 'converted' && right.status === 'converted' && left.output === right.output,
  contextUnverified: (item, reason) => unresolved(item, 'context-unverified', reason),
  contextualOutputUnverified: item => unresolved(item, 'context-unverified', 'layout output differs'),
  responsivePrecedenceUnverified: item =>
    unresolved(item, 'responsive-precedence-unverified', 'responsive precedence differs'),
  decorate: plan => plan,
  addPrintFallback: plan => plan,
};

const context: SemanticConversionContext = {
  element,
  inputs: [],
  parentInputs: [],
  existingClassNames: [],
  attributeEvidence: [],
};

function planOne(item: LocatedFlexLayoutInput, itemContext: SemanticConversionContext): FixturePlan {
  if (item.binding === 'property') return unresolved(item, 'dynamic-binding', 'dynamic binding');
  return converted(item, `${itemContext.activeParentLayout ?? itemContext.activeLayout ?? ''}:${item.value}`);
}

describe('ResponsiveFamilyPlanner', () => {
  const planner = new ResponsiveFamilyPlanner(new BreakpointCatalog(), policy);

  test('routes ngClass/class and ngStyle/style as two complete extended families', () => {
    const members = [
      responsive('ngClass', 'flex', 'sm'),
      responsive('class', 'card', 'md'),
      responsive('ngStyle', 'color:red', 'sm'),
      responsive('style', 'display:block', 'md'),
    ];

    const plans = planner.plan(members, context, planOne, (family, familyMembers) =>
      familyMembers.map(member => converted(member, family)),
    );

    expect(plans).toEqual([
      expect.objectContaining({ status: 'converted', output: 'extended-class' }),
      expect.objectContaining({ status: 'converted', output: 'extended-class' }),
      expect.objectContaining({ status: 'converted', output: 'extended-style' }),
      expect.objectContaining({ status: 'converted', output: 'extended-style' }),
    ]);
  });

  test('converts a base member and a verified responsive override atomically', () => {
    const plans = planner.plan(
      [literal('fxFlexAlign', 'start'), responsive('fxFlexAlign', 'end', 'sm')],
      context,
      planOne,
    );

    expect(plans).toEqual([
      expect.objectContaining({ status: 'converted', output: ':start' }),
      expect.objectContaining({ status: 'converted', output: ':end' }),
    ]);
  });

  test('converts different utilities in disjoint responsive ranges', () => {
    const plans = planner.plan(
      [responsive('fxFlexAlign', 'start', 'xs'), responsive('fxFlexAlign', 'end', 'sm')],
      context,
      planOne,
    );

    expect(plans.every(plan => plan.status === 'converted')).toBe(true);
  });

  test('converts identical utilities in overlapping responsive ranges', () => {
    const plans = planner.plan(
      [responsive('fxFlexAlign', 'center', 'sm'), responsive('fxFlexAlign', 'center', 'gt-xs')],
      context,
      planOne,
    );

    expect(plans.every(plan => plan.status === 'converted')).toBe(true);
  });

  test('blocks a layout-dependent family when one responsive layout member is unresolved', () => {
    const plans = planner.plan(
      [literal('fxLayout', 'row'), responsive('fxLayout', 'dynamic', 'md', 'property'), literal('fxLayoutGap', '16px')],
      context,
      planOne,
    );

    expect(plans.find(plan => plan.input.directive === 'fxLayoutGap')).toMatchObject({
      status: 'review',
      code: 'context-unverified',
    });
  });

  test('uses parent responsive layout activation when planning flex-item semantics', () => {
    const flex = responsive('fxFlex', '25', 'md');
    const parentLayout = responsive('fxLayout', 'column', 'md');
    const childContextWithResponsiveParent: SemanticConversionContext = {
      ...context,
      parent: { ...element, id: 'parent' },
      parentInputs: [parentLayout],
    };

    expect(planner.plan([flex], childContextWithResponsiveParent, planOne)).toEqual([
      expect.objectContaining({ status: 'converted', output: 'column:25' }),
    ]);
  });

  test('preserves the complete family when overlapping ranges emit different utilities', () => {
    const plans = planner.plan(
      [responsive('fxFlexAlign', 'start', 'sm'), responsive('fxFlexAlign', 'end', 'gt-xs')],
      context,
      planOne,
    );

    expect(plans).toEqual(
      expect.arrayContaining([expect.objectContaining({ status: 'review', code: 'responsive-precedence-unverified' })]),
    );
  });

  test('preserves the complete family when one member is dynamic', () => {
    const plans = planner.plan(
      [literal('fxFlexAlign', 'start'), responsive('fxFlexAlign', 'end', 'sm', 'property')],
      context,
      planOne,
    );

    expect(plans).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'dynamic-binding' })]));
    expect(plans.every(plan => plan.status !== 'converted')).toBe(true);
  });

  test('groups fxFlex, fxGrow, and fxShrink as one flex-item family', () => {
    const plans = planner.plan(
      [
        responsive('fxFlex', 'start', 'sm'),
        responsive('fxGrow', 'end', 'gt-xs'),
        responsive('fxShrink', 'center', 'xs'),
      ],
      context,
      planOne,
    );

    expect(plans.every(plan => plan.status !== 'converted')).toBe(true);
    expect(plans).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'responsive-precedence-unverified' })]),
    );
  });

  test('groups fxFlexFill and fxFill as one flex-fill family', () => {
    const plans = planner.plan(
      [responsive('fxFlexFill', 'start', 'sm'), responsive('fxFill', 'end', 'gt-xs')],
      context,
      planOne,
    );

    expect(plans.every(plan => plan.status !== 'converted')).toBe(true);
    expect(plans).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'responsive-precedence-unverified' })]),
    );
  });

  test('retains dynamic-binding diagnostics when responsive context is also unresolved', () => {
    const plans = planner.plan(
      [responsive('fxLayout', 'row', 'sm', 'property'), responsive('fxLayoutGap', '4', 'sm', 'property')],
      context,
      planOne,
    );

    expect(plans).toEqual([
      expect.objectContaining({ status: 'review', code: 'dynamic-binding' }),
      expect.objectContaining({ status: 'review', code: 'dynamic-binding' }),
    ]);
  });

  test('keeps a dynamic family member diagnostic while closing the rest of its family', () => {
    const plans = planner.closeDependencies(
      [literal('fxShow', ''), responsive('fxHide', 'visible', 'sm', 'property')],
      context,
      planOne,
    );

    expect(plans).toEqual([
      expect.objectContaining({ status: 'review', code: 'context-unverified' }),
      expect.objectContaining({ status: 'review', code: 'dynamic-binding' }),
    ]);
  });

  test('closes fxShow and fxHide as one visibility family without replanning their semantics', () => {
    const show = literal('fxShow', '');
    const hide = responsive('fxHide', '', 'sm');
    const plans = planner.closeDependencies([show, hide], context, item =>
      item.id === show.id ? unresolved(item, 'class-conflict', 'conflict') : converted(item, 'hidden'),
    );

    expect(plans).toEqual([
      expect.objectContaining({ status: 'review', code: 'class-conflict' }),
      expect.objectContaining({ status: 'review', code: 'context-unverified' }),
    ]);
  });

  test('retains intrinsic visibility diagnostics when dynamic closure preserves the family', () => {
    const optional = responsive('fxShow', '', 'handset');
    const custom = responsive('fxHide', '', 'cinema');
    const dynamic = responsive('fxShow', 'visible', 'sm', 'property');
    const existing = new Map<string, FixturePlan>([
      [optional.id, unresolved(optional, 'breakpoint-unverified', 'optional breakpoint')],
      [custom.id, unresolved(custom, 'custom-breakpoint', 'custom breakpoint')],
      [dynamic.id, unresolved(dynamic, 'dynamic-binding', 'dynamic binding')],
    ]);

    const plans = planner.closeDependencies(
      [optional, custom, dynamic],
      context,
      item => existing.get(item.id) ?? planOne(item, context),
    );

    expect(plans).toEqual([
      expect.objectContaining({ status: 'review', code: 'breakpoint-unverified' }),
      expect.objectContaining({ status: 'review', code: 'custom-breakpoint' }),
      expect.objectContaining({ status: 'review', code: 'dynamic-binding' }),
    ]);
  });
});
