import type { LocatedFlexLayoutInput } from '../../../analyzer/flex-layout-attribute.analyzer';
import type { PlannedConversion } from '../../conversion-adapter';
import { ExtendedFamilyPlanner } from './extended-family.planner';
import type { ResponsiveClassValue, ResponsiveClassValueResult } from './responsive-class.model';
import { parseResponsiveClassValue } from './responsive-class-value.parser';
import { TailwindCandidateClassifier } from './tailwind-candidate-classifier';

function input(
  sourceName: string,
  value: string,
  overrides: Partial<LocatedFlexLayoutInput> = {},
): LocatedFlexLayoutInput {
  const normalizedName = sourceName.replace(/^\[/u, '').replace(/\]$/u, '');
  const separator = normalizedName.indexOf('.');
  const directive = separator < 0 ? normalizedName : normalizedName.slice(0, separator);
  const breakpoint = separator < 0 ? undefined : normalizedName.slice(separator + 1);
  return {
    id: `fixture:${sourceName}`,
    fileName: 'fixture.html',
    elementId: '0',
    sourceName,
    directive: directive as 'class' | 'ngClass',
    value,
    binding: sourceName.startsWith('[') ? 'property' : 'literal',
    breakpoint,
    source: { start: 0, end: 1 },
    nameSource: { start: 0, end: 1 },
    ...overrides,
  };
}

const classifier = new TailwindCandidateClassifier();

function equalClassValues(left: ResponsiveClassValue, right: ResponsiveClassValue): boolean {
  return (
    left.tokens.length === right.tokens.length && left.tokens.every((token, index) => token === right.tokens[index])
  );
}

function plan(inputs: readonly LocatedFlexLayoutInput[]) {
  return new ExtendedFamilyPlanner().plan<ResponsiveClassValue>({
    inputs,
    valueParser: (member): ResponsiveClassValueResult => parseResponsiveClassValue(member, classifier),
    equals: equalClassValues,
  });
}

function unresolvedPlans(result: ReturnType<typeof plan>): readonly PlannedConversion[] {
  if (result.status !== 'unresolved') throw new Error('Expected the extended family to be unresolved.');
  return result.plans;
}

describe('ExtendedFamilyPlanner', () => {
  test('converts different values in disjoint verified ranges', () => {
    const xs = input('ngClass.xs', 'flex');
    const sm = input('ngClass.sm', 'grid');

    expect(plan([sm, xs])).toMatchObject({
      status: 'converted',
      states: [
        { input: xs, activation: { definition: { alias: 'xs' } }, value: { tokens: ['flex'] } },
        { input: sm, activation: { definition: { alias: 'sm' } }, value: { tokens: ['grid'] } },
      ],
    });
  });

  test('converts exact normalized values in intersecting ranges', () => {
    expect(plan([input('ngClass.gt-xs', 'flex grid flex'), input('ngClass.sm', 'flex grid')])).toMatchObject({
      status: 'converted',
      states: [
        { activation: { definition: { alias: 'sm' } }, value: { tokens: ['flex', 'grid'] } },
        { activation: { definition: { alias: 'gt-xs' } }, value: { tokens: ['flex', 'grid'] } },
      ],
    });
  });

  test('preserves the complete family when intersecting ranges have different normalized values', () => {
    const plans = unresolvedPlans(plan([input('ngClass.gt-xs', 'grid'), input('ngClass.sm', 'flex')]));

    expect(plans).toHaveLength(2);
    expect(plans.every(item => item.status !== 'converted' && item.code === 'responsive-precedence-unverified')).toBe(
      true,
    );
  });

  test('converts identical duplicate activations in input identity order', () => {
    const later = input('ngClass.sm', 'flex', { id: 'fixture:z' });
    const earlier = input('ngClass.sm', 'flex', { id: 'fixture:a' });

    expect(plan([later, earlier])).toMatchObject({
      status: 'converted',
      states: [{ input: earlier }, { input: later }],
    });
  });

  test('preserves conflicting duplicate activations', () => {
    const plans = unresolvedPlans(
      plan([input('ngClass.sm', 'flex', { id: 'fixture:a' }), input('ngClass.sm', 'grid', { id: 'fixture:b' })]),
    );

    expect(plans.every(item => item.status !== 'converted' && item.code === 'responsive-precedence-unverified')).toBe(
      true,
    );
  });

  test('sorts successful states by descending breakpoint priority, alias, and input identity independent of source order', () => {
    const members = [
      input('ngClass.gt-lg', 'flex', { id: 'fixture:gt-lg' }),
      input('ngClass.sm', 'flex', { id: 'fixture:sm-z' }),
      input('ngClass.xs', 'flex', { id: 'fixture:xs' }),
      input('ngClass.sm', 'flex', { id: 'fixture:sm-a' }),
      input('ngClass.lt-sm', 'flex', { id: 'fixture:lt-sm' }),
    ];
    const expectedIds = ['fixture:xs', 'fixture:lt-sm', 'fixture:sm-a', 'fixture:sm-z', 'fixture:gt-lg'];

    const forward = plan(members);
    const reverse = plan([...members].reverse());

    expect(forward).toEqual(reverse);
    expect(forward).toMatchObject({
      status: 'converted',
      states: expectedIds.map(id => ({ input: { id } })),
    });
  });

  test('retains a dynamic diagnostic on a bound member and marks a literal sibling context-unverified', () => {
    const literal = input('ngClass.sm', 'flex');
    const dynamic = input('[ngClass.md]', 'classes');

    expect(plan([dynamic, literal])).toMatchObject({
      status: 'unresolved',
      plans: [
        { input: literal, code: 'context-unverified' },
        { input: dynamic, code: 'dynamic-binding' },
      ],
    });
  });

  test('retains optional, print, custom, and empty-suffix diagnostics on their originating members', () => {
    const verified = input('ngClass.sm', 'flex');
    const optional = input('ngClass.handset', 'flex');
    const print = input('ngClass.print', 'flex');
    const custom = input('ngClass.cinema', 'flex');
    const empty = input('ngClass.', 'flex');

    expect(plan([print, empty, verified, custom, optional])).toMatchObject({
      status: 'unresolved',
      plans: [
        { input: verified, code: 'context-unverified' },
        { input: empty, code: 'custom-breakpoint' },
        { input: custom, code: 'custom-breakpoint' },
        { input: optional, code: 'breakpoint-unverified' },
        { input: print, code: 'breakpoint-unverified' },
      ],
    });
  });

  test('preserves deprecated class aliases while marking otherwise-convertible siblings context-unverified', () => {
    const verified = input('ngClass.sm', 'flex');
    const deprecated = input('class.md', 'compact');

    expect(plan([deprecated, verified])).toMatchObject({
      status: 'unresolved',
      plans: [
        { input: verified, code: 'context-unverified' },
        { input: deprecated, code: 'semantic-unsupported' },
      ],
    });
  });

  test('keeps the first unverified literal token diagnostic on its input and marks a valid sibling context-unverified', () => {
    const verified = input('ngClass.sm', 'flex');
    const applicationClass = input('ngClass.md', 'grid dashboard-panel items-center');
    const plans = unresolvedPlans(plan([applicationClass, verified]));

    expect(plans).toMatchObject([
      { input: verified, code: 'context-unverified' },
      { input: applicationClass, code: 'tailwind-candidate-unverified' },
    ]);
    const diagnostic = plans[1];
    if (diagnostic?.status === 'converted') throw new Error('Expected an unverified candidate diagnostic.');
    expect(diagnostic?.reason).toContain('dashboard-panel');
    expect(diagnostic?.reason).toMatch(/application or plugin class/u);
  });

  test('retains interpolation as a dynamic diagnostic before class-token validation', () => {
    const literal = input('ngClass.sm', 'flex');
    const interpolated = input('ngClass.md', '{{ responsiveClasses }}');

    expect(plan([interpolated, literal])).toMatchObject({
      status: 'unresolved',
      plans: [
        { input: literal, code: 'context-unverified' },
        { input: interpolated, code: 'dynamic-binding' },
      ],
    });
  });
});
