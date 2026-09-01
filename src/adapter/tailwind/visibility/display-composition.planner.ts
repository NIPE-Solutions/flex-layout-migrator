import type { LocatedFlexLayoutInput } from '../../../analyzer/flex-layout-attribute.analyzer';
import { BreakpointCatalog } from '../../../breakpoint/breakpoint-catalog';
import type { PlannedConversion } from '../../conversion-adapter';
import { describeTailwindDisplay, type TailwindActivation } from '../tailwind-class-conflict';
import { VisibilityEmitter } from './visibility.emitter';
import type { VisibilityActivation, VisibilityState } from './visibility.model';
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

function sameActivation(left: TailwindActivation, right: VisibilityActivation): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'base' || right.kind === 'base') return true;
  return left.range.min === right.definition.range.min && left.range.max === right.definition.range.max;
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
    const matchingStates = states.filter(state => sameActivation(descriptor.activation, state.activation));
    return matchingStates.length > 0 && matchingStates.every(state => state.intent === 'hidden');
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
