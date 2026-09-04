import type { LocatedFlexLayoutInput } from '../analyzer/flex-layout-attribute.analyzer';
import { CssArtifactRegistry } from '../adapter/css/css-artifact.registry';
import type { CssDeclaration, CssSemanticFamily } from '../adapter/css/css-artifact.model';
import type { PlannedConversion } from '../adapter/conversion-adapter';
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
  readonly renderedFamilies: DirectiveFamily[] = [];
  readonly renderedPlans: ResolvedSemanticPlan[] = [];

  constructor(private readonly delegate?: ConversionRenderer) {
    this.target = delegate?.target ?? 'tailwind';
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
  test('closes semantic dependencies before rendering target output', () => {
    const inputs = [
      input(),
      input({ id: 'fixture:gap', directive: 'fxLayoutGap', sourceName: 'fxLayoutGap', value: '4' }),
      input({ id: 'fixture:item', directive: 'fxFlex', sourceName: 'fxFlex', value: '25' }),
    ];
    const renderer = new RecordingRenderer();

    const plans = new ElementSemanticPlanner().plan(inputs, context(inputs), renderer);

    expect(renderer.renderedFamilies).toEqual(['layout', 'layout-gap', 'flex-item']);
    expect(plans.map(plan => plan.status)).toEqual(['converted', 'converted', 'converted']);
  });

  test('does not render a family rejected by shared dependency policy', () => {
    const inputs = [
      input({ sourceName: '[fxLayout]', binding: 'property', value: 'direction' }),
      input({ id: 'fixture:gap', directive: 'fxLayoutGap', sourceName: 'fxLayoutGap', value: '4' }),
    ];
    const renderer = new RecordingRenderer();

    new ElementSemanticPlanner().plan(inputs, context(inputs), renderer);

    expect(renderer.renderedFamilies).not.toContain('layout-gap');
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

      const tailwindPlans = planner.plan([member], semanticContext, tailwind);
      const cssPlans = planner.plan([member], semanticContext, css);

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
