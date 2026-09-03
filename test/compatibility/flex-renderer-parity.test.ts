import { CssArtifactRegistry } from '../../src/adapter/css/css-artifact.registry';
import { CssAdapter } from '../../src/adapter/css/css.adapter';
import type { CssDeclaration, CssRuleContext } from '../../src/adapter/css/css-artifact.model';
import { cssRuleContext } from '../../src/adapter/css/css-breakpoint.context';
import { renderFlexAlignCss } from '../../src/adapter/css/flex/flex-align.css-renderer';
import { renderFlexFillCss } from '../../src/adapter/css/flex/flex-fill.css-renderer';
import { renderFlexItemCss } from '../../src/adapter/css/flex/flex-item.css-renderer';
import { renderFlexOffsetCss } from '../../src/adapter/css/flex/flex-offset.css-renderer';
import { renderFlexOrderCss } from '../../src/adapter/css/flex/flex-order.css-renderer';
import { renderLayoutAlignmentCss } from '../../src/adapter/css/flex/layout-align.css-renderer';
import { renderLayoutGapCss } from '../../src/adapter/css/flex/layout-gap.css-renderer';
import { renderLayoutCss } from '../../src/adapter/css/flex/layout.css-renderer';
import { renderFlexAlign } from '../../src/adapter/tailwind/directives/flex-align.strategy';
import { renderFlexFill } from '../../src/adapter/tailwind/directives/flex-fill.strategy';
import { renderFlexItem } from '../../src/adapter/tailwind/directives/flex-item.strategy';
import { renderFlexOffset } from '../../src/adapter/tailwind/directives/flex-offset.strategy';
import { renderFlexOrder } from '../../src/adapter/tailwind/directives/flex-order.strategy';
import { renderLayoutAlignment } from '../../src/adapter/tailwind/directives/layout-align.strategy';
import { renderLayoutGap } from '../../src/adapter/tailwind/directives/layout-gap.strategy';
import { renderLayout } from '../../src/adapter/tailwind/directives/layout.strategy';
import { BreakpointCatalog, type BreakpointDefinition } from '../../src/breakpoint/breakpoint-catalog';
import { planFlexAlignSemantics } from '../../src/flex/flex-align.semantic';
import { planFlexFillSemantics } from '../../src/flex/flex-fill.semantic';
import { planFlexItemSemantics } from '../../src/flex/flex-item.semantic';
import { planFlexOffsetSemantics } from '../../src/flex/flex-offset.semantic';
import { planFlexOrderSemantics } from '../../src/flex/flex-order.semantic';
import { planLayoutAlignment } from '../../src/flex/layout-align.semantic';
import { planLayoutGapSemantics } from '../../src/flex/layout-gap.semantic';
import { parseLayout } from '../../src/flex/layout.semantic';
import type { LocatedFlexLayoutInput } from '../../src/analyzer/flex-layout-attribute.analyzer';
import type { TemplateElement } from '../../src/template/template.model';
import { TailwindAdapter } from '../../src/adapter/tailwind/tailwind.adapter';

describe('cross-target Flex renderer parity', () => {
  test.each([
    [
      'row-reverse wrap',
      ['flex', 'flex-row-reverse', 'flex-wrap', 'box-border'],
      [
        { property: 'display', value: 'flex' },
        { property: 'box-sizing', value: 'border-box' },
        { property: 'flex-direction', value: 'row-reverse' },
        { property: 'flex-wrap', value: 'wrap' },
      ],
    ],
    [
      'column-reverse nowrap inline',
      ['inline-flex', 'flex-col-reverse', 'flex-nowrap', 'box-border'],
      [
        { property: 'display', value: 'inline-flex' },
        { property: 'box-sizing', value: 'border-box' },
        { property: 'flex-direction', value: 'column-reverse' },
        { property: 'flex-wrap', value: 'nowrap' },
      ],
    ],
  ] as const)('renders one planned %j layout through both targets', (source, tailwind, css) => {
    const planned = parseLayout(source);
    expect(planned.ok).toBe(true);
    if (!planned.ok) throw new Error('Expected planned layout semantics');

    const semantics = planned.value;
    expect(renderLayout(semantics)).toEqual(tailwind);
    expect(renderLayoutCss(semantics)).toEqual(css);
  });

  test.each([
    [
      'start start',
      'row',
      ['justify-start', 'items-start', 'content-start', 'flex', 'flex-row', 'box-border'],
      [
        { property: 'justify-content', value: 'flex-start' },
        { property: 'align-items', value: 'flex-start' },
        { property: 'align-content', value: 'flex-start' },
        { property: 'display', value: 'flex' },
        { property: 'box-sizing', value: 'border-box' },
        { property: 'flex-direction', value: 'row' },
      ],
    ],
    [
      'center center',
      'row-reverse',
      ['justify-center', 'items-center', 'content-center', 'flex', 'flex-row-reverse', 'box-border'],
      [
        { property: 'justify-content', value: 'center' },
        { property: 'align-items', value: 'center' },
        { property: 'align-content', value: 'center' },
        { property: 'display', value: 'flex' },
        { property: 'box-sizing', value: 'border-box' },
        { property: 'flex-direction', value: 'row-reverse' },
      ],
    ],
    [
      'end end',
      'column',
      ['justify-end', 'items-end', 'content-end', 'flex', 'flex-col', 'box-border'],
      [
        { property: 'justify-content', value: 'flex-end' },
        { property: 'align-items', value: 'flex-end' },
        { property: 'align-content', value: 'flex-end' },
        { property: 'display', value: 'flex' },
        { property: 'box-sizing', value: 'border-box' },
        { property: 'flex-direction', value: 'column' },
      ],
    ],
    [
      'space-around space-around',
      'column-reverse',
      ['justify-around', 'items-stretch', 'content-around', 'flex', 'flex-col-reverse', 'box-border'],
      [
        { property: 'justify-content', value: 'space-around' },
        { property: 'align-items', value: 'stretch' },
        { property: 'align-content', value: 'space-around' },
        { property: 'display', value: 'flex' },
        { property: 'box-sizing', value: 'border-box' },
        { property: 'flex-direction', value: 'column-reverse' },
      ],
    ],
    [
      'space-between space-between',
      'row',
      ['justify-between', 'items-stretch', 'content-between', 'flex', 'flex-row', 'box-border'],
      [
        { property: 'justify-content', value: 'space-between' },
        { property: 'align-items', value: 'stretch' },
        { property: 'align-content', value: 'space-between' },
        { property: 'display', value: 'flex' },
        { property: 'box-sizing', value: 'border-box' },
        { property: 'flex-direction', value: 'row' },
      ],
    ],
    [
      'space-evenly baseline',
      'column',
      ['justify-evenly', 'items-baseline', 'content-stretch', 'flex', 'flex-col', 'box-border'],
      [
        { property: 'justify-content', value: 'space-evenly' },
        { property: 'align-items', value: 'baseline' },
        { property: 'align-content', value: 'stretch' },
        { property: 'display', value: 'flex' },
        { property: 'box-sizing', value: 'border-box' },
        { property: 'flex-direction', value: 'column' },
      ],
    ],
    [
      'start stretch',
      'row',
      ['justify-start', 'items-stretch', 'content-stretch', 'flex', 'flex-row', 'box-border', 'max-h-full'],
      [
        { property: 'justify-content', value: 'flex-start' },
        { property: 'align-items', value: 'stretch' },
        { property: 'align-content', value: 'stretch' },
        { property: 'display', value: 'flex' },
        { property: 'box-sizing', value: 'border-box' },
        { property: 'flex-direction', value: 'row' },
        { property: 'max-height', value: '100%' },
      ],
    ],
  ] as const)('renders one planned %j alignment in %j through both targets', (source, layout, tailwind, css) => {
    const planned = planLayoutAlignment(source, layout);
    expect(planned.status).toBe('planned');
    if (planned.status !== 'planned') throw new Error('Expected planned layout alignment semantics');

    const semantics = planned.value;
    expect(renderLayoutAlignment(semantics)).toEqual({ classNames: tailwind });
    expect(renderLayoutAlignmentCss(semantics)).toEqual(css);
  });

  test('renders one planned gap through both targets and preserves wrapping diagnostics at the planner', () => {
    const planned = planLayoutGapSemantics('1.5rem', 'row');
    expect(planned.status).toBe('planned');
    if (planned.status !== 'planned') throw new Error('Expected planned layout gap semantics');

    const semantics = planned.value;
    expect(renderLayoutGap(semantics)).toEqual({ status: 'converted', classNames: ['gap-[1.5rem]'] });
    expect(renderLayoutGapCss(semantics)).toEqual([{ property: 'gap', value: '1.5rem' }]);
    expect(planLayoutGapSemantics('4', 'row wrap')).toEqual({
      status: 'review',
      code: 'semantic-unsupported',
      reason: 'Flex-Layout margins and CSS gap differ when flex items wrap across lines.',
      suggestion: 'Verify the wrapped layout and migrate its spacing manually.',
    });
  });

  test.each([
    [
      { basis: '3 2 calc(100% - 2rem)', layout: 'row-reverse' },
      [
        '[flex-grow:3]',
        '[flex-shrink:2]',
        '[flex-basis:calc(100%_-_2rem)]',
        '[min-width:calc(100%_-_2rem)]',
        'box-border',
      ],
      [
        { property: 'flex-grow', value: '3' },
        { property: 'flex-shrink', value: '2' },
        { property: 'flex-basis', value: 'calc(100% - 2rem)' },
        { property: 'min-width', value: 'calc(100% - 2rem)' },
        { property: 'box-sizing', value: 'border-box' },
      ],
    ],
    [
      { basis: '10rem', layout: 'column-reverse' },
      ['[flex:1_1_10rem]', '[min-height:10rem]', '[max-height:10rem]', 'box-border'],
      [
        { property: 'flex', value: '1 1 10rem' },
        { property: 'min-height', value: '10rem' },
        { property: 'max-height', value: '10rem' },
        { property: 'box-sizing', value: 'border-box' },
      ],
    ],
  ] as const)('renders one planned flex item with parent context %o through both targets', (input, tailwind, css) => {
    const planned = planFlexItemSemantics(input);
    expect(planned.status).toBe('planned');
    if (planned.status !== 'planned') throw new Error('Expected planned flex item semantics');

    const semantics = planned.value;
    expect(semantics.boxSizing).toBe('border-box');
    expect(renderFlexItem(semantics)).toEqual(tailwind);
    expect(renderFlexItemCss(semantics)).toEqual(css);
  });

  test.each([
    ['', ['self-stretch'], [{ property: 'align-self', value: 'stretch' }]],
    ['auto', ['self-auto'], [{ property: 'align-self', value: 'auto' }]],
    ['start', ['self-start'], [{ property: 'align-self', value: 'flex-start' }]],
    ['end', ['self-end'], [{ property: 'align-self', value: 'flex-end' }]],
    ['center', ['self-center'], [{ property: 'align-self', value: 'center' }]],
    ['baseline', ['self-baseline'], [{ property: 'align-self', value: 'baseline' }]],
  ] as const)('renders one planned %j self alignment through both targets', (source, tailwind, css) => {
    const planned = planFlexAlignSemantics(source);
    expect(planned.status).toBe('planned');
    if (planned.status !== 'planned') throw new Error('Expected planned flex alignment semantics');

    const semantics = planned.value;
    expect(renderFlexAlign(semantics)).toEqual({ status: 'converted', classNames: tailwind });
    expect(renderFlexAlignCss(semantics)).toEqual(css);
  });

  test('renders the one planned fill value through both targets', () => {
    const planned = planFlexFillSemantics();
    expect(planned.status).toBe('planned');
    if (planned.status !== 'planned') throw new Error('Expected planned flex fill semantics');

    const semantics = planned.value;
    expect(renderFlexFill(semantics)).toEqual({
      status: 'converted',
      classNames: ['m-0', 'w-full', 'h-full', 'min-w-full', 'min-h-full'],
    });
    expect(renderFlexFillCss(semantics)).toEqual([
      { property: 'margin', value: '0' },
      { property: 'width', value: '100%' },
      { property: 'height', value: '100%' },
      { property: 'min-width', value: '100%' },
      { property: 'min-height', value: '100%' },
    ]);
  });

  test.each([
    ['4', 'row-reverse', ['ms-[4%]'], [{ property: 'margin-inline-start', value: '4%' }]],
    ['2rem', 'column-reverse', ['mt-[2rem]'], [{ property: 'margin-block-start', value: '2rem' }]],
  ] as const)('renders one planned %j offset in %j through both targets', (source, layout, tailwind, css) => {
    const planned = planFlexOffsetSemantics(source, layout);
    expect(planned.status).toBe('planned');
    if (planned.status !== 'planned') throw new Error('Expected planned flex offset semantics');

    const semantics = planned.value;
    expect(renderFlexOffset(semantics)).toEqual({ status: 'converted', classNames: tailwind });
    expect(renderFlexOffsetCss(semantics)).toEqual(css);
  });

  test.each([
    ['2', ['[order:2]'], [{ property: 'order', value: '2' }]],
    ['-3', ['[order:-3]'], [{ property: 'order', value: '-3' }]],
    ['0', [], []],
  ] as const)('renders one planned %j order through both targets', (source, tailwind, css) => {
    const planned = planFlexOrderSemantics(source);
    expect(planned.status).toBe('planned');
    if (planned.status !== 'planned') throw new Error('Expected planned flex order semantics');

    const semantics = planned.value;
    expect(renderFlexOrder(semantics)).toEqual({ status: 'converted', classNames: tailwind });
    expect(renderFlexOrderCss(semantics)).toEqual(css);
  });
});

describe('cross-target Flex adapter parity', () => {
  const element: TemplateElement = {
    id: '0',
    name: 'div',
    source: { start: 0, end: 5 },
    startTag: { start: 0, end: 5 },
    structural: false,
    attributes: [],
  };
  const gap: LocatedFlexLayoutInput = {
    id: 'fixture:gap',
    fileName: 'fixture.html',
    elementId: '0',
    sourceName: 'fxLayoutGap',
    directive: 'fxLayoutGap',
    value: '4 grid',
    binding: 'literal',
    breakpoint: undefined,
    source: { start: 0, end: 20 },
    nameSource: { start: 0, end: 11 },
  };

  test('passes the shared semantic diagnostic through both adapter boundaries', () => {
    const cssRegistry = new CssArtifactRegistry();
    const tailwind = new TailwindAdapter().plan(gap, { element });
    const css = new CssAdapter(cssRegistry).plan(gap, { element });

    expect(css).toEqual(tailwind);
    expect(cssRegistry.rules()).toEqual([]);
  });

  test('makes the same responsive precedence decision for overlapping Flex families', () => {
    const broad: LocatedFlexLayoutInput = {
      ...gap,
      id: 'fixture:broad',
      sourceName: 'fxFlexAlign.lt-md',
      directive: 'fxFlexAlign',
      value: 'start',
      breakpoint: 'lt-md',
    };
    const narrow: LocatedFlexLayoutInput = {
      ...gap,
      id: 'fixture:narrow',
      sourceName: 'fxFlexAlign.sm',
      directive: 'fxFlexAlign',
      value: 'end',
      breakpoint: 'sm',
    };
    const inputs = [broad, narrow];
    const tailwind = new TailwindAdapter().planElement(inputs, { element, inputs });
    const css = new CssAdapter(new CssArtifactRegistry()).planElement(inputs, { element, inputs });
    const decisions = (plans: typeof tailwind) =>
      plans.map(plan => ({ status: plan.status, code: plan.status === 'converted' ? undefined : plan.code }));

    expect(decisions(css)).toEqual(decisions(tailwind));
    expect(decisions(css)).toEqual([
      { status: 'review', code: 'responsive-precedence-unverified' },
      { status: 'review', code: 'responsive-precedence-unverified' },
    ]);
  });
});

const breakpointRows = [
  ['base', undefined, { priority: 0 }],
  ['xs', 'xs', { priority: 1000, media: { type: 'screen', clauses: [{ min: 0, max: 599.98 }] } }],
  ['sm', 'sm', { priority: 900, media: { type: 'screen', clauses: [{ min: 600, max: 959.98 }] } }],
  ['md', 'md', { priority: 800, media: { type: 'screen', clauses: [{ min: 960, max: 1279.98 }] } }],
  ['lg', 'lg', { priority: 700, media: { type: 'screen', clauses: [{ min: 1280, max: 1919.98 }] } }],
  ['xl', 'xl', { priority: 600, media: { type: 'screen', clauses: [{ min: 1920, max: 4999.98 }] } }],
  ['lt-sm', 'lt-sm', { priority: 950, media: { type: 'screen', clauses: [{ max: 599.98 }] } }],
  ['lt-md', 'lt-md', { priority: 850, media: { type: 'screen', clauses: [{ max: 959.98 }] } }],
  ['lt-lg', 'lt-lg', { priority: 750, media: { type: 'screen', clauses: [{ max: 1279.98 }] } }],
  ['lt-xl', 'lt-xl', { priority: 650, media: { type: 'screen', clauses: [{ max: 1919.98 }] } }],
  ['gt-xs', 'gt-xs', { priority: -950, media: { type: 'screen', clauses: [{ min: 600 }] } }],
  ['gt-sm', 'gt-sm', { priority: -850, media: { type: 'screen', clauses: [{ min: 960 }] } }],
  ['gt-md', 'gt-md', { priority: -750, media: { type: 'screen', clauses: [{ min: 1280 }] } }],
  ['gt-lg', 'gt-lg', { priority: -650, media: { type: 'screen', clauses: [{ min: 1920 }] } }],
] as const satisfies readonly (readonly [string, string | undefined, CssRuleContext])[];

function verifiedDefinition(alias: string): BreakpointDefinition {
  const classification = new BreakpointCatalog().classify(alias);
  if (classification.kind !== 'verified') throw new Error(`Expected ${alias} to be a standard verified breakpoint`);
  return classification.definition;
}

function breakpointDefinition(alias: string | undefined): BreakpointDefinition | undefined {
  return alias === undefined ? undefined : verifiedDefinition(alias);
}

function plannedGapDeclarations(): readonly CssDeclaration[] {
  const planned = planLayoutGapSemantics('8px', 'row');
  if (planned.status !== 'planned') throw new Error('Expected planned layout gap semantics');
  return renderLayoutGapCss(planned.value);
}

type BreakpointRow = (typeof breakpointRows)[number];

function registerBreakpointRows(rows: readonly BreakpointRow[]) {
  const registry = new CssArtifactRegistry();
  const declarations = plannedGapDeclarations();
  const rulesByAlias = new Map<string, ReturnType<CssArtifactRegistry['register']>>();

  for (const [label, alias] of rows) {
    rulesByAlias.set(label, registry.register('layout-gap', declarations, cssRuleContext(breakpointDefinition(alias))));
  }

  return { registry, rulesByAlias };
}

describe('catalog-derived cross-target CSS artifact contexts', () => {
  test.each(breakpointRows)('registers stable identity and exact catalog media for %s', (_label, alias, expected) => {
    const registry = new CssArtifactRegistry();
    const declarations = plannedGapDeclarations();
    const context = cssRuleContext(breakpointDefinition(alias));
    const first = registry.register('layout-gap', declarations, context);
    const duplicate = registry.register('layout-gap', declarations, cssRuleContext(breakpointDefinition(alias)));

    expect(first.context).toEqual(expected);
    expect(duplicate).toBe(first);
    expect(first.className).toMatch(/^flm-[a-f0-9]{64}$/u);
    expect(registry.rules()).toEqual([first]);
  });

  test('deduplicates every context and orders rules independently of source order', () => {
    const forward = registerBreakpointRows(breakpointRows);
    const reverse = registerBreakpointRows([...breakpointRows].reverse());
    const expectedAliasOrder = [
      'base',
      'xs',
      'lt-sm',
      'sm',
      'lt-md',
      'md',
      'lt-lg',
      'lg',
      'lt-xl',
      'xl',
      'gt-lg',
      'gt-md',
      'gt-sm',
      'gt-xs',
    ];
    const orderedAliases = (
      rulesByAlias: ReadonlyMap<string, ReturnType<CssArtifactRegistry['register']>>,
      rules: ReturnType<CssArtifactRegistry['rules']>,
    ) => rules.map(rule => [...rulesByAlias].find(([, registered]) => registered.id === rule.id)?.[0]);

    expect(forward.registry.rules()).toHaveLength(14);
    expect(reverse.registry.rules()).toHaveLength(14);
    expect(orderedAliases(forward.rulesByAlias, forward.registry.rules())).toEqual(expectedAliasOrder);
    expect(orderedAliases(reverse.rulesByAlias, reverse.registry.rules())).toEqual(expectedAliasOrder);
    expect(forward.registry.rules().map(rule => rule.id)).toEqual(reverse.registry.rules().map(rule => rule.id));
  });
});
