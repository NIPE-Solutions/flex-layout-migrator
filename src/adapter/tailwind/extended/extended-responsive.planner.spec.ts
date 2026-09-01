import type { DiagnosticCode } from '../../../analyzer/conversion-result';
import type { LocatedFlexLayoutInput } from '../../../analyzer/flex-layout-attribute.analyzer';
import { BreakpointCatalog } from '../../../breakpoint/breakpoint-catalog';
import type { TemplateAttribute } from '../../../template/template.model';
import { AngularTemplateParser } from '../../../template/angular-template.parser';
import type { PlannedConversion } from '../../conversion-adapter';
import type { ExtendedFamilyPlan, ExtendedResponsiveState, ResponsiveClassValue } from './responsive-class.model';
import { ExtendedFamilyPlanner } from './extended-family.planner';
import { ExtendedResponsivePlanner } from './extended-responsive.planner';
import { parseResponsiveStyleValue } from './responsive-style-value.parser';
import type { ResponsiveStyleValue } from './responsive-style.model';

function input(
  directive: 'ngClass' | 'ngStyle',
  alias: string,
  value: string,
  id = `fixture:${directive}.${alias}`,
): LocatedFlexLayoutInput {
  return {
    id,
    fileName: 'fixture.html',
    elementId: '0',
    sourceName: `${directive}.${alias}`,
    directive,
    value,
    binding: 'literal',
    breakpoint: alias,
    source: { start: 0, end: 1 },
    nameSource: { start: 0, end: 1 },
  };
}

function definition(alias: string) {
  const classification = new BreakpointCatalog().classify(alias);
  if (classification.kind !== 'verified') throw new Error(`Expected ${alias} to be verified.`);
  return classification.definition;
}

function classState(
  alias: string,
  tokens: readonly string[],
  id = `fixture:ngClass.${alias}`,
): ExtendedResponsiveState<ResponsiveClassValue> {
  return {
    input: input('ngClass', alias, tokens.join(' '), id),
    activation: { kind: 'media', definition: definition(alias) },
    value: { tokens },
  };
}

function styleState(
  alias: string,
  value: string,
  id = `fixture:ngStyle.${alias}`,
): ExtendedResponsiveState<ResponsiveStyleValue> {
  const member = input('ngStyle', alias, value, id);
  const parsed = parseResponsiveStyleValue(member);
  if (parsed.status !== 'parsed') throw new Error(`Expected the style fixture to parse: ${parsed.reason}`);
  return {
    input: member,
    activation: { kind: 'media', definition: definition(alias) },
    value: parsed.value,
  };
}

function classFamily(
  states: readonly ExtendedResponsiveState<ResponsiveClassValue>[],
): ExtendedFamilyPlan<ResponsiveClassValue> {
  return { status: 'converted', states };
}

function styleFamily(
  states: readonly ExtendedResponsiveState<ResponsiveStyleValue>[],
): ExtendedFamilyPlan<ResponsiveStyleValue> {
  return producedStyleFamily(states.map(state => state.input));
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

function producedStyleFamily(inputs: readonly LocatedFlexLayoutInput[]): ExtendedFamilyPlan<ResponsiveStyleValue> {
  return new ExtendedFamilyPlanner().plan({
    kind: 'style',
    inputs,
    valueParser: parseResponsiveStyleValue,
    equals: equalStyleValues,
  });
}

function attributes(source: string): readonly TemplateAttribute[] {
  const parsed = new AngularTemplateParser().parse(source, 'fixture.html');
  if (parsed.status !== 'parsed') throw new Error('Expected attribute fixture to parse.');
  return parsed.elements[0]?.attributes ?? [];
}

function classPlan(
  familyPlan: ExtendedFamilyPlan<ResponsiveClassValue>,
  overrides: {
    readonly existingClassNames?: readonly string[];
    readonly attributes?: readonly TemplateAttribute[];
  } = {},
) {
  return new ExtendedResponsivePlanner().plan({
    kind: 'class',
    familyPlan,
    existingClassNames: overrides.existingClassNames ?? [],
    attributes: overrides.attributes ?? [],
  });
}

function stylePlan(
  familyPlan: ExtendedFamilyPlan<ResponsiveStyleValue>,
  overrides: {
    readonly existingClassNames?: readonly string[];
    readonly attributes?: readonly TemplateAttribute[];
  } = {},
) {
  return new ExtendedResponsivePlanner().plan({
    kind: 'style',
    familyPlan,
    existingClassNames: overrides.existingClassNames ?? [],
    attributes: overrides.attributes ?? [],
  });
}

function convertedClasses(
  result: ReturnType<typeof classPlan> | ReturnType<typeof stylePlan>,
): readonly (readonly string[])[] {
  return result.plans.map(plan => (plan.status === 'converted' ? plan.classNames : []));
}

function expectUnresolvedWithCode(
  result: ReturnType<typeof classPlan> | ReturnType<typeof stylePlan>,
  code: DiagnosticCode,
): void {
  expect(result.status).toBe('unresolved');
  expect(result.plans.length).toBeGreaterThan(0);
  expect(result.plans.every(plan => plan.status !== 'converted' && plan.code === code)).toBe(true);
}

describe('ExtendedResponsivePlanner', () => {
  test('plans real ngStyle family output through the load-bearing producer seam', () => {
    const member = input('ngStyle', 'sm', 'font-size.px: 14; color: #334155');

    expect(stylePlan(producedStyleFamily([member]))).toEqual({
      status: 'converted',
      plans: [
        {
          status: 'converted',
          input: member,
          classNames: [
            '[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:[font-size:14px]',
            '[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:[color:#334155]',
          ],
        },
      ],
    });
  });

  test('keeps ordinary base application classes compatible with responsive class output', () => {
    const state = classState('sm', ['flex', 'items-center']);

    expect(
      classPlan(classFamily([state]), {
        existingClassNames: ['card', 'text-sm', 'dashboard-panel'],
        attributes: attributes('<div class="card text-sm dashboard-panel"></div>'),
      }),
    ).toEqual({
      status: 'converted',
      plans: [
        {
          status: 'converted',
          input: state.input,
          classNames: [
            '[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:flex',
            '[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:items-center',
          ],
        },
      ],
    });
  });

  test('reuses an identical existing generated token instead of emitting a byte-identical class edit input', () => {
    const token = '[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:flex';
    const result = classPlan(classFamily([classState('sm', ['flex'])]), {
      existingClassNames: [token],
      attributes: attributes(`<div class="${token}"></div>`),
    });

    expect(result.status).toBe('converted');
    expect(convertedClasses(result)).toEqual([[]]);
  });

  test('preserves a class family when an existing same-property class intersects its activation', () => {
    const existing = '[@media_screen_and_(min-width:_600px)]:grid';
    const result = classPlan(classFamily([classState('sm', ['flex'])]), {
      existingClassNames: [existing],
      attributes: attributes(`<div class="${existing}"></div>`),
    });

    expectUnresolvedWithCode(result, 'class-conflict');
  });

  test('allows a same-property class in a disjoint exact activation', () => {
    const existing = '[@media_screen_and_(min-width:_0px)_and_(max-width:_599.98px)]:grid';
    const result = classPlan(classFamily([classState('sm', ['flex'])]), {
      existingClassNames: [existing],
      attributes: attributes(`<div class="${existing}"></div>`),
    });

    expect(result.status).toBe('converted');
  });

  test.each([
    ['bound class', '<div [class]="classes"></div>'],
    ['bound ngClass', '<div [ngClass]="classes"></div>'],
    ['bound attr.class', '<div [attr.class]="classes"></div>'],
    ['per-class authority', '<div [class.selected]="selected"></div>'],
  ])('preserves generated output beside parser-produced %s evidence', (_case, source) => {
    const result = classPlan(classFamily([classState('sm', ['flex'])]), {
      attributes: attributes(source),
    });

    expectUnresolvedWithCode(result, 'bound-class');
  });

  test('allows a literal fallback style whose property ownership is disjoint', () => {
    const result = stylePlan(styleFamily([styleState('lt-md', 'font-size.px: 14')]), {
      attributes: attributes('<div style="color: red"></div>'),
    });

    expect(result.status).toBe('converted');
    expect(convertedClasses(result)).toEqual([['[@media_screen_and_(max-width:_959.98px)]:[font-size:14px]']]);
  });

  test.each([
    ['exact property', 'color: red', 'color: #334155'],
    ['shared shorthand group', 'margin-top: 1rem', 'margin: 2rem'],
    ['font shorthand', 'font: 16px sans-serif', 'font-size: 14px'],
    ['background shorthand', 'background: red', 'background-color: blue'],
    ['gap shorthand', 'gap: 1rem', 'row-gap: 2rem'],
    ['border shorthand', 'border: 1px solid red', 'border-left-color: blue'],
    ['inset shorthand', 'inset: 0', 'top: 1rem'],
    ['padding shorthand', 'padding: 1rem', 'padding-top: 2rem'],
  ])('preserves a literal fallback style with an overlapping %s', (_case, fallback, responsive) => {
    const result = stylePlan(styleFamily([styleState('sm', responsive)]), {
      attributes: attributes(`<div style="${fallback}"></div>`),
    });

    expectUnresolvedWithCode(result, 'class-conflict');
  });

  test.each([
    ['margin edges', 'margin-top: 1rem', 'margin-bottom: 2rem'],
    ['padding edges', 'padding-left: 1rem', 'padding-right: 2rem'],
    ['inset edges', 'top: 0', 'bottom: 1rem'],
    ['gap axes', 'row-gap: 1rem', 'column-gap: 2rem'],
    ['border edges', 'border-top-color: red', 'border-bottom-width: 2px'],
  ])('allows literal fallback style with disjoint %s ownership', (_case, fallback, responsive) => {
    const result = stylePlan(styleFamily([styleState('sm', responsive)]), {
      attributes: attributes(`<div style="${fallback}"></div>`),
    });

    expect(result.status).toBe('converted');
  });

  test('preserves a responsive style family when the literal fallback declaration list is ambiguous', () => {
    const result = stylePlan(styleFamily([styleState('sm', 'color: #334155')]), {
      attributes: attributes('<div style="color"></div>'),
    });

    expectUnresolvedWithCode(result, 'class-conflict');
  });

  test.each([
    ['bound style', '<div [style]="styles"></div>'],
    ['bound ngStyle', '<div [ngStyle]="styles"></div>'],
    ['bound attr.style', '<div [attr.style]="styles"></div>'],
    ['per-style authority', '<div [style.color]="color"></div>'],
  ])('preserves a responsive style family beside parser-produced %s evidence', (_case, source) => {
    const result = stylePlan(styleFamily([styleState('sm', 'font-size.px: 14')]), {
      attributes: attributes(source),
    });

    expectUnresolvedWithCode(result, 'class-conflict');
  });

  test('retains display property ownership when coupled to existing visibility evidence', () => {
    const result = stylePlan(styleFamily([styleState('sm', 'display: block')]), {
      existingClassNames: ['hidden'],
      attributes: attributes('<div class="hidden"></div>'),
    });

    expectUnresolvedWithCode(result, 'class-conflict');
  });

  test('does not let a bound class authority hide behind responsive style emission', () => {
    const result = stylePlan(styleFamily([styleState('sm', 'color: red')]), {
      attributes: attributes('<div [class.active]="active"></div>'),
    });

    expectUnresolvedWithCode(result, 'bound-class');
  });

  test('converts empty class and style families without requesting an empty class attribute', () => {
    const classResult = classPlan(classFamily([classState('sm', [])]), {
      attributes: attributes('<div [class.active]="active"></div>'),
    });
    const styleResult = stylePlan(styleFamily([styleState('sm', '')]));

    expect(classResult.status).toBe('converted');
    expect(styleResult.status).toBe('converted');
    expect(convertedClasses(classResult)).toEqual([[]]);
    expect(convertedClasses(styleResult)).toEqual([[]]);
  });

  test('emits aggregate deduplicated classes only on the first canonical family input', () => {
    const smLater = classState('sm', ['flex', 'items-center'], 'fixture:sm-z');
    const xs = classState('xs', ['grid'], 'fixture:xs');
    const smEarlier = classState('sm', ['flex', 'items-center'], 'fixture:sm-a');

    const result = classPlan(classFamily([smLater, smEarlier, xs]));

    expect(result.status).toBe('converted');
    expect(result.plans.map(plan => plan.input.id)).toEqual(['fixture:xs', 'fixture:sm-a', 'fixture:sm-z']);
    expect(convertedClasses(result)).toEqual([
      [
        '[@media_screen_and_(min-width:_0px)_and_(max-width:_599.98px)]:grid',
        '[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:flex',
        '[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:items-center',
      ],
      [],
      [],
    ]);
  });

  test('returns intrinsic unresolved plans without manufacturing generated classes', () => {
    const member = input('ngClass', 'sm', 'card');
    const intrinsic: PlannedConversion = {
      status: 'review',
      input: member,
      code: 'tailwind-candidate-unverified',
      reason: 'The candidate is not proven.',
      suggestion: 'Keep the family.',
    };

    expect(classPlan({ status: 'unresolved', plans: [intrinsic] })).toEqual({
      status: 'unresolved',
      plans: [intrinsic],
    });
  });

  test('keeps canonical converted output independent of state and attribute evidence order', () => {
    const xs = styleState('xs', 'font-size.px: 12');
    const sm = styleState('sm', 'font-size.px: 14');
    const forwardAttributes = attributes('<div id="card" style="color:red" title="Card"></div>');
    const reverseAttributes = [...forwardAttributes].reverse();

    const forward = stylePlan(styleFamily([xs, sm]), { attributes: forwardAttributes });
    const reverse = stylePlan(styleFamily([sm, xs]), { attributes: reverseAttributes });

    expect(reverse).toEqual(forward);
  });

  test('preserves a manually malformed class state instead of creating an ungrouped conflict blind spot', () => {
    const result = classPlan(classFamily([classState('sm', ['plugin-widget'])]));

    expectUnresolvedWithCode(result, 'tailwind-candidate-unverified');
  });
});
