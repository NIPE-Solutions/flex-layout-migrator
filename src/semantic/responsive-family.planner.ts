import type { LocatedFlexLayoutInput } from '../analyzer/flex-layout-attribute.analyzer';
import {
  BreakpointCatalog,
  mediaDefinitionsIntersect,
  mediaRangesIntersect,
  type MediaRange,
} from '../breakpoint/breakpoint-catalog';
import type { SemanticConversionContext } from './conversion-context';
import type { DirectiveFamily } from './semantic-plan';

export type { DirectiveFamily } from './semantic-plan';

export interface ResponsiveOrchestrationPlan {
  readonly status: 'converted' | 'review' | 'unsupported' | 'invalid';
  readonly input: LocatedFlexLayoutInput;
}

export type ResponsivePlanOne<TPlan extends ResponsiveOrchestrationPlan> = (
  input: LocatedFlexLayoutInput,
  context: SemanticConversionContext,
) => TPlan;

export type ResponsivePlanExtendedFamily<TPlan extends ResponsiveOrchestrationPlan> = (
  family: 'extended-class' | 'extended-style',
  inputs: readonly LocatedFlexLayoutInput[],
  context: SemanticConversionContext,
) => readonly TPlan[];

export interface SemanticTargetPolicy<TPlan extends ResponsiveOrchestrationPlan> {
  emptyPlan(input: LocatedFlexLayoutInput): TPlan;
  targetEligibility(input: LocatedFlexLayoutInput): TPlan | undefined;
  validateActivation(plan: TPlan): TPlan;
  isTargetEligibilityFailure(plan: TPlan): boolean;
  sameOutput(left: TPlan, right: TPlan): boolean;
  contextUnverified(input: LocatedFlexLayoutInput, reason: string): TPlan;
  contextualOutputUnverified(input: LocatedFlexLayoutInput): TPlan;
  responsivePrecedenceUnverified(input: LocatedFlexLayoutInput): TPlan;
  decorate(plan: TPlan): TPlan;
  addPrintFallback(plan: TPlan): TPlan;
}

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
  ['gdAlignColumns', 'grid-align-columns'],
  ['gdAlignRows', 'grid-align-rows'],
  ['gdArea', 'grid-area'],
  ['gdAreas', 'grid-areas'],
  ['gdAuto', 'grid-auto'],
  ['gdColumn', 'grid-column'],
  ['gdColumns', 'grid-columns'],
  ['gdGap', 'grid-gap'],
  ['gdGridAlign', 'grid-align'],
  ['gdInline', 'grid-inline'],
  ['gdRow', 'grid-row'],
  ['gdRows', 'grid-rows'],
]);

const localLayoutDependents = new Set<DirectiveFamily>(['layout-gap', 'layout-align']);
const parentLayoutDependents = new Set<DirectiveFamily>(['flex-item', 'flex-offset']);

interface NumericRange {
  readonly min: number;
  readonly max: number;
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

export class ResponsiveFamilyPlanner<TPlan extends ResponsiveOrchestrationPlan> {
  constructor(
    private readonly catalog: BreakpointCatalog,
    private readonly policy: SemanticTargetPolicy<TPlan>,
  ) {}

  plan(
    inputs: readonly LocatedFlexLayoutInput[],
    context: SemanticConversionContext,
    planOne: ResponsivePlanOne<TPlan>,
    planExtendedFamily?: ResponsivePlanExtendedFamily<TPlan>,
  ): readonly TPlan[] {
    return this.planWithDependencies(inputs, context, planOne, true, true, planExtendedFamily);
  }

  closeDependencies(
    inputs: readonly LocatedFlexLayoutInput[],
    context: SemanticConversionContext,
    planOne: ResponsivePlanOne<TPlan>,
  ): readonly TPlan[] {
    return this.planWithDependencies(inputs, context, planOne, false, false);
  }

  private planWithDependencies(
    inputs: readonly LocatedFlexLayoutInput[],
    context: SemanticConversionContext,
    planOne: ResponsivePlanOne<TPlan>,
    decorate: boolean,
    validateResponsivePrecedence: boolean,
    planExtendedFamily?: ResponsivePlanExtendedFamily<TPlan>,
  ): readonly TPlan[] {
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

    const completeContext: SemanticConversionContext = { ...context, inputs };
    const rawPlansByFamily = new Map<DirectiveFamily, readonly TPlan[]>();
    const layoutInputs = groups.get('layout') ?? [];
    const layoutPlans = this.planFamily(layoutInputs, completeContext, planOne, validateResponsivePrecedence);
    if (layoutInputs.length) rawPlansByFamily.set('layout', layoutPlans);

    const parentLayoutInputs = context.parentInputs.filter(input => input.directive === 'fxLayout');
    const parentLayoutSafe = this.isLayoutContextSafe(
      context.parentInputs,
      {
        ...context,
        element: context.parent ?? context.element,
        inputs: context.parentInputs,
        parent: undefined,
        parentInputs: [],
      },
      planOne,
      validateResponsivePrecedence,
    );
    const localLayoutSafe = layoutPlans.every(plan => plan.status === 'converted');

    for (const [family, familyInputs] of groups) {
      if (family === 'layout') continue;

      let plans: readonly TPlan[];
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
              parentLayoutInputs,
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
              ? this.policy.contextUnverified(
                  plan.input,
                  'The element layout context contains an unresolved dependent directive family.',
                )
              : plan,
          ),
        );
      }
    }

    const plansById = new Map<string, TPlan>();
    for (const [family, plans] of rawPlansByFamily) {
      const shouldDecorate = decorate && family !== 'extended-class' && family !== 'extended-style';
      const decoratedPlans = plans.map(plan => (shouldDecorate ? this.policy.decorate(plan) : plan));
      const printAwarePlans = decorate
        ? this.addPrintFallback(groups.get(family) ?? [], decoratedPlans)
        : decoratedPlans;
      for (const plan of printAwarePlans) plansById.set(plan.input.id, plan);
    }
    for (const input of ungrouped) {
      const plan = this.planOneWithEligibility(input, completeContext, planOne);
      plansById.set(input.id, decorate ? this.policy.decorate(plan) : plan);
    }
    return inputs.map(input => {
      const planned = plansById.get(input.id);
      if (planned) return planned;
      const plan = this.planOneWithEligibility(input, completeContext, planOne);
      return decorate ? this.policy.decorate(plan) : plan;
    });
  }

  private addPrintFallback(inputs: readonly LocatedFlexLayoutInput[], plans: readonly TPlan[]): readonly TPlan[] {
    const configuredAliases = this.catalog.printWithBreakpoints;
    if (configuredAliases === undefined || plans.some(plan => plan.status !== 'converted')) return plans;
    if (inputs.some(input => input.breakpoint === 'print')) return plans;

    const configured = inputs
      .map((input, index) => ({
        input,
        index,
        classification: input.breakpoint === undefined ? undefined : this.catalog.classify(input.breakpoint),
      }))
      .filter(
        (
          item,
        ): item is typeof item & {
          readonly classification: Extract<ReturnType<BreakpointCatalog['classify']>, { readonly kind: 'verified' }>;
        } =>
          item.input.breakpoint !== undefined &&
          configuredAliases.includes(item.input.breakpoint) &&
          item.classification !== undefined &&
          item.classification.kind === 'verified',
      )
      .sort(
        (left, right) =>
          right.classification.definition.priority - left.classification.definition.priority ||
          configuredAliases.indexOf(left.input.breakpoint ?? '') -
            configuredAliases.indexOf(right.input.breakpoint ?? ''),
      );
    const selected = configured[0];
    if (!selected) return plans;

    return plans.map((plan, index) =>
      index === selected.index && plan.status === 'converted' ? this.policy.addPrintFallback(plan) : plan,
    );
  }

  private planContextualFamily(
    inputs: readonly LocatedFlexLayoutInput[],
    context: SemanticConversionContext,
    layoutInputs: readonly LocatedFlexLayoutInput[],
    contextKey: 'activeLayout' | 'activeParentLayout',
    planOne: ResponsivePlanOne<TPlan>,
    validateResponsivePrecedence: boolean,
  ): readonly TPlan[] {
    const semanticPlans = inputs.map(input => {
      const breakpointPlan = this.planBreakpoint(input, context, planOne);
      if (breakpointPlan.status !== 'converted') return breakpointPlan;
      const layoutValues = this.layoutValuesFor(input, inputs, layoutInputs);
      if (!layoutValues.length) {
        return this.policy.contextUnverified(input, 'The active responsive layout cannot be resolved for this input.');
      }
      const candidates = layoutValues.map(value => planOne(input, { ...context, [contextKey]: value }));
      const unresolved = candidates.find(candidate => candidate.status !== 'converted');
      if (unresolved) return unresolved;
      const first = candidates[0];
      if (!first || candidates.some(candidate => !this.policy.sameOutput(first, candidate))) {
        return this.policy.contextualOutputUnverified(input);
      }
      return first;
    });
    return this.validateFamily(inputs, semanticPlans, validateResponsivePrecedence);
  }

  private isLayoutContextSafe(
    inputs: readonly LocatedFlexLayoutInput[],
    context: SemanticConversionContext,
    planOne: ResponsivePlanOne<TPlan>,
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
    context: SemanticConversionContext,
    planOne: ResponsivePlanOne<TPlan>,
    reason: string,
    preserveExistingDiagnostics = false,
  ): readonly TPlan[] {
    return inputs.map(input => {
      const breakpointPlan = this.planBreakpoint(input, context, planOne);
      if (breakpointPlan.status !== 'converted') return breakpointPlan;
      const existingPlan = preserveExistingDiagnostics
        ? this.planOneWithEligibility(input, context, planOne)
        : breakpointPlan;
      return existingPlan.status === 'converted' ? this.policy.contextUnverified(input, reason) : existingPlan;
    });
  }

  private planBreakpoint(
    input: LocatedFlexLayoutInput,
    context: SemanticConversionContext,
    planOne: ResponsivePlanOne<TPlan>,
  ): TPlan {
    const eligibility = this.policy.targetEligibility(input);
    if (eligibility) return eligibility;
    return input.binding === 'literal'
      ? this.policy.validateActivation(this.policy.emptyPlan(input))
      : planOne(input, context);
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
    context: SemanticConversionContext,
    planOne: ResponsivePlanOne<TPlan>,
    validateResponsivePrecedence: boolean,
  ): readonly TPlan[] {
    return this.validateFamily(
      inputs,
      inputs.map(input => this.planOneWithEligibility(input, context, planOne)),
      validateResponsivePrecedence,
    );
  }

  private validateFamily(
    inputs: readonly LocatedFlexLayoutInput[],
    semanticPlans: readonly TPlan[],
    validateResponsivePrecedence: boolean,
  ): readonly TPlan[] {
    if (inputs.some(input => input.binding !== 'literal')) {
      return inputs.map((input, index) => {
        const semanticPlan =
          semanticPlans[index] ??
          this.policy.contextUnverified(input, 'The dynamic member of this directive family cannot be planned.');
        if (input.binding !== 'literal') return semanticPlan;
        const breakpointPlan = this.policy.validateActivation(semanticPlan);
        if (this.policy.isTargetEligibilityFailure(breakpointPlan)) return breakpointPlan;
        return this.policy.contextUnverified(input, 'Another member of this responsive directive family is dynamic.');
      });
    }

    const supportedPlans = semanticPlans.map(plan => this.policy.validateActivation(plan));
    if (supportedPlans.some(plan => plan.status !== 'converted')) {
      return supportedPlans.map(plan =>
        plan.status === 'converted'
          ? this.policy.contextUnverified(
              plan.input,
              'Another member of this responsive directive family is unresolved.',
            )
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
          mediaDefinitionsIntersect(leftClassification.definition.media, rightClassification.definition.media) &&
          !this.policy.sameOutput(leftPlan, rightPlan)
        ) {
          return inputs.map(input => this.policy.responsivePrecedenceUnverified(input));
        }
      }
    }
    return supportedPlans;
  }

  private planOneWithEligibility(
    input: LocatedFlexLayoutInput,
    context: SemanticConversionContext,
    planOne: ResponsivePlanOne<TPlan>,
  ): TPlan {
    return this.policy.targetEligibility(input) ?? planOne(input, context);
  }
}
