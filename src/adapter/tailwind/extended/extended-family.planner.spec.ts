import type { LocatedFlexLayoutInput } from '../../../analyzer/flex-layout-attribute.analyzer';
import type { PlannedConversion } from '../../../render/conversion-renderer';
import { ExtendedFamilyPlanner } from '../../../semantic/extended/extended-family.planner';
import type {
  ResponsiveClassValue,
  ResponsiveClassValueResult,
} from '../../../semantic/extended/responsive-class.model';
import { TailwindSourcePropertyEvidence } from '../../../evidence/tailwind-source-property.evidence';
import { parseResponsiveClassValue } from '../../../semantic/extended/responsive-class-value.parser';
import { parseResponsiveStyleValue } from '../../../semantic/extended/responsive-style-value.parser';
import type { ResponsiveStyleValue } from '../../../semantic/extended/responsive-style.model';

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
    directive: directive as LocatedFlexLayoutInput['directive'],
    value,
    binding: sourceName.startsWith('[') ? 'property' : 'literal',
    breakpoint,
    source: { start: 0, end: 1 },
    nameSource: { start: 0, end: 1 },
    ...overrides,
  };
}

const evidence = new TailwindSourcePropertyEvidence();

function equalClassValues(left: ResponsiveClassValue, right: ResponsiveClassValue): boolean {
  return (
    left.tokens.length === right.tokens.length && left.tokens.every((token, index) => token === right.tokens[index])
  );
}

function plan(inputs: readonly LocatedFlexLayoutInput[]) {
  return new ExtendedFamilyPlanner().plan<ResponsiveClassValue>({
    kind: 'class',
    inputs,
    valueParser: (member): ResponsiveClassValueResult => {
      const result = parseResponsiveClassValue(member, evidence);
      return result.status === 'parsed'
        ? { status: 'parsed', value: { tokens: result.value.tokens.map(token => token.source) } }
        : result;
    },
    equals: equalClassValues,
  });
}

function equalStyleValues(left: ResponsiveStyleValue, right: ResponsiveStyleValue): boolean {
  return (
    left.declarations.length === right.declarations.length &&
    left.declarations.every(
      (declaration, index) =>
        declaration.property === right.declarations[index]?.property &&
        declaration.value === right.declarations[index]?.value,
    )
  );
}

function planStyle(inputs: readonly LocatedFlexLayoutInput[]) {
  return new ExtendedFamilyPlanner().plan<ResponsiveStyleValue>({
    kind: 'style',
    inputs,
    valueParser: member => parseResponsiveStyleValue(member, evidence),
    equals: equalStyleValues,
  });
}

function unresolvedPlans(result: ReturnType<typeof plan>): readonly PlannedConversion[] {
  if (result.status !== 'unresolved') throw new Error('Expected the extended family to be unresolved.');
  return result.plans;
}

describe('ExtendedFamilyPlanner', () => {
  test('produces canonical responsive style states from real ngStyle inputs', () => {
    const xs = input('ngStyle.xs', 'font-size.px: 12');
    const sm = input('ngStyle.sm', 'font-size.px: 14');

    expect(planStyle([sm, xs])).toMatchObject({
      status: 'converted',
      states: [
        { input: xs, value: { declarations: [{ property: 'font-size', value: '12px' }] } },
        { input: sm, value: { declarations: [{ property: 'font-size', value: '14px' }] } },
      ],
    });
  });

  test('reports distinct cross-state style aliases before responsive precedence analysis', () => {
    const plain = input('ngStyle.gt-xs', 'font-size: 20px');
    const suffixed = input('ngStyle.sm', 'font-size.px: 20');

    expect(planStyle([plain, suffixed])).toMatchObject({
      status: 'unresolved',
      plans: [
        { input: suffixed, code: 'style-value-unverified' },
        { input: plain, code: 'style-value-unverified' },
      ],
    });
  });

  test('retains style-value-unverified on an unsafe style member and closes its sibling context', () => {
    const safe = input('ngStyle.sm', 'color: red');
    const unsafe = input('ngStyle.md', 'background-image: url("card.png")');

    expect(planStyle([unsafe, safe])).toMatchObject({
      status: 'unresolved',
      plans: [
        { input: safe, code: 'context-unverified' },
        { input: unsafe, code: 'style-value-unverified' },
      ],
    });
  });

  test('preserves deprecated style aliases while closing a real ngStyle sibling', () => {
    const verified = input('ngStyle.sm', 'color: red');
    const deprecated = input('style.md', 'color: blue');

    expect(planStyle([deprecated, verified])).toMatchObject({
      status: 'unresolved',
      plans: [
        { input: verified, code: 'context-unverified' },
        { input: deprecated, code: 'semantic-unsupported' },
      ],
    });
  });

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
