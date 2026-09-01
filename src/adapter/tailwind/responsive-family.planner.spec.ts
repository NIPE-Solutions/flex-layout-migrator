import type { LocatedFlexLayoutInput } from '../../analyzer/flex-layout-attribute.analyzer';
import type { PlannedConversion } from '../conversion-adapter';
import { ResponsiveFamilyPlanner } from './responsive-family.planner';

const element = {
  id: '0',
  name: 'div',
  startTag: { start: 0, end: 5 },
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

function planOne(item: LocatedFlexLayoutInput): PlannedConversion {
  if (item.binding === 'property') {
    return {
      status: 'review',
      input: item,
      code: 'dynamic-binding',
      reason: 'dynamic',
      suggestion: 'make literal',
    };
  }
  return { status: 'converted', input: item, classNames: [`self-${item.value}`] };
}

function plan(inputs: readonly LocatedFlexLayoutInput[]) {
  return new ResponsiveFamilyPlanner().plan(inputs, { element, inputs }, planOne);
}

describe('ResponsiveFamilyPlanner', () => {
  test('converts a base member and a verified responsive override atomically', () => {
    const plans = plan([input('fxFlexAlign', 'start'), input('fxFlexAlign.sm', 'end')]);

    expect(plans).toEqual([
      expect.objectContaining({ status: 'converted', classNames: ['self-start'] }),
      expect.objectContaining({
        status: 'converted',
        classNames: ['[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:self-end'],
      }),
    ]);
  });

  test('converts different utilities in disjoint responsive ranges', () => {
    const plans = plan([input('fxFlexAlign.xs', 'start'), input('fxFlexAlign.sm', 'end')]);

    expect(plans.every(item => item.status === 'converted')).toBe(true);
  });

  test('converts identical utilities in overlapping responsive ranges', () => {
    const plans = plan([input('fxFlexAlign.sm', 'center'), input('fxFlexAlign.gt-xs', 'center')]);

    expect(plans.every(item => item.status === 'converted')).toBe(true);
  });

  test('preserves the complete family when overlapping ranges emit different utilities', () => {
    const plans = plan([input('fxFlexAlign.sm', 'start'), input('fxFlexAlign.gt-xs', 'end')]);

    expect(plans).toEqual(
      expect.arrayContaining([expect.objectContaining({ status: 'review', code: 'responsive-precedence-unverified' })]),
    );
    expect(plans.every(item => item.status !== 'converted')).toBe(true);
  });

  test('preserves the complete family when one member is dynamic', () => {
    const plans = plan([input('fxFlexAlign', 'start'), input('[fxFlexAlign.sm]', 'end')]);

    expect(plans).toEqual(
      expect.arrayContaining([expect.objectContaining({ status: 'review', code: 'dynamic-binding' })]),
    );
    expect(plans.every(item => item.status !== 'converted')).toBe(true);
  });

  test('groups fxFlex, fxGrow, and fxShrink as one flex-item family', () => {
    const plans = plan([
      input('fxFlex.sm', 'start', { directive: 'fxFlex' }),
      input('fxGrow.gt-xs', 'end', { directive: 'fxGrow' }),
      input('fxShrink.xs', 'center', { directive: 'fxShrink' }),
    ]);

    expect(plans.every(item => item.status !== 'converted')).toBe(true);
    expect(plans).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'responsive-precedence-unverified' })]),
    );
  });

  test('groups fxFlexFill and fxFill as one flex-fill family', () => {
    const plans = plan([
      input('fxFlexFill.sm', 'start', { directive: 'fxFlexFill' }),
      input('fxFill.gt-xs', 'end', { directive: 'fxFill' }),
    ]);

    expect(plans.every(item => item.status !== 'converted')).toBe(true);
    expect(plans).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'responsive-precedence-unverified' })]),
    );
  });

  test('retains dynamic-binding diagnostics when responsive context is also unresolved', () => {
    const plans = plan([
      input('[fxLayout.sm]', 'row', { directive: 'fxLayout' }),
      input('[fxLayoutGap.sm]', '4', { directive: 'fxLayoutGap' }),
    ]);

    expect(plans).toEqual([
      expect.objectContaining({ status: 'review', code: 'dynamic-binding' }),
      expect.objectContaining({ status: 'review', code: 'dynamic-binding' }),
    ]);
  });

  test('closes fxShow and fxHide as one visibility family without replanning their semantics', () => {
    const show = input('fxShow', '', { directive: 'fxShow' });
    const hide = input('fxHide.sm', '', { directive: 'fxHide' });
    const planner = new ResponsiveFamilyPlanner();
    const plans = planner.closeDependencies([show, hide], { element, inputs: [show, hide] }, item =>
      item.id === show.id
        ? {
            status: 'review',
            input: item,
            code: 'class-conflict',
            reason: 'conflict',
            suggestion: 'reconcile',
          }
        : { status: 'converted', input: item, classNames: ['hidden'] },
    );

    expect(plans).toEqual([
      expect.objectContaining({ status: 'review', code: 'class-conflict' }),
      expect.objectContaining({ status: 'review', code: 'context-unverified' }),
    ]);
  });

  test('retains intrinsic visibility diagnostics when dynamic closure preserves the family', () => {
    const optional = input('fxShow.handset', '', { directive: 'fxShow' });
    const custom = input('fxHide.cinema', '', { directive: 'fxHide' });
    const dynamic = input('[fxShow.sm]', 'visible', { directive: 'fxShow' });
    const existing = new Map<string, PlannedConversion>([
      [
        optional.id,
        {
          status: 'review',
          input: optional,
          code: 'breakpoint-unverified',
          reason: 'optional breakpoint',
          suggestion: 'keep the directive',
        },
      ],
      [
        custom.id,
        {
          status: 'review',
          input: custom,
          code: 'custom-breakpoint',
          reason: 'custom breakpoint',
          suggestion: 'provide its media query',
        },
      ],
      [
        dynamic.id,
        {
          status: 'review',
          input: dynamic,
          code: 'dynamic-binding',
          reason: 'dynamic binding',
          suggestion: 'make the input literal',
        },
      ],
    ]);
    const inputs = [optional, custom, dynamic];

    const plans = new ResponsiveFamilyPlanner().closeDependencies(
      inputs,
      { element, inputs },
      item => existing.get(item.id) ?? planOne(item),
    );

    expect(plans).toEqual([
      expect.objectContaining({ status: 'review', code: 'breakpoint-unverified' }),
      expect.objectContaining({ status: 'review', code: 'custom-breakpoint' }),
      expect.objectContaining({ status: 'review', code: 'dynamic-binding' }),
    ]);
  });
});
