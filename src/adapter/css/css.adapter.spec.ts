import type { LocatedFlexLayoutInput } from '../../analyzer/flex-layout-attribute.analyzer';
import type { TemplateElement } from '../../template/template.model';
import { AdapterFactory } from '../adapter.factory';
import type { ConversionAdapterSession } from '../conversion-adapter.session';
import type { CssDeclaration, CssSemanticFamily, OwnedCssRule } from './css-artifact.model';

const element: TemplateElement = {
  id: '0',
  name: 'div',
  source: { start: 0, end: 5 },
  startTag: { start: 0, end: 5 },
  structural: false,
  attributes: [],
};

const parent: TemplateElement = {
  id: 'parent',
  name: 'section',
  source: { start: 0, end: 9 },
  startTag: { start: 0, end: 9 },
  structural: false,
  attributes: [],
};

function input(overrides: Partial<LocatedFlexLayoutInput> = {}): LocatedFlexLayoutInput {
  return {
    id: 'fixture:0',
    fileName: 'fixture.html',
    elementId: '0',
    sourceName: 'fxLayout',
    directive: 'fxLayout',
    value: 'row',
    binding: 'literal',
    breakpoint: undefined,
    source: { start: 0, end: 14 },
    nameSource: { start: 0, end: 8 },
    ...overrides,
  };
}

function cssSession(): ConversionAdapterSession {
  return AdapterFactory.createSession('css', { orientationBreakpoints: false });
}

function finalizeCss(session: ConversionAdapterSession): readonly OwnedCssRule[] {
  const finalized = session.finalize();
  expect(finalized.target).toBe('css');
  if (finalized.target !== 'css') throw new Error('Expected a CSS adapter session');
  return finalized.rules;
}

interface FamilyCase {
  readonly label: string;
  readonly directive: LocatedFlexLayoutInput['directive'];
  readonly value: string;
  readonly family: CssSemanticFamily;
  readonly declarations: readonly CssDeclaration[];
}

const familyCases: readonly FamilyCase[] = [
  {
    label: 'layout',
    directive: 'fxLayout',
    value: 'row',
    family: 'layout',
    declarations: [
      { property: 'display', value: 'flex' },
      { property: 'box-sizing', value: 'border-box' },
      { property: 'flex-direction', value: 'row' },
    ],
  },
  {
    label: 'layout alignment',
    directive: 'fxLayoutAlign',
    value: 'center center',
    family: 'layout-align',
    declarations: [
      { property: 'justify-content', value: 'center' },
      { property: 'align-items', value: 'center' },
      { property: 'align-content', value: 'center' },
      { property: 'display', value: 'flex' },
      { property: 'box-sizing', value: 'border-box' },
      { property: 'flex-direction', value: 'row' },
    ],
  },
  {
    label: 'layout gap',
    directive: 'fxLayoutGap',
    value: '8',
    family: 'layout-gap',
    declarations: [{ property: 'gap', value: '8px' }],
  },
  {
    label: 'flex item',
    directive: 'fxFlex',
    value: '25',
    family: 'flex-item',
    declarations: [
      { property: 'flex', value: '1 1 100%' },
      { property: 'max-width', value: '25%' },
      { property: 'box-sizing', value: 'border-box' },
    ],
  },
  {
    label: 'flex alignment',
    directive: 'fxFlexAlign',
    value: 'end',
    family: 'flex-align',
    declarations: [{ property: 'align-self', value: 'flex-end' }],
  },
  {
    label: 'flex fill',
    directive: 'fxFlexFill',
    value: '',
    family: 'flex-fill',
    declarations: [
      { property: 'margin', value: '0' },
      { property: 'width', value: '100%' },
      { property: 'height', value: '100%' },
      { property: 'min-width', value: '100%' },
      { property: 'min-height', value: '100%' },
    ],
  },
  {
    label: 'flex offset',
    directive: 'fxFlexOffset',
    value: '4',
    family: 'flex-offset',
    declarations: [{ property: 'margin-inline-start', value: '4%' }],
  },
  {
    label: 'flex order',
    directive: 'fxFlexOrder',
    value: '2',
    family: 'flex-order',
    declarations: [{ property: 'order', value: '2' }],
  },
];

describe('CssAdapter', () => {
  test.each(familyCases)('registers one exact base $label rule and returns its class', testCase => {
    const session = cssSession();
    const member = input({
      directive: testCase.directive,
      sourceName: testCase.directive,
      value: testCase.value,
    });

    const plan = session.adapter.plan(member, { element });
    const rules = finalizeCss(session);

    expect(plan).toMatchObject({ status: 'converted', input: member });
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({
      family: testCase.family,
      declarations: testCase.declarations,
      context: { priority: 0 },
    });
    expect(plan.status === 'converted' ? plan.classNames : []).toEqual([rules[0]?.className]);
  });

  test.each(familyCases)('registers one exact responsive $label rule and returns its class', testCase => {
    const session = cssSession();
    const member = input({
      directive: testCase.directive,
      sourceName: `${testCase.directive}.sm`,
      value: testCase.value,
      breakpoint: 'sm',
    });

    const plan = session.adapter.plan(member, { element });
    const rules = finalizeCss(session);

    expect(plan).toMatchObject({ status: 'converted', input: member });
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({
      family: testCase.family,
      declarations: testCase.declarations,
      context: {
        priority: 900,
        media: { type: 'screen', clauses: [{ min: 600, max: 959.98 }] },
      },
    });
    expect(plan.status === 'converted' ? plan.classNames : []).toEqual([rules[0]?.className]);
  });

  test('composes fxGrow and fxShrink with the active fxFlex value into one shared rule', () => {
    const session = cssSession();
    const basis = input({ id: 'fixture:basis', directive: 'fxFlex', sourceName: 'fxFlex', value: '25' });
    const grow = input({ id: 'fixture:grow', directive: 'fxGrow', sourceName: 'fxGrow', value: '2' });
    const shrink = input({ id: 'fixture:shrink', directive: 'fxShrink', sourceName: 'fxShrink', value: '3' });
    const inputs = [basis, grow, shrink];

    const plans = session.adapter.planElement?.(inputs, { element, inputs });
    const rules = finalizeCss(session);

    expect(plans).toEqual([
      expect.objectContaining({ status: 'converted' }),
      expect.objectContaining({ status: 'converted' }),
      expect.objectContaining({ status: 'converted' }),
    ]);
    expect(rules).toHaveLength(1);
    expect(rules[0]?.declarations).toEqual([
      { property: 'flex', value: '2 3 100%' },
      { property: 'max-width', value: '25%' },
      { property: 'box-sizing', value: 'border-box' },
    ]);
    expect(plans?.map(plan => (plan.status === 'converted' ? plan.classNames : []))).toEqual([
      [rules[0]?.className],
      [rules[0]?.className],
      [rules[0]?.className],
    ]);
  });

  test('uses the active local and parent layout directions for dependent declarations', () => {
    const session = cssSession();
    const layout = input({ id: 'fixture:layout', directive: 'fxLayout', sourceName: 'fxLayout', value: 'column' });
    const alignment = input({
      id: 'fixture:alignment',
      directive: 'fxLayoutAlign',
      sourceName: 'fxLayoutAlign',
      value: 'start stretch',
    });
    const parentLayout = input({
      id: 'fixture:parent-layout',
      elementId: 'parent',
      directive: 'fxLayout',
      sourceName: 'fxLayout',
      value: 'column',
    });
    const item = input({ id: 'fixture:item', directive: 'fxFlex', sourceName: 'fxFlex', value: '10rem' });
    const offset = input({
      id: 'fixture:offset',
      directive: 'fxFlexOffset',
      sourceName: 'fxFlexOffset',
      value: '4',
    });
    const inputs = [layout, alignment, item, offset];

    const plans = session.adapter.planElement?.(inputs, {
      element,
      parent,
      inputs,
      parentInputs: [parentLayout],
    });
    const rules = finalizeCss(session);
    const classFor = (member: LocatedFlexLayoutInput): string | undefined => {
      const plan = plans?.find(candidate => candidate.input.id === member.id);
      return plan?.status === 'converted' ? plan.classNames[0] : undefined;
    };

    expect(rules.find(rule => rule.className === classFor(alignment))?.declarations).toContainEqual({
      property: 'max-width',
      value: '100%',
    });
    expect(rules.find(rule => rule.className === classFor(item))?.declarations).toContainEqual({
      property: 'max-height',
      value: '10rem',
    });
    expect(rules.find(rule => rule.className === classFor(offset))?.declarations).toEqual([
      { property: 'margin-block-start', value: '4%' },
    ]);
  });

  test('preserves a responsive family when overlapping aliases emit different declarations', () => {
    const session = cssSession();
    const broad = input({
      id: 'fixture:broad',
      directive: 'fxFlexAlign',
      sourceName: 'fxFlexAlign.lt-md',
      breakpoint: 'lt-md',
      value: 'start',
    });
    const narrow = input({
      id: 'fixture:narrow',
      directive: 'fxFlexAlign',
      sourceName: 'fxFlexAlign.sm',
      breakpoint: 'sm',
      value: 'end',
    });
    const inputs = [broad, narrow];

    expect(session.adapter.planElement?.(inputs, { element, inputs })).toEqual([
      expect.objectContaining({ status: 'review', code: 'responsive-precedence-unverified' }),
      expect.objectContaining({ status: 'review', code: 'responsive-precedence-unverified' }),
    ]);
    expect(finalizeCss(session)).toEqual([]);
  });

  test('blocks a dependent family before exposing an intrinsic diagnostic from an unresolved layout context', () => {
    const session = cssSession();
    const layout = input({
      id: 'fixture:layout',
      sourceName: '[fxLayout]',
      binding: 'property',
      value: 'direction',
    });
    const gap = input({
      id: 'fixture:gap',
      directive: 'fxLayoutGap',
      sourceName: 'fxLayoutGap',
      value: '4 grid',
    });
    const inputs = [layout, gap];

    expect(session.adapter.planElement?.(inputs, { element, inputs })).toEqual([
      expect.objectContaining({ status: 'review', code: 'dynamic-binding' }),
      expect.objectContaining({ status: 'review', code: 'context-unverified' }),
    ]);
    expect(finalizeCss(session)).toEqual([]);
  });

  test('closes a child dependency when its parent layout plan is unresolved', () => {
    const session = cssSession();
    const parentLayout = input({
      id: 'fixture:parent-layout',
      elementId: 'parent',
      directive: 'fxLayout',
      sourceName: 'fxLayout',
      value: 'column',
    });
    const offset = input({
      id: 'fixture:offset',
      directive: 'fxFlexOffset',
      sourceName: 'fxFlexOffset',
      value: '4',
    });
    const context = { element, parent, inputs: [offset], parentInputs: [parentLayout] };
    const initial = session.adapter.planElement?.([offset], context) ?? [];
    const blockedParent = {
      status: 'review' as const,
      input: parentLayout,
      code: 'dynamic-binding' as const,
      reason: 'Angular property bindings may depend on runtime state.',
      suggestion: 'Replace the binding manually or make it a literal before migration.',
    };

    const closed = session.adapter.closePlanDependencies?.(
      initial,
      context,
      new Map([[parentLayout.id, blockedParent]]),
    );

    expect(closed).toEqual([expect.objectContaining({ status: 'review', code: 'context-unverified' })]);
    finalizeCss(session);
  });

  test('preserves a layout whose same-element visibility dependency is unsupported', () => {
    const session = cssSession();
    const layout = input({ id: 'fixture:layout' });
    const visibility = input({
      id: 'fixture:visibility',
      directive: 'fxShow',
      sourceName: 'fxShow',
      value: '',
    });
    const inputs = [layout, visibility];

    expect(session.adapter.planElement?.(inputs, { element, inputs })).toEqual([
      expect.objectContaining({ status: 'review', code: 'context-unverified' }),
      expect.objectContaining({ status: 'unsupported', code: 'target-unsupported' }),
    ]);
    expect(finalizeCss(session)).toEqual([]);
  });

  test('converts a zero-equivalent order without allocating a class or rule', () => {
    const session = cssSession();
    const order = input({ directive: 'fxFlexOrder', sourceName: 'fxFlexOrder', value: '0' });

    expect(session.adapter.plan(order, { element })).toEqual({ status: 'converted', input: order, classNames: [] });
    expect(finalizeCss(session)).toEqual([]);
  });

  test('passes target-neutral semantic diagnostics through unchanged', () => {
    const session = cssSession();
    const gap = input({ directive: 'fxLayoutGap', sourceName: 'fxLayoutGap', value: '4 grid' });

    expect(session.adapter.plan(gap, { element })).toEqual({
      status: 'review',
      input: gap,
      code: 'semantic-unsupported',
      reason: 'The Flex-Layout grid gap mode changes child padding and compensating host margins.',
      suggestion: 'Replace the grid gap manually after reviewing the child padding behavior.',
    });
    expect(finalizeCss(session)).toEqual([]);
  });

  test('preserves bound supported values for dynamic-binding review', () => {
    const session = cssSession();
    const bound = input({ sourceName: '[fxLayout]', binding: 'property', value: 'direction' });

    expect(session.adapter.plan(bound, { element })).toEqual({
      status: 'review',
      input: bound,
      code: 'dynamic-binding',
      reason: 'Angular property bindings may depend on runtime state.',
      suggestion: 'Replace the binding manually or make it a literal before migration.',
    });
    expect(finalizeCss(session)).toEqual([]);
  });

  test.each([
    ['Grid', { directive: 'gdColumns', sourceName: 'gdColumns', value: '1fr' }],
    ['visibility', { directive: 'fxShow', sourceName: 'fxShow', value: '' }],
    ['responsive class', { directive: 'ngClass', sourceName: 'ngClass.sm', breakpoint: 'sm', value: 'flex' }],
    ['responsive style', { directive: 'ngStyle', sourceName: 'ngStyle.sm', breakpoint: 'sm', value: 'color:red' }],
    ['orientation', { sourceName: 'fxLayout.handset', breakpoint: 'handset', value: 'column' }],
    ['print', { sourceName: 'fxLayout.print', breakpoint: 'print', value: 'column' }],
    ['custom alias', { sourceName: 'fxLayout.desktop', breakpoint: 'desktop', value: 'column' }],
    ['renderer-free input', { directive: 'imgSrc', sourceName: 'src.sm', breakpoint: 'sm', value: 'small.png' }],
  ] as const)('returns target-unsupported for the out-of-scope %s family', (_label, overrides) => {
    const session = AdapterFactory.createSession('css', {
      orientationBreakpoints: true,
      printWithBreakpoints: ['md'],
    });
    const member = input(overrides);

    expect(session.adapter.plan(member, { element })).toMatchObject({
      status: 'unsupported',
      input: member,
      code: 'target-unsupported',
    });
    expect(finalizeCss(session)).toEqual([]);
  });

  test('shares one artifact identity across files for equivalent semantics', () => {
    const session = cssSession();
    const first = input({ id: 'first:0', fileName: 'first.html' });
    const second = input({ id: 'second:0', fileName: 'second.html' });

    const firstPlan = session.adapter.plan(first, { element });
    const secondPlan = session.adapter.plan(second, { element: { ...element, id: 'second' } });
    const rules = finalizeCss(session);

    expect(firstPlan.status === 'converted' ? firstPlan.classNames : []).toEqual([
      secondPlan.status === 'converted' ? secondPlan.classNames[0] : undefined,
    ]);
    expect(rules).toHaveLength(1);
    expect(firstPlan.status === 'converted' ? firstPlan.classNames : []).toEqual([rules[0]?.className]);
  });
});
