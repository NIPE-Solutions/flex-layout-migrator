import type { LocatedFlexLayoutInput } from '../analyzer/flex-layout-attribute.analyzer';
import { CssArtifactRegistry } from '../adapter/css/css-artifact.registry';
import type { CssDeclaration, CssSemanticFamily } from '../adapter/css/css-artifact.model';
import type { PlannedConversion } from '../adapter/conversion-adapter';
import { TailwindSourcePropertyEvidence } from '../evidence/tailwind-source-property.evidence';
import { SemanticRenderCoordinator } from '../planner/semantic-render.coordinator';
import { CssRenderer } from '../render/css/css.renderer';
import type { ConversionRenderer } from '../render/conversion-renderer';
import { TailwindRenderer } from '../render/tailwind/tailwind.renderer';
import type { TemplateElement } from '../template/template.model';
import type { SemanticConversionContext } from './conversion-context';
import { ElementSemanticPlanner } from './element-semantic.planner';
import type { DirectiveFamily, ResolvedSemanticPlan } from './semantic-plan';

const element: TemplateElement = {
  id: 'element',
  name: 'div',
  source: { start: 0, end: 5 },
  startTag: { start: 0, end: 5 },
  structural: false,
  attributes: [],
};

function input(overrides: Partial<LocatedFlexLayoutInput> = {}): LocatedFlexLayoutInput {
  return {
    id: 'fixture:layout',
    fileName: 'fixture.html',
    elementId: element.id,
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

function context(inputs: readonly LocatedFlexLayoutInput[]): SemanticConversionContext {
  return {
    element,
    inputs,
    parentInputs: [],
    existingClassNames: [],
    attributeEvidence: element.attributes,
  };
}

class RecordingRenderer implements ConversionRenderer {
  readonly target: 'tailwind' | 'css';
  readonly sourcePropertyEvidence;
  readonly renderedFamilies: DirectiveFamily[] = [];
  readonly renderedPlans: ResolvedSemanticPlan[] = [];

  constructor(private readonly delegate?: ConversionRenderer) {
    this.target = delegate?.target ?? 'tailwind';
    this.sourcePropertyEvidence = delegate?.sourcePropertyEvidence ?? new TailwindSourcePropertyEvidence();
  }

  eligibility(member: LocatedFlexLayoutInput): PlannedConversion | undefined {
    return this.delegate?.eligibility(member);
  }

  render(plan: ResolvedSemanticPlan, semanticContext: SemanticConversionContext): PlannedConversion {
    this.renderedFamilies.push(plan.family);
    this.renderedPlans.push(plan);
    return (
      this.delegate?.render(plan, semanticContext) ?? {
        status: 'converted',
        input: plan.input,
        classNames: [plan.family],
      }
    );
  }

  resolveConflicts(
    plans: readonly PlannedConversion[],
    semanticContext: SemanticConversionContext,
  ): readonly PlannedConversion[] {
    return this.delegate?.resolveConflicts(plans, semanticContext) ?? plans;
  }

  record(plans: readonly PlannedConversion[]): void {
    this.delegate?.record(plans);
  }
}

interface SharedFamilyCase {
  readonly family: CssSemanticFamily;
  readonly directive: LocatedFlexLayoutInput['directive'];
  readonly value: string;
  readonly tailwind: readonly string[];
  readonly css: readonly CssDeclaration[];
}

const sharedFamilyCases: readonly SharedFamilyCase[] = [
  {
    family: 'layout',
    directive: 'fxLayout',
    value: 'row',
    tailwind: ['flex', 'flex-row', 'box-border'],
    css: [
      { property: 'display', value: 'flex' },
      { property: 'box-sizing', value: 'border-box' },
      { property: 'flex-direction', value: 'row' },
    ],
  },
  {
    family: 'layout-gap',
    directive: 'fxLayoutGap',
    value: '8',
    tailwind: ['gap-[8px]'],
    css: [{ property: 'gap', value: '8px' }],
  },
  {
    family: 'layout-align',
    directive: 'fxLayoutAlign',
    value: 'start stretch',
    tailwind: ['justify-start', 'items-stretch', 'content-stretch', 'flex', 'flex-row', 'box-border', 'max-h-full'],
    css: [
      { property: 'justify-content', value: 'flex-start' },
      { property: 'align-items', value: 'stretch' },
      { property: 'align-content', value: 'stretch' },
      { property: 'display', value: 'flex' },
      { property: 'box-sizing', value: 'border-box' },
      { property: 'flex-direction', value: 'row' },
      { property: 'max-height', value: '100%' },
    ],
  },
  {
    family: 'flex-item',
    directive: 'fxFlex',
    value: '25',
    tailwind: ['[flex:1_1_100%]', '[max-width:25%]', 'box-border'],
    css: [
      { property: 'flex', value: '1 1 100%' },
      { property: 'max-width', value: '25%' },
      { property: 'box-sizing', value: 'border-box' },
    ],
  },
  {
    family: 'flex-align',
    directive: 'fxFlexAlign',
    value: 'end',
    tailwind: ['self-end'],
    css: [{ property: 'align-self', value: 'flex-end' }],
  },
  {
    family: 'flex-fill',
    directive: 'fxFlexFill',
    value: '',
    tailwind: ['m-0', 'w-full', 'h-full', 'min-w-full', 'min-h-full'],
    css: [
      { property: 'margin', value: '0' },
      { property: 'width', value: '100%' },
      { property: 'height', value: '100%' },
      { property: 'min-width', value: '100%' },
      { property: 'min-height', value: '100%' },
    ],
  },
  {
    family: 'flex-offset',
    directive: 'fxFlexOffset',
    value: '4',
    tailwind: ['ms-[4%]'],
    css: [{ property: 'margin-inline-start', value: '4%' }],
  },
  {
    family: 'flex-order',
    directive: 'fxFlexOrder',
    value: '2',
    tailwind: ['[order:2]'],
    css: [{ property: 'order', value: '2' }],
  },
];

describe('ElementSemanticPlanner', () => {
  test('returns target-independent semantic plans without a renderer', () => {
    const member = input();

    expect(new ElementSemanticPlanner().plan([member], context([member]))).toEqual([
      expect.objectContaining({
        status: 'converted',
        input: member,
        family: 'layout',
        value: expect.objectContaining({ direction: 'row' }),
      }),
    ]);
  });

  test('resolves visibility and extended-family source into semantic states before renderer entry', () => {
    const inputs = [
      input({ id: 'fixture:hide', directive: 'fxHide', sourceName: 'fxHide', value: 'true' }),
      input({
        id: 'fixture:class',
        directive: 'ngClass',
        sourceName: 'ngClass.md',
        value: 'block flex-row',
        breakpoint: 'md',
      }),
      input({
        id: 'fixture:style',
        directive: 'ngStyle',
        sourceName: 'ngStyle.lg',
        value: 'display: grid; color: red',
        breakpoint: 'lg',
      }),
    ];
    const planner = new ElementSemanticPlanner(undefined, new TailwindSourcePropertyEvidence());
    const resolvedPlans = inputs
      .flatMap(member => planner.plan([member], context([member])))
      .filter((plan): plan is ResolvedSemanticPlan => plan.status === 'converted');

    expect(resolvedPlans.map(plan => plan.value)).toEqual([
      {
        kind: 'visibility',
        emit: true,
        states: [{ activation: { kind: 'base' }, intent: 'hidden' }],
      },
      {
        kind: 'extended-class',
        emit: true,
        retainedTokens: [],
        states: [
          {
            activations: [expect.objectContaining({ kind: 'media' })],
            tokens: [
              expect.objectContaining({ source: 'block', properties: ['display'] }),
              expect.objectContaining({ source: 'flex-row', properties: ['flex-direction'] }),
            ],
          },
        ],
      },
      {
        kind: 'extended-style',
        emit: true,
        states: [
          {
            activations: [expect.objectContaining({ kind: 'media' })],
            declarations: [
              { property: 'display', value: 'grid' },
              { property: 'color', value: 'red' },
            ],
          },
        ],
      },
    ]);
    expect(resolvedPlans.some(plan => 'source' in plan.value)).toBe(false);
  });

  test('resolves cross-family display ownership before either family enters the renderer', () => {
    const inputs = [
      input({ sourceName: 'fxLayout.sm', breakpoint: 'sm' }),
      input({
        id: 'fixture:class',
        directive: 'ngClass',
        sourceName: 'ngClass.sm',
        value: 'hidden',
        breakpoint: 'sm',
      }),
    ];
    const plans = new ElementSemanticPlanner(undefined, new TailwindSourcePropertyEvidence()).plan(
      inputs,
      context(inputs),
    );

    expect(plans).toHaveLength(2);
    expect(plans.find(plan => plan.status === 'converted' && plan.family === 'extended-class')).toMatchObject({
      suppressedEffects: [
        {
          activation: expect.objectContaining({ kind: 'media' }),
          important: false,
          properties: ['display'],
        },
      ],
    });
  });

  test('selects configured print activation before renderer entry', () => {
    const member = input({ breakpoint: 'md', sourceName: 'fxLayout.md', value: 'column' });
    const plans = new ElementSemanticPlanner({ orientationBreakpoints: false, printWithBreakpoints: ['md'] }).plan(
      [member],
      context([member]),
    );

    expect(
      plans[0]?.status === 'converted'
        ? plans[0].activations.map(item => (item.kind === 'media' ? item.definition.alias : 'base'))
        : [],
    ).toEqual(['md', 'print']);
  });

  test('Tailwind conflict resolution cannot reparse poisoned sibling source', () => {
    const member = input({
      id: 'fixture:class',
      directive: 'ngClass',
      sourceName: 'ngClass.md',
      value: 'block flex-row',
      breakpoint: 'md',
    });
    const renderer = new TailwindRenderer();
    const planned = new SemanticRenderCoordinator(renderer).planElement([member], context([member]), false);
    const poisoned = { ...member, value: 'application-plugin-class' };

    const resolved = renderer.resolveConflicts(planned, context([poisoned]));

    expect(planned).toEqual([
      {
        status: 'converted',
        input: member,
        classNames: [
          '[@media_screen_and_(min-width:_960px)_and_(max-width:_1279.98px)]:block',
          '[@media_screen_and_(min-width:_960px)_and_(max-width:_1279.98px)]:flex-row',
        ],
      },
    ]);
    expect(resolved).toEqual(planned);
  });

  test('closes semantic dependencies before rendering target output', () => {
    const inputs = [
      input(),
      input({ id: 'fixture:gap', directive: 'fxLayoutGap', sourceName: 'fxLayoutGap', value: '4' }),
      input({ id: 'fixture:item', directive: 'fxFlex', sourceName: 'fxFlex', value: '25' }),
    ];
    const plans = new ElementSemanticPlanner().plan(inputs, context(inputs));

    expect(
      plans.filter((plan): plan is ResolvedSemanticPlan => plan.status === 'converted').map(plan => plan.family),
    ).toEqual(['layout', 'layout-gap', 'flex-item']);
    expect(plans.map(plan => plan.status)).toEqual(['converted', 'converted', 'converted']);
  });

  test('does not render a family rejected by shared dependency policy', () => {
    const inputs = [
      input({ sourceName: '[fxLayout]', binding: 'property', value: 'direction' }),
      input({ id: 'fixture:gap', directive: 'fxLayoutGap', sourceName: 'fxLayoutGap', value: '4' }),
    ];
    const plans = new ElementSemanticPlanner().plan(inputs, context(inputs));

    expect(plans).toEqual([
      expect.objectContaining({ status: 'review', code: 'dynamic-binding' }),
      expect.objectContaining({ status: 'review', code: 'context-unverified' }),
    ]);
  });

  test.each(sharedFamilyCases)(
    'hands one resolved $family semantic value separately to Tailwind and CSS renderers',
    testCase => {
      const member = input({
        directive: testCase.directive,
        sourceName: testCase.directive,
        value: testCase.value,
      });
      const semanticContext = context([member]);
      const tailwind = new RecordingRenderer(new TailwindRenderer());
      const registry = new CssArtifactRegistry();
      const css = new RecordingRenderer(new CssRenderer(registry));
      const planner = new ElementSemanticPlanner();

      const tailwindPlans = new SemanticRenderCoordinator(tailwind, planner).planElement(
        [member],
        semanticContext,
        false,
      );
      const cssPlans = new SemanticRenderCoordinator(css, planner).planElement([member], semanticContext, false);

      expect(tailwind.renderedPlans).toHaveLength(1);
      expect(css.renderedPlans).toHaveLength(1);
      expect(css.renderedPlans[0]).toEqual(tailwind.renderedPlans[0]);
      expect(tailwindPlans).toEqual([{ status: 'converted', input: member, classNames: testCase.tailwind }]);
      expect(cssPlans[0]).toMatchObject({ status: 'converted', input: member });
      expect(registry.rules()).toEqual([
        expect.objectContaining({ family: testCase.family, declarations: testCase.css }),
      ]);
    },
  );
});
