import type { BreakpointDefinition, MediaRange } from '../../breakpoint/breakpoint-catalog';
import {
  BreakpointCatalog,
  mediaDefinitionsIntersect,
  mediaRangesIntersect,
} from '../../breakpoint/breakpoint-catalog';
import type { BreakpointMigrationConfig } from '../../config/breakpoint-migration-config';
import { planFlexAlignSemantics } from '../../flex/flex-align.semantic';
import { planFlexFillSemantics } from '../../flex/flex-fill.semantic';
import { planFlexItemSemantics } from '../../flex/flex-item.semantic';
import { planFlexOffsetSemantics } from '../../flex/flex-offset.semantic';
import { planFlexOrderSemantics } from '../../flex/flex-order.semantic';
import type { SemanticResult } from '../../flex/flex-semantic.model';
import { planLayoutAlignment } from '../../flex/layout-align.semantic';
import { planLayoutGapSemantics } from '../../flex/layout-gap.semantic';
import { parseLayout } from '../../flex/layout.semantic';
import type { AdapterSessionResult, ConversionAdapterSession } from '../conversion-adapter.session';
import { sessionBoundAdapter } from '../conversion-adapter.session';
import type { ConversionAdapter, ConversionContext, PlannedConversion } from '../conversion-adapter';
import type { CssDeclaration, CssSemanticFamily } from './css-artifact.model';
import { CssArtifactRegistry } from './css-artifact.registry';
import { cssRuleContext } from './css-breakpoint.context';
import { CssInvariantError } from './css-invariant.error';
import { renderFlexAlignCss } from './flex/flex-align.css-renderer';
import { renderFlexFillCss } from './flex/flex-fill.css-renderer';
import { renderFlexItemCss } from './flex/flex-item.css-renderer';
import { renderFlexOffsetCss } from './flex/flex-offset.css-renderer';
import { renderFlexOrderCss } from './flex/flex-order.css-renderer';
import { renderLayoutAlignmentCss } from './flex/layout-align.css-renderer';
import { renderLayoutGapCss } from './flex/layout-gap.css-renderer';
import { renderLayoutCss } from './flex/layout.css-renderer';

type AdapterInput = Parameters<ConversionAdapter['plan']>[0];
type AdapterDirective = AdapterInput['directive'];
type UnresolvedPlan = Exclude<PlannedConversion, { readonly status: 'converted' }>;

interface ConvertedCssPlan {
  readonly status: 'converted';
  readonly input: AdapterInput;
  readonly family: CssSemanticFamily;
  readonly declarations: readonly CssDeclaration[];
}

type CssPlan = ConvertedCssPlan | UnresolvedPlan;

interface NumericRange {
  readonly min: number;
  readonly max: number;
}

const flexItemDirectives = new Set<AdapterDirective>(['fxFlex', 'fxGrow', 'fxShrink']);
const visibilityDirectives = new Set<AdapterDirective>(['fxShow', 'fxHide']);
const localLayoutFamilies = new Set<CssSemanticFamily>(['layout-gap', 'layout-align']);
const parentLayoutFamilies = new Set<CssSemanticFamily>(['flex-item', 'flex-offset']);
const localDependencyFamilies = new Set<CssSemanticFamily>(['layout', 'layout-gap', 'layout-align']);
const familyByDirective = new Map<AdapterDirective, CssSemanticFamily>([
  ['fxLayout', 'layout'],
  ['fxLayoutGap', 'layout-gap'],
  ['fxLayoutAlign', 'layout-align'],
  ['fxFlex', 'flex-item'],
  ['fxGrow', 'flex-item'],
  ['fxShrink', 'flex-item'],
  ['fxFlexAlign', 'flex-align'],
  ['fxFlexFill', 'flex-fill'],
  ['fxFill', 'flex-fill'],
  ['fxFlexOffset', 'flex-offset'],
  ['fxFlexOrder', 'flex-order'],
]);

function invalid(input: AdapterInput): UnresolvedPlan {
  return {
    status: 'invalid',
    input,
    code: 'invalid-value',
    reason: `${input.value} is not a supported ${input.directive} value.`,
    suggestion: 'Correct the value or migrate this directive manually.',
  };
}

function targetUnsupported(input: AdapterInput): UnresolvedPlan {
  return {
    status: 'unsupported',
    input,
    code: 'target-unsupported',
    reason: `The CSS target does not support ${input.sourceName}.`,
    suggestion: 'Use the Tailwind target when it supports this input, or migrate the directive manually.',
  };
}

function dynamicBinding(input: AdapterInput): UnresolvedPlan {
  return {
    status: 'review',
    input,
    code: 'dynamic-binding',
    reason: 'Angular property bindings may depend on runtime state.',
    suggestion: 'Replace the binding manually or make it a literal before migration.',
  };
}

function contextUnverified(input: AdapterInput, reason: string): UnresolvedPlan {
  return {
    status: 'review',
    input,
    code: 'context-unverified',
    reason,
    suggestion: 'Migrate the responsive context and its dependent directive families together manually.',
  };
}

function responsivePrecedenceUnverified(input: AdapterInput): UnresolvedPlan {
  return {
    status: 'review',
    input,
    code: 'responsive-precedence-unverified',
    reason: 'Overlapping responsive ranges emit different CSS declarations for the same directive family.',
    suggestion: 'Simplify the overlapping declarations or migrate this directive family manually.',
  };
}

function displayContextUnverified(input: AdapterInput): UnresolvedPlan {
  return {
    status: 'review',
    input,
    code: 'context-unverified',
    reason: 'The element display context contains an unresolved layout or visibility family.',
    suggestion: 'Migrate the complete layout and visibility context together manually.',
  };
}

function staticLayoutContext(attributes: ConversionContext['element']['attributes']): string | undefined {
  const layouts = attributes.filter(
    attribute => attribute.name === 'fxLayout' || attribute.name.startsWith('fxLayout.'),
  );
  if (!layouts.length) return 'row';
  if (layouts.length !== 1) return undefined;
  const layout = layouts[0];
  return layout?.name === 'fxLayout' && layout.binding === 'literal' ? layout.value : undefined;
}

function fromSemantic<T>(
  input: AdapterInput,
  family: CssSemanticFamily,
  result: SemanticResult<T>,
  render: (value: T) => readonly CssDeclaration[],
): CssPlan {
  if (result.status === 'planned') {
    return { status: 'converted', input, family, declarations: render(result.value) };
  }
  if (result.status === 'invalid') return invalid(input);
  return { ...result, input };
}

function sameDeclarations(left: CssPlan, right: CssPlan): boolean {
  return (
    left.status === 'converted' &&
    right.status === 'converted' &&
    left.family === right.family &&
    left.declarations.length === right.declarations.length &&
    left.declarations.every(
      (declaration, index) =>
        declaration.property === right.declarations[index]?.property &&
        declaration.value === right.declarations[index]?.value,
    )
  );
}

function numericRange(range: MediaRange): NumericRange {
  return {
    min: range.min ?? Number.NEGATIVE_INFINITY,
    max: range.max ?? Number.POSITIVE_INFINITY,
  };
}

function mediaRange(range: NumericRange): MediaRange {
  return {
    min: range.min === Number.NEGATIVE_INFINITY ? undefined : range.min,
    max: range.max === Number.POSITIVE_INFINITY ? undefined : range.max,
  };
}

function nextBelow(value: number): number {
  return value - Math.max(1, Math.abs(value)) * Number.EPSILON;
}

function nextAbove(value: number): number {
  return value + Math.max(1, Math.abs(value)) * Number.EPSILON;
}

function subtractRange(source: NumericRange, excluded: NumericRange): readonly NumericRange[] {
  if (source.max < excluded.min || excluded.max < source.min) return [source];
  const remaining: NumericRange[] = [];
  if (source.min < excluded.min) remaining.push({ min: source.min, max: nextBelow(excluded.min) });
  if (excluded.max < source.max) remaining.push({ min: nextAbove(excluded.max), max: source.max });
  return remaining;
}

function rangesCover(target: NumericRange, ranges: readonly NumericRange[]): boolean {
  const clipped = ranges
    .map(range => ({ min: Math.max(target.min, range.min), max: Math.min(target.max, range.max) }))
    .filter(range => range.min <= range.max)
    .sort((left, right) => left.min - right.min);
  if (!clipped.length || clipped[0]?.min !== target.min) return false;

  let coveredUntil = clipped[0].max;
  for (const range of clipped.slice(1)) {
    if (range.min > coveredUntil) return false;
    coveredUntil = Math.max(coveredUntil, range.max);
  }
  return coveredUntil >= target.max;
}

export class CssAdapter implements ConversionAdapter {
  readonly name = 'css' as const;
  private readonly breakpointCatalog = new BreakpointCatalog();

  constructor(private readonly registry: CssArtifactRegistry) {}

  plan(input: AdapterInput, context: ConversionContext): PlannedConversion {
    return this.emit(this.validateBreakpoint(this.planSemantic(input, context)));
  }

  planElement(inputs: readonly AdapterInput[], context: ConversionContext): readonly PlannedConversion[] {
    const groups = new Map<CssSemanticFamily, AdapterInput[]>();
    const unsupportedInputs: AdapterInput[] = [];
    for (const input of inputs) {
      const family = familyByDirective.get(input.directive);
      if (!family) {
        unsupportedInputs.push(input);
        continue;
      }
      const members = groups.get(family) ?? [];
      members.push(input);
      groups.set(family, members);
    }

    const completeContext: ConversionContext = { ...context, inputs };
    const rawPlansByFamily = new Map<CssSemanticFamily, readonly CssPlan[]>();
    const layoutInputs = groups.get('layout') ?? [];
    const layoutPlans = this.planFamily(layoutInputs, completeContext, true);
    if (layoutInputs.length) rawPlansByFamily.set('layout', layoutPlans);

    const parentLayoutInputs = context.parentInputs?.filter(input => input.directive === 'fxLayout');
    const parentLayoutSafe =
      parentLayoutInputs === undefined ||
      this.isLayoutContextSafe(
        context.parentInputs ?? [],
        {
          ...context,
          element: context.parent ?? context.element,
          inputs: context.parentInputs,
          parent: undefined,
          parentInputs: undefined,
        },
        true,
      );
    const localLayoutSafe = layoutPlans.every(plan => plan.status === 'converted');

    for (const [family, familyInputs] of groups) {
      if (family === 'layout') continue;

      let plans: readonly CssPlan[];
      if (localLayoutFamilies.has(family)) {
        plans = localLayoutSafe
          ? this.planContextualFamily(familyInputs, completeContext, layoutInputs, 'activeLayout', true)
          : this.planBlockedContextFamily(
              familyInputs,
              completeContext,
              'The responsive layout family contains an unresolved member.',
            );
      } else if (parentLayoutFamilies.has(family)) {
        plans = parentLayoutSafe
          ? this.planContextualFamily(
              familyInputs,
              completeContext,
              parentLayoutInputs ?? [],
              'activeParentLayout',
              true,
            )
          : this.planBlockedContextFamily(
              familyInputs,
              completeContext,
              'The responsive parent layout family contains an unresolved member.',
            );
      } else {
        plans = this.planFamily(familyInputs, completeContext, true);
      }
      rawPlansByFamily.set(family, plans);
    }

    if (unsupportedInputs.some(input => visibilityDirectives.has(input.directive))) {
      const plans = rawPlansByFamily.get('layout');
      if (plans) {
        rawPlansByFamily.set(
          'layout',
          plans.map(plan => (plan.status === 'converted' ? displayContextUnverified(plan.input) : plan)),
        );
      }
    }

    const localContextUnresolved = [...localDependencyFamilies].some(family =>
      rawPlansByFamily.get(family)?.some(plan => plan.status !== 'converted'),
    );
    if (localContextUnresolved) {
      for (const family of localDependencyFamilies) {
        const plans = rawPlansByFamily.get(family);
        if (!plans) continue;
        rawPlansByFamily.set(
          family,
          plans.map(plan =>
            plan.status === 'converted'
              ? contextUnverified(
                  plan.input,
                  'The element layout context contains an unresolved dependent directive family.',
                )
              : plan,
          ),
        );
      }
    }

    const plansById = new Map<string, PlannedConversion>();
    for (const plans of rawPlansByFamily.values()) {
      for (const plan of plans) plansById.set(plan.input.id, this.emit(plan));
    }
    for (const input of unsupportedInputs) plansById.set(input.id, targetUnsupported(input));

    return inputs.map(input => plansById.get(input.id) ?? targetUnsupported(input));
  }

  closePlanDependencies(
    plans: readonly PlannedConversion[],
    context: ConversionContext,
    plansByInputId: ReadonlyMap<string, PlannedConversion>,
  ): readonly PlannedConversion[] {
    const closedByFamily = new Map<CssSemanticFamily, PlannedConversion[]>();
    const plansById = new Map(plans.map(plan => [plan.input.id, plan]));
    for (const plan of plans) {
      const family = familyByDirective.get(plan.input.directive);
      if (!family) continue;
      const members = closedByFamily.get(family) ?? [];
      members.push(plan);
      closedByFamily.set(family, members);
    }

    for (const members of closedByFamily.values()) {
      if (!members.some(plan => plan.status !== 'converted')) continue;
      for (const plan of members) {
        if (plan.status === 'converted') {
          plansById.set(
            plan.input.id,
            contextUnverified(plan.input, 'Another member of this responsive directive family is unresolved.'),
          );
        }
      }
    }

    const visibilityIsUnresolved = plans.some(
      plan => visibilityDirectives.has(plan.input.directive) && plan.status !== 'converted',
    );
    if (visibilityIsUnresolved) {
      for (const plan of plansById.values()) {
        if (plan.status === 'converted' && plan.input.directive === 'fxLayout') {
          plansById.set(plan.input.id, displayContextUnverified(plan.input));
        }
      }
    }

    const localPlans = [...plansById.values()].filter(plan => {
      const family = familyByDirective.get(plan.input.directive);
      return family !== undefined && localDependencyFamilies.has(family);
    });
    if (localPlans.some(plan => plan.status !== 'converted')) {
      for (const plan of localPlans) {
        if (plan.status === 'converted') {
          plansById.set(
            plan.input.id,
            contextUnverified(
              plan.input,
              'The element layout context contains an unresolved dependent directive family.',
            ),
          );
        }
      }
    }

    if (!this.parentLayoutPlansAreSafe(context, plansByInputId)) {
      for (const plan of plansById.values()) {
        const family = familyByDirective.get(plan.input.directive);
        if (plan.status === 'converted' && family !== undefined && parentLayoutFamilies.has(family)) {
          plansById.set(
            plan.input.id,
            contextUnverified(plan.input, 'The responsive parent layout family contains an unresolved member.'),
          );
        }
      }
    }

    return plans.map(plan => plansById.get(plan.input.id) ?? plan);
  }

  private planSemantic(input: AdapterInput, context: ConversionContext): CssPlan {
    const family = familyByDirective.get(input.directive);
    if (!family) return targetUnsupported(input);
    if (input.binding === 'property') return dynamicBinding(input);

    if (input.directive === 'fxLayout') {
      const layout = parseLayout(input.value);
      return layout.ok
        ? { status: 'converted', input, family, declarations: renderLayoutCss(layout.value) }
        : invalid(input);
    }

    if (input.directive === 'fxLayoutGap') {
      const layout = context.activeLayout ?? staticLayoutContext(context.element.attributes);
      return fromSemantic(input, family, planLayoutGapSemantics(input.value, layout), renderLayoutGapCss);
    }

    if (input.directive === 'fxLayoutAlign') {
      const layout = context.activeLayout ?? staticLayoutContext(context.element.attributes);
      if (layout === undefined) {
        return {
          status: 'review',
          input,
          code: 'context-unverified',
          reason: 'Alignment sizing and direction depend on a dynamic or responsive layout.',
          suggestion: 'Make the layout static or migrate layout and alignment together manually.',
        };
      }
      return fromSemantic(input, family, planLayoutAlignment(input.value, layout), renderLayoutAlignmentCss);
    }

    if (flexItemDirectives.has(input.directive)) return this.planFlexItem(input, context, family);

    if (input.directive === 'fxFlexAlign') {
      return fromSemantic(input, family, planFlexAlignSemantics(input.value), renderFlexAlignCss);
    }

    if (input.directive === 'fxFlexFill' || input.directive === 'fxFill') {
      return fromSemantic(input, family, planFlexFillSemantics(), renderFlexFillCss);
    }

    if (input.directive === 'fxFlexOffset') {
      const layout = context.activeParentLayout ?? staticLayoutContext(context.parent?.attributes ?? []);
      return fromSemantic(input, family, planFlexOffsetSemantics(input.value, layout), renderFlexOffsetCss);
    }

    if (input.directive === 'fxFlexOrder') {
      return fromSemantic(input, family, planFlexOrderSemantics(input.value), renderFlexOrderCss);
    }

    return targetUnsupported(input);
  }

  private planFlexItem(input: AdapterInput, context: ConversionContext, family: CssSemanticFamily): CssPlan {
    const flexInputs = (context.inputs ?? [input]).filter(item => flexItemDirectives.has(item.directive));
    const sameBreakpoint = (item: AdapterInput) => item.breakpoint === input.breakpoint;
    const atBreakpoint = (directive: AdapterDirective) =>
      flexInputs.filter(item => item.directive === directive && sameBreakpoint(item));
    const atBase = (directive: AdapterDirective) =>
      flexInputs.filter(item => item.directive === directive && item.breakpoint === undefined);
    const exactFlex = atBreakpoint('fxFlex');
    const basis = exactFlex[0] ?? (input.breakpoint ? atBase('fxFlex')[0] : undefined);
    const exactGrow = atBreakpoint('fxGrow');
    const exactShrink = atBreakpoint('fxShrink');
    const grow = exactGrow[0] ?? (input.breakpoint ? atBase('fxGrow')[0] : undefined);
    const shrink = exactShrink[0] ?? (input.breakpoint ? atBase('fxShrink')[0] : undefined);
    const duplicateMember = [exactFlex, exactGrow, exactShrink].some(items => items.length > 1);
    if (!basis || duplicateMember) {
      return {
        status: 'invalid',
        input,
        code: 'invalid-value',
        reason: basis
          ? 'Multiple flex sizing inputs define the same responsive state.'
          : `${input.directive} requires an active fxFlex value.`,
        suggestion: 'Keep one flex sizing value per breakpoint or migrate this group manually.',
      };
    }

    const layout = context.activeParentLayout ?? staticLayoutContext(context.parent?.attributes ?? []);
    return fromSemantic(
      input,
      family,
      planFlexItemSemantics({
        basis: basis.value,
        grow: grow?.value,
        shrink: shrink?.value,
        layout,
      }),
      renderFlexItemCss,
    );
  }

  private validateBreakpoint(plan: CssPlan): CssPlan {
    if (plan.status !== 'converted' || plan.input.breakpoint === undefined) return plan;
    return this.breakpointCatalog.classify(plan.input.breakpoint).kind === 'verified'
      ? plan
      : targetUnsupported(plan.input);
  }

  private planFamily(
    inputs: readonly AdapterInput[],
    context: ConversionContext,
    validateResponsivePrecedence: boolean,
  ): readonly CssPlan[] {
    return this.validateFamily(
      inputs,
      inputs.map(input => this.planSemantic(input, context)),
      validateResponsivePrecedence,
    );
  }

  private validateFamily(
    inputs: readonly AdapterInput[],
    semanticPlans: readonly CssPlan[],
    validateResponsivePrecedence: boolean,
  ): readonly CssPlan[] {
    if (inputs.some(input => input.binding !== 'literal')) {
      return inputs.map((input, index) => {
        const semanticPlan = semanticPlans[index] ?? dynamicBinding(input);
        if (input.binding !== 'literal') return semanticPlan;
        const breakpointPlan = this.validateBreakpoint(semanticPlan);
        return breakpointPlan.status === 'unsupported'
          ? breakpointPlan
          : contextUnverified(input, 'Another member of this responsive directive family is dynamic.');
      });
    }

    const supportedPlans = semanticPlans.map(plan => this.validateBreakpoint(plan));
    if (supportedPlans.some(plan => plan.status !== 'converted')) {
      return supportedPlans.map(plan =>
        plan.status === 'converted'
          ? contextUnverified(plan.input, 'Another member of this responsive directive family is unresolved.')
          : plan,
      );
    }
    if (!validateResponsivePrecedence) return supportedPlans;

    for (let leftIndex = 0; leftIndex < inputs.length; leftIndex += 1) {
      const leftInput = inputs[leftIndex];
      const leftPlan = supportedPlans[leftIndex];
      if (!leftInput?.breakpoint || !leftPlan) continue;
      const leftClassification = this.breakpointCatalog.classify(leftInput.breakpoint);
      if (leftClassification.kind !== 'verified') continue;

      for (let rightIndex = leftIndex + 1; rightIndex < inputs.length; rightIndex += 1) {
        const rightInput = inputs[rightIndex];
        const rightPlan = supportedPlans[rightIndex];
        if (!rightInput?.breakpoint || !rightPlan) continue;
        const rightClassification = this.breakpointCatalog.classify(rightInput.breakpoint);
        if (
          rightClassification.kind === 'verified' &&
          mediaDefinitionsIntersect(leftClassification.definition.media, rightClassification.definition.media) &&
          !sameDeclarations(leftPlan, rightPlan)
        ) {
          return inputs.map(input => responsivePrecedenceUnverified(input));
        }
      }
    }
    return supportedPlans;
  }

  private planContextualFamily(
    inputs: readonly AdapterInput[],
    context: ConversionContext,
    layoutInputs: readonly AdapterInput[],
    contextKey: 'activeLayout' | 'activeParentLayout',
    validateResponsivePrecedence: boolean,
  ): readonly CssPlan[] {
    const semanticPlans = inputs.map(input => {
      if (input.binding !== 'literal') return this.planSemantic(input, context);
      const family = familyByDirective.get(input.directive);
      if (family === undefined) return targetUnsupported(input);
      const breakpointPlan = this.validateBreakpoint({
        status: 'converted',
        input,
        family,
        declarations: [],
      });
      if (breakpointPlan.status !== 'converted') return breakpointPlan;

      const layoutValues = this.layoutValuesFor(input, inputs, layoutInputs);
      if (!layoutValues.length) {
        return contextUnverified(input, 'The active responsive layout cannot be resolved for this input.');
      }
      const candidates = layoutValues.map(value => this.planSemantic(input, { ...context, [contextKey]: value }));
      const unresolved = candidates.find(candidate => candidate.status !== 'converted');
      if (unresolved) return unresolved;
      const first = candidates[0];
      if (!first || candidates.some(candidate => !sameDeclarations(first, candidate))) {
        return contextUnverified(
          input,
          'This directive emits different declarations across its active responsive layout contexts.',
        );
      }
      return first;
    });
    return this.validateFamily(inputs, semanticPlans, validateResponsivePrecedence);
  }

  private planBlockedContextFamily(
    inputs: readonly AdapterInput[],
    context: ConversionContext,
    reason: string,
  ): readonly CssPlan[] {
    return inputs.map(input => {
      if (input.binding !== 'literal') return this.planSemantic(input, context);
      const family = familyByDirective.get(input.directive);
      if (family === undefined) return targetUnsupported(input);
      const breakpointPlan = this.validateBreakpoint({
        status: 'converted',
        input,
        family,
        declarations: [],
      });
      return breakpointPlan.status === 'converted' ? contextUnverified(input, reason) : breakpointPlan;
    });
  }

  private isLayoutContextSafe(
    inputs: readonly AdapterInput[],
    context: ConversionContext,
    validateResponsivePrecedence: boolean,
  ): boolean {
    const layoutInputs = inputs.filter(input => input.directive === 'fxLayout');
    if (
      this.planFamily(layoutInputs, context, validateResponsivePrecedence).some(plan => plan.status !== 'converted')
    ) {
      return false;
    }

    return (['layout-gap', 'layout-align'] as const).every(family => {
      const familyInputs = inputs.filter(input => familyByDirective.get(input.directive) === family);
      return this.planContextualFamily(
        familyInputs,
        context,
        layoutInputs,
        'activeLayout',
        validateResponsivePrecedence,
      ).every(plan => plan.status === 'converted');
    });
  }

  private layoutValuesFor(
    input: AdapterInput,
    familyInputs: readonly AdapterInput[],
    layoutInputs: readonly AdapterInput[],
  ): readonly string[] {
    const baseLayouts = layoutInputs.filter(layout => layout.breakpoint === undefined);
    const responsiveLayouts = layoutInputs.flatMap(layout => {
      if (!layout.breakpoint) return [];
      const classification = this.breakpointCatalog.classify(layout.breakpoint);
      return classification.kind === 'verified'
        ? [{ value: layout.value, range: numericRange(classification.definition.range) }]
        : [];
    });
    const values = new Set<string>();

    for (const target of this.effectiveRanges(input, familyInputs)) {
      const activeResponsive = responsiveLayouts.filter(layout =>
        mediaRangesIntersect(mediaRange(target), mediaRange(layout.range)),
      );
      for (const layout of activeResponsive) values.add(layout.value);
      if (
        !rangesCover(
          target,
          activeResponsive.map(layout => layout.range),
        )
      ) {
        if (baseLayouts.length) {
          for (const layout of baseLayouts) values.add(layout.value);
        } else {
          values.add('row');
        }
      }
    }
    return [...values];
  }

  private effectiveRanges(input: AdapterInput, familyInputs: readonly AdapterInput[]): readonly NumericRange[] {
    if (input.breakpoint) {
      const classification = this.breakpointCatalog.classify(input.breakpoint);
      return classification.kind === 'verified' ? [numericRange(classification.definition.range)] : [];
    }

    let ranges: readonly NumericRange[] = [{ min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY }];
    for (const sibling of familyInputs) {
      if (!sibling.breakpoint || sibling.binding !== 'literal') continue;
      const classification = this.breakpointCatalog.classify(sibling.breakpoint);
      if (classification.kind !== 'verified') continue;
      const excluded = numericRange(classification.definition.range);
      ranges = ranges.flatMap(range => subtractRange(range, excluded));
    }
    return ranges;
  }

  private emit(plan: CssPlan): PlannedConversion {
    if (plan.status !== 'converted') return plan;
    if (plan.declarations.length === 0) return { status: 'converted', input: plan.input, classNames: [] };

    const rule = this.registry.register(
      plan.family,
      plan.declarations,
      cssRuleContext(this.breakpointDefinition(plan.input)),
    );
    return { status: 'converted', input: plan.input, classNames: [rule.className] };
  }

  private breakpointDefinition(input: AdapterInput): BreakpointDefinition | undefined {
    if (input.breakpoint === undefined) return undefined;
    const classification = this.breakpointCatalog.classify(input.breakpoint);
    if (classification.kind !== 'verified') {
      throw new CssInvariantError(`CSS emission received an unsupported breakpoint alias: ${input.breakpoint}`);
    }
    return classification.definition;
  }

  private parentLayoutPlansAreSafe(
    context: ConversionContext,
    plansByInputId: ReadonlyMap<string, PlannedConversion>,
  ): boolean {
    if (context.parentInputs === undefined) return true;
    const relevant = context.parentInputs.filter(input => {
      const family = familyByDirective.get(input.directive);
      return family !== undefined && localDependencyFamilies.has(family);
    });
    return relevant.every(input => {
      const plan = plansByInputId.get(input.id);
      return plan?.status === 'converted';
    });
  }
}

export class CssAdapterSession implements ConversionAdapterSession {
  readonly adapter: ConversionAdapter;
  private readonly registry = new CssArtifactRegistry();
  private finalized = false;

  constructor(_config: BreakpointMigrationConfig = { orientationBreakpoints: false }) {
    this.adapter = sessionBoundAdapter(new CssAdapter(this.registry), () => this.assertActive());
  }

  finalize(): AdapterSessionResult {
    if (this.finalized) throw new Error('Adapter session already finalized');
    this.finalized = true;
    return Object.freeze({ target: 'css' as const, rules: this.registry.rules() });
  }

  private assertActive(): void {
    if (this.finalized) throw new Error('Adapter session is finalized');
  }
}
