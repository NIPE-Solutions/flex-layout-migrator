import type { LocatedFlexLayoutInput } from '../../src/analyzer/flex-layout-attribute.analyzer';
import type { PlannedConversion } from '../../src/adapter/conversion-adapter';
import type { CssDeclaration } from '../../src/adapter/css/css-artifact.model';
import { CssArtifactRegistry } from '../../src/adapter/css/css-artifact.registry';
import type { BreakpointMigrationConfig } from '../../src/config/breakpoint-migration-config';
import type { CssLength } from '../../src/flex/css-length';
import type { ConversionRenderer } from '../../src/render/conversion-renderer';
import { CssRenderer } from '../../src/render/css/css.renderer';
import { TailwindRenderer } from '../../src/render/tailwind/tailwind.renderer';
import type { SemanticConversionContext } from '../../src/semantic/conversion-context';
import { ElementSemanticPlanner } from '../../src/semantic/element-semantic.planner';
import type { ResolvedSemanticPlan } from '../../src/semantic/semantic-plan';
import type { SourcePropertyEvidence } from '../../src/semantic/source-property-evidence';
import type { TemplateElement } from '../../src/template/template.model';

const element: TemplateElement = {
  id: 'element',
  name: 'div',
  source: { start: 0, end: 0 },
  startTag: { start: 0, end: 0 },
  structural: false,
  attributes: [],
};

interface SharedRow {
  readonly label: string;
  readonly directive: LocatedFlexLayoutInput['directive'];
  readonly value: string;
  readonly companions?: readonly Partial<LocatedFlexLayoutInput>[];
  readonly family: ResolvedSemanticPlan['family'];
  readonly semantics: ResolvedSemanticPlan['value'];
  readonly tailwind: readonly string[];
  readonly css: readonly CssDeclaration[];
}

const layoutSemantics = {
  direction: 'row' as const,
  wrap: 'nowrap' as const,
  explicitWrap: false,
  display: 'flex' as const,
  boxSizing: 'border-box' as const,
};

const sharedRows: readonly SharedRow[] = [
  {
    label: 'fxLayout',
    directive: 'fxLayout',
    value: 'row-reverse wrap',
    family: 'layout',
    semantics: {
      direction: 'row-reverse',
      wrap: 'wrap',
      explicitWrap: true,
      display: 'flex',
      boxSizing: 'border-box',
    },
    tailwind: ['flex', 'flex-row-reverse', 'flex-wrap', 'box-border'],
    css: [
      { property: 'display', value: 'flex' },
      { property: 'box-sizing', value: 'border-box' },
      { property: 'flex-direction', value: 'row-reverse' },
      { property: 'flex-wrap', value: 'wrap' },
    ],
  },
  {
    label: 'fxLayoutGap',
    directive: 'fxLayoutGap',
    value: '1.5rem',
    family: 'layout-gap',
    semantics: { length: cssLength('1.5rem') },
    tailwind: ['gap-[1.5rem]'],
    css: [{ property: 'gap', value: '1.5rem' }],
  },
  {
    label: 'fxLayoutAlign',
    directive: 'fxLayoutAlign',
    value: 'center center',
    family: 'layout-align',
    semantics: { main: 'center', items: 'center', content: 'center', layout: layoutSemantics },
    tailwind: ['justify-center', 'items-center', 'content-center', 'flex', 'flex-row', 'box-border'],
    css: [
      { property: 'justify-content', value: 'center' },
      { property: 'align-items', value: 'center' },
      { property: 'align-content', value: 'center' },
      { property: 'display', value: 'flex' },
      { property: 'box-sizing', value: 'border-box' },
      { property: 'flex-direction', value: 'row' },
    ],
  },
  {
    label: 'fxFlex',
    directive: 'fxFlex',
    value: '10rem',
    family: 'flex-item',
    semantics: {
      grow: '1',
      shrink: '1',
      basis: { kind: 'literal', value: cssLength('10rem') },
      axis: 'width',
      min: cssLength('10rem'),
      max: cssLength('10rem'),
      boxSizing: 'border-box',
    },
    tailwind: ['[flex:1_1_10rem]', '[min-width:10rem]', '[max-width:10rem]', 'box-border'],
    css: [
      { property: 'flex', value: '1 1 10rem' },
      { property: 'min-width', value: '10rem' },
      { property: 'max-width', value: '10rem' },
      { property: 'box-sizing', value: 'border-box' },
    ],
  },
  {
    label: 'fxGrow grouped with fxFlex',
    directive: 'fxGrow',
    value: '2',
    companions: [{ id: 'basis', directive: 'fxFlex', sourceName: 'fxFlex', value: '10rem' }],
    family: 'flex-item',
    semantics: {
      grow: '2',
      shrink: '1',
      basis: { kind: 'literal', value: cssLength('10rem') },
      axis: 'width',
      min: cssLength('10rem'),
      max: cssLength('10rem'),
      boxSizing: 'border-box',
    },
    tailwind: ['[flex:2_1_10rem]', '[min-width:10rem]', '[max-width:10rem]', 'box-border'],
    css: [
      { property: 'flex', value: '2 1 10rem' },
      { property: 'min-width', value: '10rem' },
      { property: 'max-width', value: '10rem' },
      { property: 'box-sizing', value: 'border-box' },
    ],
  },
  {
    label: 'fxShrink grouped with fxFlex',
    directive: 'fxShrink',
    value: '3',
    companions: [{ id: 'basis', directive: 'fxFlex', sourceName: 'fxFlex', value: '10rem' }],
    family: 'flex-item',
    semantics: {
      grow: '1',
      shrink: '3',
      basis: { kind: 'literal', value: cssLength('10rem') },
      axis: 'width',
      min: cssLength('10rem'),
      max: cssLength('10rem'),
      boxSizing: 'border-box',
    },
    tailwind: ['[flex:1_3_10rem]', '[min-width:10rem]', '[max-width:10rem]', 'box-border'],
    css: [
      { property: 'flex', value: '1 3 10rem' },
      { property: 'min-width', value: '10rem' },
      { property: 'max-width', value: '10rem' },
      { property: 'box-sizing', value: 'border-box' },
    ],
  },
  {
    label: 'fxFlexAlign',
    directive: 'fxFlexAlign',
    value: 'end',
    family: 'flex-align',
    semantics: { alignment: 'end' },
    tailwind: ['self-end'],
    css: [{ property: 'align-self', value: 'flex-end' }],
  },
  {
    label: 'fxFlexFill',
    directive: 'fxFlexFill',
    value: '',
    family: 'flex-fill',
    semantics: { margin: '0', width: '100%', height: '100%', minWidth: '100%', minHeight: '100%' },
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
    label: 'fxFill alias',
    directive: 'fxFill',
    value: '',
    family: 'flex-fill',
    semantics: { margin: '0', width: '100%', height: '100%', minWidth: '100%', minHeight: '100%' },
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
    label: 'fxFlexOffset',
    directive: 'fxFlexOffset',
    value: '4',
    family: 'flex-offset',
    semantics: { axis: 'inline-start', length: cssLength('4%') },
    tailwind: ['ms-[4%]'],
    css: [{ property: 'margin-inline-start', value: '4%' }],
  },
  {
    label: 'fxFlexOrder',
    directive: 'fxFlexOrder',
    value: '-3',
    family: 'flex-order',
    semantics: { order: -3 },
    tailwind: ['[order:-3]'],
    css: [{ property: 'order', value: '-3' }],
  },
];

describe('shared semantic target parity', () => {
  test.each(sharedRows)('$label resolves once to shared semantics before exact target output', row => {
    const subject = input({ directive: row.directive, sourceName: row.directive, value: row.value });
    const inputs = [
      subject,
      ...(row.companions ?? []).map((overrides, index) => input({ id: `companion:${index}`, ...overrides })),
    ];
    const tailwind = planWith(new TailwindRenderer(), inputs, subject.id);
    const registry = new CssArtifactRegistry();
    const css = planWith(new CssRenderer(registry), inputs, subject.id);

    expect({ family: tailwind.semantic.family, value: tailwind.semantic.value }).toEqual({
      family: row.family,
      value: row.semantics,
    });
    expect({ family: css.semantic.family, value: css.semantic.value }).toEqual({
      family: row.family,
      value: row.semantics,
    });
    expect(tailwind.result).toEqual({ status: 'converted', input: subject, classNames: row.tailwind });
    expect(cssDeclarations(css.result, registry)).toEqual(row.css);
  });

  test.each([
    {
      label: 'Grid',
      input: { directive: 'gdColumns' as const, sourceName: 'gdColumns', value: '1fr' },
      tailwind: { status: 'converted', classNames: ['grid', '[grid-template-columns:1fr]'] },
      css: targetUnsupported('CSS', 'gdColumns'),
    },
    {
      label: 'visibility',
      input: { directive: 'fxShow' as const, sourceName: 'fxShow', value: 'false' },
      tailwind: { status: 'converted', classNames: ['hidden'] },
      css: targetUnsupported('CSS', 'fxShow'),
    },
    {
      label: 'responsive class',
      input: { directive: 'ngClass' as const, sourceName: 'ngClass.sm', breakpoint: 'sm', value: 'flex' },
      tailwind: {
        status: 'converted',
        classNames: ['[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:flex'],
      },
      css: targetUnsupported('CSS', 'ngClass.sm'),
    },
    {
      label: 'responsive style',
      input: { directive: 'ngStyle' as const, sourceName: 'ngStyle.sm', breakpoint: 'sm', value: 'color:red' },
      tailwind: {
        status: 'converted',
        classNames: ['[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:[color:red]'],
      },
      css: targetUnsupported('CSS', 'ngStyle.sm'),
    },
    {
      label: 'orientation breakpoint',
      input: { directive: 'fxLayout' as const, sourceName: 'fxLayout.handset', breakpoint: 'handset', value: 'column' },
      tailwind: breakpointUnverified('handset', 'optional'),
      css: targetUnsupported('CSS', 'fxLayout.handset'),
    },
    {
      label: 'print breakpoint',
      input: { directive: 'fxLayout' as const, sourceName: 'fxLayout.print', breakpoint: 'print', value: 'column' },
      tailwind: breakpointUnverified('print', 'print'),
      css: targetUnsupported('CSS', 'fxLayout.print'),
    },
    {
      label: 'custom breakpoint',
      input: { directive: 'fxLayout' as const, sourceName: 'fxLayout.desktop', breakpoint: 'desktop', value: 'column' },
      tailwind: {
        status: 'review',
        code: 'custom-breakpoint',
        reason: 'The breakpoint alias desktop may be registered by the project.',
        suggestion: 'Provide its media query or migrate this responsive input manually.',
      },
      css: targetUnsupported('CSS', 'fxLayout.desktop'),
    },
    {
      label: 'dynamic binding',
      input: {
        directive: 'fxLayout' as const,
        sourceName: '[fxLayout]',
        binding: 'property' as const,
        value: 'direction',
      },
      tailwind: dynamicBinding(),
      css: dynamicBinding(),
    },
    {
      label: 'Tailwind class conflict',
      input: { directive: 'fxLayout' as const, sourceName: 'fxLayout', value: 'row' },
      existingClassNames: ['block'],
      tailwind: {
        status: 'review',
        code: 'class-conflict',
        reason: 'An existing Tailwind utility controls a CSS property generated by this conversion.',
        suggestion: 'Remove or reconcile the conflicting utility before migrating this directive.',
      },
      css: { status: 'converted' },
    },
    {
      label: 'CSS-unsupported renderer-free input',
      input: { directive: 'imgSrc' as const, sourceName: 'src.sm', breakpoint: 'sm', value: 'small.png' },
      tailwind: targetUnsupported('Tailwind', 'imgSrc'),
      css: targetUnsupported('CSS', 'src.sm'),
    },
  ] as const)('keeps the intentional $label target divergence explicit', row => {
    const subject = input(row.input);
    const context = semanticContext([subject], row.existingClassNames ?? []);
    const tailwindRenderer = new TailwindRenderer();
    const cssRenderer = new CssRenderer();
    const tailwind = planAndResolve([subject], context, tailwindRenderer)[0];
    const css = planAndResolve([subject], context, cssRenderer)[0];

    expect(tailwind).toEqual({ ...row.tailwind, input: subject });
    if (row.css.status === 'converted') {
      expect(css).toMatchObject({ status: 'converted', input: subject });
    } else {
      expect(css).toEqual({ ...row.css, input: subject });
    }
  });
});

class RecordingRenderer implements ConversionRenderer {
  readonly target: ConversionRenderer['target'];
  readonly breakpointConfig?: BreakpointMigrationConfig;
  readonly sourcePropertyEvidence?: SourcePropertyEvidence;
  readonly rendered: ResolvedSemanticPlan[] = [];

  constructor(private readonly delegate: ConversionRenderer) {
    this.target = delegate.target;
    this.breakpointConfig = delegate.breakpointConfig;
    this.sourcePropertyEvidence = delegate.sourcePropertyEvidence;
  }

  eligibility(input: LocatedFlexLayoutInput): PlannedConversion | undefined {
    return this.delegate.eligibility(input);
  }

  render(plan: ResolvedSemanticPlan, context: SemanticConversionContext): PlannedConversion {
    this.rendered.push(plan);
    return this.delegate.render(plan, context);
  }

  resolveConflicts(
    plans: readonly PlannedConversion[],
    context: SemanticConversionContext,
  ): readonly PlannedConversion[] {
    return this.delegate.resolveConflicts(plans, context);
  }

  record(plans: readonly PlannedConversion[]): void {
    this.delegate.record(plans);
  }
}

function planWith(renderer: ConversionRenderer, inputs: readonly LocatedFlexLayoutInput[], subjectId: string) {
  const recording = new RecordingRenderer(renderer);
  const results = new ElementSemanticPlanner().plan(inputs, semanticContext(inputs), recording);
  const result = results.find(candidate => candidate.input.id === subjectId);
  const semantic = recording.rendered.find(candidate => candidate.input.id === subjectId);
  if (result === undefined || semantic === undefined)
    throw new Error(`Missing semantic target result for ${subjectId}`);
  return { result, semantic };
}

function planAndResolve(
  inputs: readonly LocatedFlexLayoutInput[],
  context: SemanticConversionContext,
  renderer: ConversionRenderer,
): readonly PlannedConversion[] {
  return renderer.resolveConflicts(new ElementSemanticPlanner().plan(inputs, context, renderer), context);
}

function cssDeclarations(result: PlannedConversion, registry: CssArtifactRegistry): readonly CssDeclaration[] {
  if (result.status !== 'converted') throw new Error(`Expected converted CSS result, received ${result.status}`);
  if (result.classNames.length === 0) return [];
  const rule = registry.rules().find(candidate => candidate.className === result.classNames[0]);
  if (rule === undefined) throw new Error(`Missing CSS rule for ${result.classNames[0]}`);
  return rule.declarations;
}

function semanticContext(
  inputs: readonly LocatedFlexLayoutInput[],
  existingClassNames: readonly string[] = [],
): SemanticConversionContext {
  return {
    element,
    inputs,
    parentInputs: [],
    existingClassNames,
    attributeEvidence: [],
    activeLayout: 'row',
    activeParentLayout: 'row',
  };
}

function input(overrides: Partial<LocatedFlexLayoutInput> = {}): LocatedFlexLayoutInput {
  const directive = overrides.directive ?? 'fxLayout';
  return {
    id: overrides.id ?? `fixture:${overrides.sourceName ?? directive}`,
    fileName: 'fixture.html',
    elementId: element.id,
    sourceName: overrides.sourceName ?? directive,
    directive,
    value: overrides.value ?? 'row',
    binding: overrides.binding ?? 'literal',
    breakpoint: overrides.breakpoint,
    source: { start: 0, end: 1 },
    nameSource: { start: 0, end: 1 },
  };
}

function targetUnsupported(target: 'CSS' | 'Tailwind', sourceName: string) {
  return {
    status: 'unsupported' as const,
    code: 'target-unsupported' as const,
    reason: `The ${target} target does not support ${sourceName}.`,
    suggestion:
      target === 'CSS'
        ? 'Use the Tailwind target when it supports this input, or migrate the directive manually.'
        : 'Keep the directive and migrate it manually.',
  };
}

function breakpointUnverified(alias: string, kind: 'optional' | 'print') {
  return {
    status: 'review' as const,
    code: 'breakpoint-unverified' as const,
    reason: `The ${kind} breakpoint alias ${alias} is not enabled by explicit migration configuration.`,
    suggestion:
      kind === 'print'
        ? 'Verify the source printWithBreakpoints value, then rerun with --print-with-breakpoints.'
        : 'Verify that the source enables orientation breakpoints, then rerun with --orientation-breakpoints.',
  };
}

function dynamicBinding() {
  return {
    status: 'review' as const,
    code: 'dynamic-binding' as const,
    reason: 'Angular property bindings may depend on runtime state.',
    suggestion: 'Replace the binding manually or make it a literal before migration.',
  };
}

function cssLength(value: string): CssLength {
  return value as CssLength;
}
