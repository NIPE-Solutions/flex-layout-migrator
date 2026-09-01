import type { LocatedFlexLayoutInput } from '../../../analyzer/flex-layout-attribute.analyzer';
import { BreakpointCatalog, mediaRangesIntersect, type MediaRange } from '../../../breakpoint/breakpoint-catalog';
import type { PlannedConversion } from '../../conversion-adapter';
import { describeTailwindDisplay, type TailwindActivation } from '../tailwind-class-conflict';
import { VisibilityEmitter } from './visibility.emitter';
import type { VisibilityState } from './visibility.model';
import type { VisibilityFamilyPlan } from './visibility-state.planner';
import type { VisibleDisplayResolution } from './visible-display.resolver';

export interface DisplayCompositionRequest {
  readonly visibilityPlan: VisibilityFamilyPlan;
  readonly displayResolution: VisibleDisplayResolution;
  readonly layoutPlans: readonly PlannedConversion[];
}

export type DisplayCompositionResult =
  | { readonly status: 'converted'; readonly plans: readonly PlannedConversion[] }
  | { readonly status: 'unresolved'; readonly plans: readonly PlannedConversion[] };

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

interface NumericRange {
  readonly min: number;
  readonly max: number;
}

function mediaRange(activation: TailwindActivation): MediaRange {
  return activation.kind === 'base' ? {} : activation.range;
}

function numericRange(range: MediaRange): NumericRange {
  return {
    min: range.min ?? Number.NEGATIVE_INFINITY,
    max: range.max ?? Number.POSITIVE_INFINITY,
  };
}

function rangesCover(target: MediaRange, ranges: readonly MediaRange[]): boolean {
  const numericTarget = numericRange(target);
  const clipped = ranges
    .filter(range => mediaRangesIntersect(target, range))
    .map(range => {
      const numeric = numericRange(range);
      return {
        min: Math.max(numericTarget.min, numeric.min),
        max: Math.min(numericTarget.max, numeric.max),
      };
    })
    .sort((left, right) => left.min - right.min);
  const first = clipped[0];
  if (!first || first.min !== numericTarget.min) return false;

  let coveredUntil = first.max;
  for (const range of clipped.slice(1)) {
    if (range.min > coveredUntil) return false;
    coveredUntil = Math.max(coveredUntil, range.max);
  }
  return coveredUntil >= numericTarget.max;
}

function isConvertedLayoutDisplay(className: string): boolean {
  const descriptor = describeTailwindDisplay(className);
  return (
    descriptor !== undefined &&
    (descriptor.utility === 'flex' || descriptor.utility === 'inline-flex') &&
    !descriptor.important &&
    (descriptor.activation.kind === 'media' || descriptor.token === descriptor.utility)
  );
}

function restorationUnverified(input: LocatedFlexLayoutInput, reason: string): PlannedConversion {
  return {
    status: 'review',
    input,
    code: 'display-restoration-unverified',
    reason,
    suggestion: 'Provide one unambiguous visible display value or migrate this visibility family manually.',
  };
}

function contextUnverified(input: LocatedFlexLayoutInput): PlannedConversion {
  return {
    status: 'review',
    input,
    code: 'context-unverified',
    reason: 'Partially overlapping responsive layout and visibility displays have unverified cascade precedence.',
    suggestion: 'Migrate the coupled layout and visibility ranges together manually.',
  };
}

export class DisplayCompositionPlanner {
  constructor(
    private readonly catalog = new BreakpointCatalog(),
    private readonly emitter = new VisibilityEmitter(),
  ) {}

  compose(request: DisplayCompositionRequest): DisplayCompositionResult {
    const layoutPlans = [...request.layoutPlans].sort((left, right) => this.compareInputs(left.input, right.input));
    if (request.visibilityPlan.status === 'unresolved') {
      return {
        status: 'unresolved',
        plans: [
          ...layoutPlans,
          ...[...request.visibilityPlan.plans].sort((left, right) => this.compareInputs(left.input, right.input)),
        ],
      };
    }

    const states = [...request.visibilityPlan.states].sort((left, right) => this.compareStates(left, right));
    const displayResolution = request.displayResolution;
    if (displayResolution.status === 'unverified') {
      return {
        status: 'unresolved',
        plans: [...layoutPlans, ...states.map(state => restorationUnverified(state.input, displayResolution.reason))],
      };
    }

    if (this.hasUnsafePartialOverlap(layoutPlans, states)) {
      return {
        status: 'unresolved',
        plans: [
          ...layoutPlans.map(plan =>
            plan.status === 'converted' && plan.input.directive === 'fxLayout' ? contextUnverified(plan.input) : plan,
          ),
          ...states.map(state => contextUnverified(state.input)),
        ],
      };
    }

    const composedLayouts = layoutPlans.map(plan => this.composeLayout(plan, states));
    const visibilityClassNames = [
      ...new Set(states.flatMap(state => this.emitter.emit(state, displayResolution.utility))),
    ];
    const visibilityPlans = states.map((state, index): PlannedConversion => ({
      status: 'converted',
      input: state.input,
      classNames: index === 0 ? visibilityClassNames : [],
    }));
    const plans = [...composedLayouts, ...visibilityPlans];
    return {
      status: plans.every(plan => plan.status === 'converted') ? 'converted' : 'unresolved',
      plans,
    };
  }

  private hasUnsafePartialOverlap(
    layoutPlans: readonly PlannedConversion[],
    states: readonly VisibilityState[],
  ): boolean {
    const baseIsHidden = states.some(state => state.activation.kind === 'base' && state.intent === 'hidden');
    if (baseIsHidden) return false;

    const hiddenRanges = states.flatMap(state =>
      state.intent === 'hidden' && state.activation.kind === 'media' ? [state.activation.definition.range] : [],
    );
    if (!hiddenRanges.length) return false;

    return layoutPlans.some(plan => {
      if (plan.status !== 'converted' || plan.input.directive !== 'fxLayout') return false;
      return plan.classNames.some(className => {
        if (!isConvertedLayoutDisplay(className)) return false;
        const descriptor = describeTailwindDisplay(className);
        if (!descriptor || descriptor.activation.kind !== 'media') return false;
        const target = descriptor.activation.range;
        return hiddenRanges.some(range => mediaRangesIntersect(target, range)) && !rangesCover(target, hiddenRanges);
      });
    });
  }

  private composeLayout(plan: PlannedConversion, states: readonly VisibilityState[]): PlannedConversion {
    if (plan.status !== 'converted' || plan.input.directive !== 'fxLayout') return plan;
    return {
      ...plan,
      classNames: plan.classNames.filter(className => !this.visibilityOwnsHiddenActivation(className, states)),
    };
  }

  private visibilityOwnsHiddenActivation(className: string, states: readonly VisibilityState[]): boolean {
    if (!isConvertedLayoutDisplay(className)) return false;
    const descriptor = describeTailwindDisplay(className);
    if (!descriptor) return false;
    const target = mediaRange(descriptor.activation);
    const baseStates = states.filter(state => state.activation.kind === 'base');
    const responsiveStates = states.filter(
      (state): state is VisibilityState & { readonly activation: { readonly kind: 'media' } } =>
        state.activation.kind === 'media',
    );
    const baseIsHidden = baseStates.length > 0 && baseStates.every(state => state.intent === 'hidden');
    if (baseIsHidden) {
      return !responsiveStates.some(
        state => state.intent === 'shown' && mediaRangesIntersect(target, state.activation.definition.range),
      );
    }

    return rangesCover(
      target,
      responsiveStates.filter(state => state.intent === 'hidden').map(state => state.activation.definition.range),
    );
  }

  private compareStates(left: VisibilityState, right: VisibilityState): number {
    if (left.activation.kind === 'base' && right.activation.kind !== 'base') return -1;
    if (left.activation.kind !== 'base' && right.activation.kind === 'base') return 1;
    if (left.activation.kind === 'media' && right.activation.kind === 'media') {
      if (left.activation.definition.priority !== right.activation.definition.priority) {
        return right.activation.definition.priority - left.activation.definition.priority;
      }
      const aliasOrder = compareText(left.activation.definition.alias, right.activation.definition.alias);
      if (aliasOrder) return aliasOrder;
    }
    return compareText(left.input.id, right.input.id);
  }

  private compareInputs(left: LocatedFlexLayoutInput, right: LocatedFlexLayoutInput): number {
    const leftIsBase = left.breakpoint === undefined;
    const rightIsBase = right.breakpoint === undefined;
    if (leftIsBase && !rightIsBase) return -1;
    if (!leftIsBase && rightIsBase) return 1;

    const leftPriority = this.breakpointPriority(left.breakpoint);
    const rightPriority = this.breakpointPriority(right.breakpoint);
    if (leftPriority !== rightPriority) return rightPriority - leftPriority;

    const aliasOrder = compareText(left.breakpoint ?? '', right.breakpoint ?? '');
    return aliasOrder || compareText(left.id, right.id);
  }

  private breakpointPriority(alias: string | undefined): number {
    if (alias === undefined) return Number.POSITIVE_INFINITY;
    const classification = this.catalog.classify(alias);
    return classification.kind === 'verified' ? classification.definition.priority : Number.NEGATIVE_INFINITY;
  }
}
