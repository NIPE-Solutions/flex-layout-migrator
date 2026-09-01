import type { LocatedFlexLayoutInput } from '../../../analyzer/flex-layout-attribute.analyzer';
import { VisibilityStatePlanner } from './visibility-state.planner';

function input(
  sourceName: string,
  value: string,
  overrides: Partial<LocatedFlexLayoutInput> = {},
): LocatedFlexLayoutInput {
  const normalizedName = sourceName.replace(/^\[/, '').replace(/\]$/, '');
  const [directive = 'fxShow', breakpoint] = normalizedName.split('.', 2);
  return {
    id: `fixture:${sourceName}`,
    fileName: 'fixture.html',
    elementId: '0',
    sourceName,
    directive: directive as 'fxShow' | 'fxHide',
    value,
    binding: sourceName.startsWith('[') ? 'property' : 'literal',
    breakpoint,
    source: { start: 0, end: 1 },
    nameSource: { start: 0, end: 1 },
    ...overrides,
  };
}

function plan(inputs: readonly LocatedFlexLayoutInput[]) {
  return new VisibilityStatePlanner().plan(inputs);
}

describe('VisibilityStatePlanner', () => {
  test('converts a literal base member to a base visibility state', () => {
    const member = input('fxShow', 'false');

    expect(plan([member])).toEqual({
      status: 'converted',
      states: [{ input: member, intent: 'hidden', activation: { kind: 'base' } }],
    });
  });

  test('converts a verified responsive member with its exact breakpoint definition', () => {
    const member = input('fxHide.sm', 'false');

    expect(plan([member])).toEqual({
      status: 'converted',
      states: [
        {
          input: member,
          intent: 'shown',
          activation: {
            kind: 'media',
            definition: { alias: 'sm', range: { min: 600, max: 959.98 }, priority: 900 },
          },
        },
      ],
    });
  });

  test('converts a base state plus a different responsive override', () => {
    const responsive = input('fxShow.md', 'false');
    const base = input('fxShow', '');

    expect(plan([responsive, base])).toEqual({
      status: 'converted',
      states: [
        { input: base, intent: 'shown', activation: { kind: 'base' } },
        {
          input: responsive,
          intent: 'hidden',
          activation: {
            kind: 'media',
            definition: { alias: 'md', range: { min: 960, max: 1279.98 }, priority: 800 },
          },
        },
      ],
    });
  });

  test('converts different intents in disjoint responsive ranges', () => {
    const states = plan([input('fxShow.sm', ''), input('fxShow.xs', 'false')]);

    expect(states).toMatchObject({
      status: 'converted',
      states: [
        { intent: 'hidden', activation: { definition: { alias: 'xs' } } },
        { intent: 'shown', activation: { definition: { alias: 'sm' } } },
      ],
    });
  });

  test('converts identical intents in intersecting responsive ranges', () => {
    const result = plan([input('fxShow.gt-xs', ''), input('fxHide.sm', 'false')]);

    expect(result).toMatchObject({
      status: 'converted',
      states: [{ intent: 'shown' }, { intent: 'shown' }],
    });
  });

  test('preserves every input when intersecting responsive ranges conflict', () => {
    const members = [input('fxShow', ''), input('fxShow.sm', ''), input('fxHide.gt-xs', '')];

    const result = plan(members);

    expect(result).toMatchObject({ status: 'unresolved' });
    if (result.status !== 'unresolved') throw new Error('Expected the visibility family to be unresolved.');
    expect(result.plans).toHaveLength(members.length);
    expect(result.plans.every(item => item.status === 'review')).toBe(true);
    expect(
      result.plans.every(item => item.status !== 'converted' && item.code === 'responsive-precedence-unverified'),
    ).toBe(true);
    expect(result.plans.map(item => item.input.id)).toEqual([
      'fixture:fxShow',
      'fixture:fxShow.sm',
      'fixture:fxHide.gt-xs',
    ]);
  });

  test('converts identical duplicate base states and orders them by input identity', () => {
    const laterIdentity = input('fxShow', '', { id: 'fixture:z' });
    const earlierIdentity = input('fxHide', 'false', { id: 'fixture:a' });

    expect(plan([laterIdentity, earlierIdentity])).toEqual({
      status: 'converted',
      states: [
        { input: earlierIdentity, intent: 'shown', activation: { kind: 'base' } },
        { input: laterIdentity, intent: 'shown', activation: { kind: 'base' } },
      ],
    });
  });

  test('preserves every input when duplicate base states conflict', () => {
    const result = plan([input('fxHide', ''), input('fxShow', '')]);

    expect(result).toMatchObject({ status: 'unresolved' });
    if (result.status !== 'unresolved') throw new Error('Expected the visibility family to be unresolved.');
    expect(result.plans).toHaveLength(2);
    expect(
      result.plans.every(item => item.status !== 'converted' && item.code === 'responsive-precedence-unverified'),
    ).toBe(true);
  });

  test('normalizes mixed fxShow and fxHide declarations before comparing their intent', () => {
    const show = input('fxShow.lt-md', 'false');
    const hide = input('fxHide.xs', '');

    expect(plan([hide, show])).toMatchObject({
      status: 'converted',
      states: [
        { input: hide, intent: 'hidden' },
        { input: show, intent: 'hidden' },
      ],
    });
  });

  test('retains a dynamic diagnostic and marks otherwise-convertible family members context-unverified', () => {
    const literal = input('fxShow', '');
    const dynamic = input('[fxHide.sm]', 'isHidden');

    expect(plan([literal, dynamic])).toMatchObject({
      status: 'unresolved',
      plans: [
        { input: literal, status: 'review', code: 'context-unverified' },
        { input: dynamic, status: 'review', code: 'dynamic-binding' },
      ],
    });
  });

  test('retains optional, print, and custom breakpoint diagnostics on their originating members', () => {
    const literal = input('fxShow', '');
    const optional = input('fxShow.handset', '');
    const print = input('fxHide.print', '');
    const custom = input('fxShow.cinema', '');

    expect(plan([custom, print, optional, literal])).toMatchObject({
      status: 'unresolved',
      plans: [
        { input: literal, code: 'context-unverified' },
        { input: custom, code: 'custom-breakpoint' },
        { input: optional, code: 'breakpoint-unverified' },
        { input: print, code: 'breakpoint-unverified' },
      ],
    });
  });

  test('classifies a dynamic member before its unsupported breakpoint', () => {
    const dynamic = input('[fxShow.cinema]', 'visible');
    const literal = input('fxHide.sm', '');

    expect(plan([dynamic, literal])).toMatchObject({
      status: 'unresolved',
      plans: [
        { input: literal, code: 'context-unverified' },
        { input: dynamic, code: 'dynamic-binding' },
      ],
    });
  });

  test('sorts base first, then descending breakpoint priority, alias, and input identity independent of source order', () => {
    const members = [
      input('fxShow.gt-lg', '', { id: 'fixture:gt-lg' }),
      input('fxShow.sm', '', { id: 'fixture:sm-z' }),
      input('fxHide', 'false', { id: 'fixture:base' }),
      input('fxShow.xs', '', { id: 'fixture:xs' }),
      input('fxShow.sm', '', { id: 'fixture:sm-a' }),
      input('fxShow.lt-sm', '', { id: 'fixture:lt-sm' }),
    ];

    const expectedIds = [
      'fixture:base',
      'fixture:xs',
      'fixture:lt-sm',
      'fixture:sm-a',
      'fixture:sm-z',
      'fixture:gt-lg',
    ];
    const forward = plan(members);
    const reverse = plan([...members].reverse());

    expect(forward).toEqual(reverse);
    expect(forward).toMatchObject({
      status: 'converted',
      states: expectedIds.map(id => ({ input: { id } })),
    });
  });
});
