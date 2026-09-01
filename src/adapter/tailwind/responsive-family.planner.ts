import type { LocatedFlexLayoutInput } from '../../analyzer/flex-layout-attribute.analyzer';
import { BreakpointCatalog, mediaRangesIntersect, type MediaRange } from '../../breakpoint/breakpoint-catalog';
import type { ConversionContext, PlannedConversion } from '../conversion-adapter';
import { planResponsiveClasses } from './responsive-plan';
import { ResponsiveVariantEmitter } from './responsive-variant.emitter';
import type { TailwindStrategyResult } from './tailwind-semantic.model';

export type DirectiveFamily =
  | 'layout'
  | 'layout-gap'
  | 'layout-align'
  | 'flex-item'
  | 'flex-align'
  | 'flex-fill'
  | 'flex-offset'
  | 'flex-order'
  | 'visibility'
  | 'extended-class'
  | 'extended-style';

export type PlanOne = (input: LocatedFlexLayoutInput, context: ConversionContext) => PlannedConversion;
export type PlanExtendedFamily = (
  family: 'extended-class' | 'extended-style',
  inputs: readonly LocatedFlexLayoutInput[],
  context: ConversionContext,
) => readonly PlannedConversion[];

const familyByDirective = new Map<LocatedFlexLayoutInput['directive'], DirectiveFamily>([
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
  ['fxShow', 'visibility'],
  ['fxHide', 'visibility'],
  ['class', 'extended-class'],
  ['ngClass', 'extended-class'],
  ['style', 'extended-style'],
  ['ngStyle', 'extended-style'],
]);

const localLayoutDependents = new Set<DirectiveFamily>(['layout-gap', 'layout-align']);
const parentLayoutDependents = new Set<DirectiveFamily>(['flex-item', 'flex-offset']);

interface NumericRange {
  readonly min: number;
  readonly max: number;
}

function converted(input: LocatedFlexLayoutInput, classNames: readonly string[]): PlannedConversion {
  return { status: 'converted', input, classNames };
}

function fromStrategyResult(input: LocatedFlexLayoutInput, result: TailwindStrategyResult): PlannedConversion {
  if (result.status === 'converted') return converted(input, result.classNames);
  if (result.status === 'invalid') {
    return {
      status: 'invalid',
      input,
      code: result.code,
      reason: `${input.value} is not a supported ${input.directive} value.`,
      suggestion: 'Correct the value or migrate this directive manually.',
    };
  }
  return { ...result, input };
}

function contextUnverified(input: LocatedFlexLayoutInput, reason: string): PlannedConversion {
  return {
    status: 'review',
    input,
    code: 'context-unverified',
    reason,
    suggestion: 'Migrate the responsive context and its dependent directive families together manually.',
  };
}

function canonicalClasses(plan: PlannedConversion): readonly string[] | undefined {
  return plan.status === 'converted' ? [...new Set(plan.classNames)].sort() : undefined;
}

function sameClasses(left: PlannedConversion, right: PlannedConversion): boolean {
  const leftClasses = canonicalClasses(left);
  const rightClasses = canonicalClasses(right);
  return (
    leftClasses !== undefined &&
    rightClasses !== undefined &&
    leftClasses.length === rightClasses.length &&
    leftClasses.every((className, index) => className === rightClasses[index])
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

function effectiveRanges(
  input: LocatedFlexLayoutInput,
  familyInputs: readonly LocatedFlexLayoutInput[],
  catalog: BreakpointCatalog,
): readonly NumericRange[] {
  if (input.breakpoint) {
    const classification = catalog.classify(input.breakpoint);
    return classification.kind === 'verified' ? [numericRange(classification.definition.range)] : [];
  }

  let ranges: readonly NumericRange[] = [{ min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY }];
  for (const sibling of familyInputs) {
    if (!sibling.breakpoint || sibling.binding !== 'literal') continue;
    const classification = catalog.classify(sibling.breakpoint);
    if (classification.kind !== 'verified') continue;
    const excluded = numericRange(classification.definition.range);
    ranges = ranges.flatMap(range => subtractRange(range, excluded));
  }
  return ranges;
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

export class ResponsiveFamilyPlanner {
  constructor(
    private readonly catalog = new BreakpointCatalog(),
    private readonly emitter = new ResponsiveVariantEmitter(),
  ) {}

  plan(
    inputs: readonly LocatedFlexLayoutInput[],
    context: ConversionContext,
    planOne: PlanOne,
    planExtendedFamily?: PlanExtendedFamily,
  ): readonly PlannedConversion[] {
    return this.planWithDependencies(inputs, context, planOne, true, true, planExtendedFamily);
  }

  closeDependencies(
    inputs: readonly LocatedFlexLayoutInput[],
    context: ConversionContext,
    planOne: PlanOne,
  ): readonly PlannedConversion[] {
    return this.planWithDependencies(inputs, context, planOne, false, false);
  }

  private planWithDependencies(
    inputs: readonly LocatedFlexLayoutInput[],
    context: ConversionContext,
    planOne: PlanOne,
    decorate: boolean,
    validateResponsivePrecedence: boolean,
    planExtendedFamily?: PlanExtendedFamily,
  ): readonly PlannedConversion[] {
    const groups = new Map<DirectiveFamily, LocatedFlexLayoutInput[]>();
    const ungrouped: LocatedFlexLayoutInput[] = [];
    for (const input of inputs) {
      const family = familyByDirective.get(input.directive);
      if (!family) {
        ungrouped.push(input);
        continue;
      }
      const members = groups.get(family) ?? [];
      members.push(input);
      groups.set(family, members);
    }

    const completeContext: ConversionContext = { ...context, inputs };
    const rawPlansByFamily = new Map<DirectiveFamily, readonly PlannedConversion[]>();
    const layoutInputs = groups.get('layout') ?? [];
    const layoutPlans = this.planFamily(layoutInputs, completeContext, planOne, validateResponsivePrecedence);
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
        planOne,
        validateResponsivePrecedence,
      );
    const localLayoutSafe = layoutPlans.every(plan => plan.status === 'converted');

    for (const [family, familyInputs] of groups) {
      if (family === 'layout') continue;

      let plans: readonly PlannedConversion[];
      if ((family === 'extended-class' || family === 'extended-style') && planExtendedFamily) {
        plans = planExtendedFamily(family, familyInputs, completeContext);
      } else if (localLayoutDependents.has(family)) {
        plans = localLayoutSafe
          ? this.planContextualFamily(
              familyInputs,
              completeContext,
              layoutInputs,
              'activeLayout',
              planOne,
              validateResponsivePrecedence,
            )
          : this.planBlockedContextFamily(
              familyInputs,
              completeContext,
              planOne,
              'The responsive layout family contains an unresolved member.',
              !validateResponsivePrecedence,
            );
      } else if (parentLayoutDependents.has(family)) {
        plans = parentLayoutSafe
          ? this.planContextualFamily(
              familyInputs,
              completeContext,
              parentLayoutInputs ?? [],
              'activeParentLayout',
              planOne,
              validateResponsivePrecedence,
            )
          : this.planBlockedContextFamily(
              familyInputs,
              completeContext,
              planOne,
              'The responsive parent layout family contains an unresolved member.',
              !validateResponsivePrecedence,
            );
      } else {
        plans = this.planFamily(familyInputs, completeContext, planOne, validateResponsivePrecedence);
      }
      rawPlansByFamily.set(family, plans);
    }

    const localFamilies = ['layout', 'layout-gap', 'layout-align'] as const;
    const localContextUnresolved = localFamilies.some(family =>
      rawPlansByFamily.get(family)?.some(plan => plan.status !== 'converted'),
    );
    if (localContextUnresolved) {
      for (const family of localFamilies) {
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
    for (const [family, plans] of rawPlansByFamily) {
      const shouldDecorate = decorate && family !== 'extended-class' && family !== 'extended-style';
      for (const plan of plans) plansById.set(plan.input.id, shouldDecorate ? this.decorate(plan) : plan);
    }
    for (const input of ungrouped) {
      const plan = planOne(input, completeContext);
      plansById.set(input.id, decorate ? this.decorate(plan) : plan);
    }
    return inputs.map(input => {
      const planned = plansById.get(input.id);
      if (planned) return planned;
      const plan = planOne(input, completeContext);
      return decorate ? this.decorate(plan) : plan;
    });
  }

  private planContextualFamily(
    inputs: readonly LocatedFlexLayoutInput[],
    context: ConversionContext,
    layoutInputs: readonly LocatedFlexLayoutInput[],
    contextKey: 'activeLayout' | 'activeParentLayout',
    planOne: PlanOne,
    validateResponsivePrecedence: boolean,
  ): readonly PlannedConversion[] {
    const semanticPlans = inputs.map(input => {
      const breakpointPlan = this.planBreakpoint(input, context, planOne);
      if (breakpointPlan.status !== 'converted') return breakpointPlan;
      const layoutValues = this.layoutValuesFor(input, inputs, layoutInputs);
      if (!layoutValues.length) {
        return contextUnverified(input, 'The active responsive layout cannot be resolved for this input.');
      }
      const candidates = layoutValues.map(value => planOne(input, { ...context, [contextKey]: value }));
      const unresolved = candidates.find(candidate => candidate.status !== 'converted');
      if (unresolved) return unresolved;
      const first = candidates[0];
      if (!first || candidates.some(candidate => !sameClasses(first, candidate))) {
        return contextUnverified(
          input,
          'This directive emits different utilities across its active responsive layout contexts.',
        );
      }
      return first;
    });
    return this.validateFamily(inputs, semanticPlans, validateResponsivePrecedence);
  }

  private isLayoutContextSafe(
    inputs: readonly LocatedFlexLayoutInput[],
    context: ConversionContext,
    planOne: PlanOne,
    validateResponsivePrecedence: boolean,
  ): boolean {
    const layoutInputs = inputs.filter(input => input.directive === 'fxLayout');
    if (
      this.planFamily(layoutInputs, context, planOne, validateResponsivePrecedence).some(
        plan => plan.status !== 'converted',
      )
    ) {
      return false;
    }

    return (['fxLayoutGap', 'fxLayoutAlign'] as const).every(directive => {
      const familyInputs = inputs.filter(input => input.directive === directive);
      return this.planContextualFamily(
        familyInputs,
        context,
        layoutInputs,
        'activeLayout',
        planOne,
        validateResponsivePrecedence,
      ).every(plan => plan.status === 'converted');
    });
  }

  private planBlockedContextFamily(
    inputs: readonly LocatedFlexLayoutInput[],
    context: ConversionContext,
    planOne: PlanOne,
    reason: string,
    preserveExistingDiagnostics = false,
  ): readonly PlannedConversion[] {
    return inputs.map(input => {
      const breakpointPlan = this.planBreakpoint(input, context, planOne);
      if (breakpointPlan.status !== 'converted') return breakpointPlan;
      const existingPlan = preserveExistingDiagnostics ? planOne(input, context) : breakpointPlan;
      return existingPlan.status === 'converted' ? contextUnverified(input, reason) : existingPlan;
    });
  }

  private planBreakpoint(
    input: LocatedFlexLayoutInput,
    context: ConversionContext,
    planOne: PlanOne,
  ): PlannedConversion {
    return input.binding === 'literal' ? this.validateBreakpoint(converted(input, [])) : planOne(input, context);
  }

  private layoutValuesFor(
    input: LocatedFlexLayoutInput,
    familyInputs: readonly LocatedFlexLayoutInput[],
    layoutInputs: readonly LocatedFlexLayoutInput[],
  ): readonly string[] {
    const baseLayouts = layoutInputs.filter(layout => !layout.breakpoint);
    const responsiveLayouts = layoutInputs.flatMap(layout => {
      if (!layout.breakpoint) return [];
      const classification = this.catalog.classify(layout.breakpoint);
      return classification.kind === 'verified'
        ? [{ value: layout.value, range: numericRange(classification.definition.range) }]
        : [];
    });
    const values = new Set<string>();

    for (const target of effectiveRanges(input, familyInputs, this.catalog)) {
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

  private planFamily(
    inputs: readonly LocatedFlexLayoutInput[],
    context: ConversionContext,
    planOne: PlanOne,
    validateResponsivePrecedence: boolean,
  ): readonly PlannedConversion[] {
    return this.validateFamily(
      inputs,
      inputs.map(input => planOne(input, context)),
      validateResponsivePrecedence,
    );
  }

  private validateFamily(
    inputs: readonly LocatedFlexLayoutInput[],
    semanticPlans: readonly PlannedConversion[],
    validateResponsivePrecedence: boolean,
  ): readonly PlannedConversion[] {
    if (inputs.some(input => input.binding !== 'literal')) {
      return inputs.map((input, index) => {
        const semanticPlan =
          semanticPlans[index] ??
          contextUnverified(input, 'The dynamic member of this directive family cannot be planned.');
        if (input.binding !== 'literal') return semanticPlan;
        const breakpointPlan = this.validateBreakpoint(semanticPlan);
        if (
          breakpointPlan.status !== 'converted' &&
          (breakpointPlan.code === 'breakpoint-unverified' || breakpointPlan.code === 'custom-breakpoint')
        ) {
          return breakpointPlan;
        }
        return contextUnverified(input, 'Another member of this responsive directive family is dynamic.');
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
      const leftClassification = this.catalog.classify(leftInput.breakpoint);
      if (leftClassification.kind !== 'verified') continue;

      for (let rightIndex = leftIndex + 1; rightIndex < inputs.length; rightIndex += 1) {
        const rightInput = inputs[rightIndex];
        const rightPlan = supportedPlans[rightIndex];
        if (!rightInput?.breakpoint || !rightPlan) continue;
        const rightClassification = this.catalog.classify(rightInput.breakpoint);
        if (
          rightClassification.kind === 'verified' &&
          mediaRangesIntersect(leftClassification.definition.range, rightClassification.definition.range) &&
          !sameClasses(leftPlan, rightPlan)
        ) {
          return inputs.map(input => ({
            status: 'review',
            input,
            code: 'responsive-precedence-unverified',
            reason: 'Overlapping responsive ranges emit different utilities for the same directive family.',
            suggestion: 'Simplify the overlapping declarations or migrate this directive family manually.',
          }));
        }
      }
    }
    return supportedPlans;
  }

  private validateBreakpoint(plan: PlannedConversion): PlannedConversion {
    if (plan.status !== 'converted' || !plan.input.breakpoint) return plan;
    const classification = this.catalog.classify(plan.input.breakpoint);
    if (classification.kind === 'verified') return plan;
    const result = planResponsiveClasses(plan.input, plan.classNames, this.catalog, this.emitter);
    return result.status === 'converted' ? plan : fromStrategyResult(plan.input, result);
  }

  private decorate(plan: PlannedConversion): PlannedConversion {
    if (plan.status !== 'converted') return plan;
    const result = planResponsiveClasses(plan.input, plan.classNames, this.catalog, this.emitter);
    return fromStrategyResult(plan.input, result);
  }
}
