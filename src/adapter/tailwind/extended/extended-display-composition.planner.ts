import type { LocatedFlexLayoutInput } from '../../../analyzer/flex-layout-attribute.analyzer';
import { BreakpointCatalog, mediaRangesIntersect, type MediaRange } from '../../../breakpoint/breakpoint-catalog';
import type { PlannedConversion } from '../../conversion-adapter';
import {
  describeTailwindDisplay,
  type TailwindActivation,
  type TailwindDisplayUtility,
} from '../tailwind-class-conflict';
import { parseLiteralStyleDeclarations } from '../visibility/literal-style-display';
import type { VisibilityState } from '../visibility/visibility.model';
import type { VisibilityFamilyPlan } from '../visibility/visibility-state.planner';
import type { VisibleDisplayResolution } from '../visibility/visible-display.resolver';
import { TailwindCandidateClassifier } from './tailwind-candidate-classifier';

const extendedClassDirectives = new Set<LocatedFlexLayoutInput['directive']>(['class', 'ngClass']);
const extendedStyleDirectives = new Set<LocatedFlexLayoutInput['directive']>(['style', 'ngStyle']);
const extendedDirectives = new Set<LocatedFlexLayoutInput['directive']>([
  ...extendedClassDirectives,
  ...extendedStyleDirectives,
]);
const visibleDisplayUtilities = new Set([
  'inline',
  'block',
  'inline-block',
  'flow-root',
  'flex',
  'inline-flex',
  'grid',
  'inline-grid',
  'contents',
  'table',
  'inline-table',
  'table-caption',
  'table-cell',
  'table-column',
  'table-column-group',
  'table-footer-group',
  'table-header-group',
  'table-row-group',
  'table-row',
  'list-item',
]);

interface NumericRange {
  readonly min: number;
  readonly max: number;
}

export interface ExtendedDisplayComposition {
  readonly strategyPlans: readonly PlannedConversion[];
  readonly visibilityPlan: VisibilityFamilyPlan;
}

function activationRange(activation: TailwindActivation): MediaRange {
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

function sameRange(left: MediaRange, right: MediaRange): boolean {
  return left.min === right.min && left.max === right.max;
}

function displayIntent(descriptor: TailwindDisplayUtility): 'hidden' | 'shown' | 'unverified' {
  if (descriptor.utility === 'hidden') return 'hidden';
  if (visibleDisplayUtilities.has(descriptor.utility)) return 'shown';

  const arbitraryValue = descriptor.utility.match(/^\[display:([^\]]+)\]$/u)?.[1];
  if (arbitraryValue === 'none') return 'hidden';
  return arbitraryValue !== undefined && visibleDisplayUtilities.has(arbitraryValue) ? 'shown' : 'unverified';
}

function contextUnverified(input: LocatedFlexLayoutInput, reason: string): PlannedConversion {
  return {
    status: 'review',
    input,
    code: 'context-unverified',
    reason,
    suggestion: 'Migrate the coupled display-producing families together manually.',
  };
}

export class ExtendedDisplayCompositionPlanner {
  constructor(
    private readonly breakpointCatalog = new BreakpointCatalog(),
    private readonly classifier = new TailwindCandidateClassifier(),
  ) {}

  composeWithLayout(plans: readonly PlannedConversion[]): readonly PlannedConversion[] {
    const extendedComposed = this.composeExtendedFamilies(plans);
    const layoutPlans = extendedComposed.filter(plan => plan.input.directive === 'fxLayout');
    const layoutRanges = layoutPlans
      .filter(
        (plan): plan is Extract<PlannedConversion, { readonly status: 'converted' }> => plan.status === 'converted',
      )
      .flatMap(plan =>
        plan.classNames.flatMap(className => {
          const descriptor = describeTailwindDisplay(className);
          return descriptor !== undefined &&
            !descriptor.important &&
            (descriptor.utility === 'flex' || descriptor.utility === 'inline-flex')
            ? [activationRange(descriptor.activation)]
            : [];
        }),
      );
    const unresolvedLayout = layoutPlans.some(plan => plan.status !== 'converted');
    const unresolvedExtendedDisplay = extendedComposed.some(
      plan =>
        extendedDirectives.has(plan.input.directive) &&
        plan.status !== 'converted' &&
        this.inputMayControlDisplay(plan.input),
    );

    const affectedFamilies = new Set<'extended-class' | 'extended-style'>();
    let layoutOverlapIsUnsafe = false;
    const composed = extendedComposed.map(plan => {
      if (plan.status !== 'converted' || !extendedDirectives.has(plan.input.directive)) return plan;

      const displayDescriptors = plan.classNames
        .map(describeTailwindDisplay)
        .filter(descriptor => descriptor !== undefined);
      if (displayDescriptors.length === 0) return plan;

      const family = extendedClassDirectives.has(plan.input.directive) ? 'extended-class' : 'extended-style';
      if (unresolvedLayout) affectedFamilies.add(family);
      for (const descriptor of displayDescriptors) {
        const target = activationRange(descriptor.activation);
        if (family === 'extended-style' && layoutRanges.some(range => mediaRangesIntersect(target, range))) {
          layoutOverlapIsUnsafe = true;
          affectedFamilies.add(family);
          continue;
        }
        if (descriptor.important && layoutRanges.some(range => mediaRangesIntersect(target, range))) {
          layoutOverlapIsUnsafe = true;
          affectedFamilies.add(family);
          continue;
        }
        if (rangesCover(target, layoutRanges)) continue;
        if (layoutRanges.some(range => mediaRangesIntersect(target, range))) {
          layoutOverlapIsUnsafe = true;
          affectedFamilies.add(family);
        }
      }
      if (affectedFamilies.has(family)) return plan;

      return {
        ...plan,
        classNames: plan.classNames.filter(className => {
          const descriptor = describeTailwindDisplay(className);
          return (
            descriptor === undefined ||
            descriptor.important ||
            !rangesCover(activationRange(descriptor.activation), layoutRanges)
          );
        }),
      };
    });

    if (!affectedFamilies.size && !unresolvedExtendedDisplay && !layoutOverlapIsUnsafe) return composed;

    return composed.map(plan => {
      const family = this.extendedFamily(plan.input.directive);
      if (plan.status === 'converted' && family !== undefined && affectedFamilies.has(family)) {
        return contextUnverified(
          plan.input,
          'The responsive layout and extended display ranges do not have one provable ownership order.',
        );
      }
      if (
        plan.status === 'converted' &&
        plan.input.directive === 'fxLayout' &&
        (unresolvedExtendedDisplay || layoutOverlapIsUnsafe)
      ) {
        return contextUnverified(
          plan.input,
          'An unresolved or partially overlapping responsive class/style family may control display.',
        );
      }
      return plan;
    });
  }

  compose(plans: readonly PlannedConversion[], visibilityPlan: VisibilityFamilyPlan): ExtendedDisplayComposition {
    const layoutComposed = this.composeWithLayout(plans);
    const extendedDisplayFamilies = new Set<'extended-class' | 'extended-style'>();
    for (const plan of layoutComposed) {
      if (plan.status !== 'converted') continue;
      if (plan.classNames.some(className => describeTailwindDisplay(className) !== undefined)) {
        const family = this.extendedFamily(plan.input.directive);
        if (family !== undefined) extendedDisplayFamilies.add(family);
      }
    }

    if (visibilityPlan.status === 'unresolved') {
      if (!extendedDisplayFamilies.size) return { strategyPlans: layoutComposed, visibilityPlan };
      return {
        strategyPlans: layoutComposed.map(plan => {
          const family = this.extendedFamily(plan.input.directive);
          return plan.status === 'converted' && family !== undefined && extendedDisplayFamilies.has(family)
            ? contextUnverified(plan.input, 'The visibility family is unresolved and may override display.')
            : plan;
        }),
        visibilityPlan,
      };
    }

    const states = visibilityPlan.states;
    const baseIsHidden = states.some(state => state.activation.kind === 'base' && state.intent === 'hidden');
    const responsiveHiddenRanges = states.flatMap(state =>
      state.intent === 'hidden' && state.activation.kind === 'media' ? [state.activation.definition.range] : [],
    );
    const shownRanges = states.flatMap(state =>
      state.intent === 'shown'
        ? [state.activation.kind === 'base' ? ({} satisfies MediaRange) : state.activation.definition.range]
        : [],
    );
    const visibilityRanges = states.map(state =>
      state.activation.kind === 'base' ? ({} satisfies MediaRange) : state.activation.definition.range,
    );
    const unsafeFamilies = new Set<'extended-class' | 'extended-style'>();

    const strategyPlans = layoutComposed.map(plan => {
      if (plan.status !== 'converted') return plan;
      const family = this.extendedFamily(plan.input.directive);
      if (family === undefined) return plan;

      const classNames = plan.classNames.filter(className => {
        const descriptor = describeTailwindDisplay(className);
        if (descriptor === undefined) return true;
        const target = activationRange(descriptor.activation);
        if (descriptor.important && visibilityRanges.some(range => mediaRangesIntersect(target, range))) {
          unsafeFamilies.add(family);
          return true;
        }
        if (this.visibilityOwnsHiddenRange(target, states)) return false;

        const partiallyHidden =
          !baseIsHidden &&
          responsiveHiddenRanges.some(range => mediaRangesIntersect(target, range)) &&
          !rangesCover(target, responsiveHiddenRanges);
        const shownOverridesHiddenCandidate =
          displayIntent(descriptor) !== 'shown' && shownRanges.some(range => mediaRangesIntersect(target, range));
        if (partiallyHidden || shownOverridesHiddenCandidate) unsafeFamilies.add(family);
        return true;
      });
      return classNames.length === plan.classNames.length ? plan : { ...plan, classNames };
    });

    if (!unsafeFamilies.size) return { strategyPlans, visibilityPlan };

    return {
      strategyPlans: strategyPlans.map(plan => {
        const family = this.extendedFamily(plan.input.directive);
        return plan.status === 'converted' && family !== undefined && unsafeFamilies.has(family)
          ? contextUnverified(
              plan.input,
              'The responsive class/style display range and visibility range only partially agree on ownership.',
            )
          : plan;
      }),
      visibilityPlan: {
        status: 'unresolved',
        plans: states.map(state =>
          contextUnverified(
            state.input,
            'The responsive class/style display range and visibility range only partially agree on ownership.',
          ),
        ),
      },
    };
  }

  resolveVisibleDisplay(
    current: VisibleDisplayResolution,
    plans: readonly PlannedConversion[],
    visibilityPlan: VisibilityFamilyPlan,
    existingClassNames: readonly string[],
  ): VisibleDisplayResolution {
    if (visibilityPlan.status === 'unresolved') return current;

    const descriptors = plans
      .filter(
        (plan): plan is Extract<PlannedConversion, { readonly status: 'converted' }> =>
          plan.status === 'converted' && extendedDirectives.has(plan.input.directive),
      )
      .flatMap(plan => plan.classNames.map(describeTailwindDisplay).filter(descriptor => descriptor !== undefined));
    if (!descriptors.length) return current;

    const shownStates = visibilityPlan.states.filter(state => state.intent === 'shown');
    if (
      descriptors.some(
        descriptor =>
          displayIntent(descriptor) !== 'shown' &&
          shownStates.some(state =>
            mediaRangesIntersect(
              activationRange(descriptor.activation),
              state.activation.kind === 'base' ? {} : state.activation.definition.range,
            ),
          ),
      )
    ) {
      return {
        status: 'unverified',
        reason: 'A responsive class/style hidden utility overlaps a visibility state that must be shown.',
      };
    }

    const baseIsHidden = visibilityPlan.states.some(
      state => state.activation.kind === 'base' && state.intent === 'hidden',
    );
    if (!baseIsHidden || (current.status === 'resolved' && current.utility !== undefined)) return current;
    if (
      current.status === 'unverified' &&
      (current.reason !== 'The visible display value cannot be proven from one unambiguous source.' ||
        existingClassNames.some(className => describeTailwindDisplay(className) !== undefined))
    ) {
      return current;
    }
    const shownOverrides = visibilityPlan.states.filter(
      (
        state,
      ): state is VisibilityState & {
        readonly activation: Extract<VisibilityState['activation'], { readonly kind: 'media' }>;
      } => state.activation.kind === 'media' && state.intent === 'shown',
    );
    if (!shownOverrides.length) return current;

    const utilities = shownOverrides.map(state => {
      const exact = descriptors.filter(
        descriptor =>
          displayIntent(descriptor) === 'shown' &&
          descriptor.activation.kind === 'media' &&
          sameRange(descriptor.activation.range, state.activation.definition.range),
      );
      const values = [...new Set(exact.map(descriptor => descriptor.utility))];
      return values.length === 1 ? values[0] : undefined;
    });
    const distinct = [...new Set(utilities)];
    const utility = distinct[0];
    return distinct.length === 1 && utility !== undefined
      ? { status: 'resolved', utility }
      : {
          status: 'unverified',
          reason: 'The extended responsive display value cannot provide one exact visibility restoration utility.',
        };
  }

  inputMayControlDisplay(input: LocatedFlexLayoutInput): boolean {
    if (extendedClassDirectives.has(input.directive)) {
      if (input.binding !== 'literal') return true;
      const tokens = input.value.split(/[\t\n\f\r ]+/u).filter(Boolean);
      return tokens.some(token => {
        const classification = this.classifier.classify(token);
        return classification.status === 'unverified' || classification.descriptor.propertyGroup === 'display';
      });
    }

    if (!extendedStyleDirectives.has(input.directive)) return false;
    if (input.binding !== 'literal') return true;
    const parsed = parseLiteralStyleDeclarations(input.value);
    return (
      parsed.status === 'unverified' ||
      parsed.declarations.some(declaration => declaration.property.toLowerCase() === 'display')
    );
  }

  private composeExtendedFamilies(plans: readonly PlannedConversion[]): readonly PlannedConversion[] {
    const convertedDisplayRanges = (
      directives: ReadonlySet<LocatedFlexLayoutInput['directive']>,
    ): readonly MediaRange[] =>
      plans
        .filter(
          (plan): plan is Extract<PlannedConversion, { readonly status: 'converted' }> =>
            plan.status === 'converted' && directives.has(plan.input.directive),
        )
        .flatMap(plan =>
          plan.classNames.flatMap(className => {
            const descriptor = describeTailwindDisplay(className);
            return descriptor === undefined ? [] : [activationRange(descriptor.activation)];
          }),
        );
    const classRanges = convertedDisplayRanges(extendedClassDirectives);
    const styleRanges = convertedDisplayRanges(extendedStyleDirectives);
    const importantClassRanges = plans
      .filter(
        (plan): plan is Extract<PlannedConversion, { readonly status: 'converted' }> =>
          plan.status === 'converted' && extendedClassDirectives.has(plan.input.directive),
      )
      .flatMap(plan =>
        plan.classNames.flatMap(className => {
          const descriptor = describeTailwindDisplay(className);
          return descriptor?.important ? [activationRange(descriptor.activation)] : [];
        }),
      );
    const unresolvedRanges = (directives: ReadonlySet<LocatedFlexLayoutInput['directive']>): readonly MediaRange[] =>
      plans.flatMap(plan => {
        if (
          plan.status === 'converted' ||
          !directives.has(plan.input.directive) ||
          !this.inputMayControlDisplay(plan.input)
        ) {
          return [];
        }
        if (plan.input.breakpoint === undefined) return [{}];
        const classification = this.breakpointCatalog.classify(plan.input.breakpoint);
        return classification.kind === 'verified' ? [classification.definition.range] : [{}];
      });
    const unresolvedClassRanges = unresolvedRanges(extendedClassDirectives);
    const unresolvedStyleRanges = unresolvedRanges(extendedStyleDirectives);
    const classPartiallyOverlapsStyle = classRanges.some(
      target => styleRanges.some(range => mediaRangesIntersect(target, range)) && !rangesCover(target, styleRanges),
    );
    const affectedFamilies = new Set<'extended-class' | 'extended-style'>();
    const importantClassOverlapsStyle = importantClassRanges.some(target =>
      styleRanges.some(range => mediaRangesIntersect(target, range)),
    );
    if (classPartiallyOverlapsStyle || importantClassOverlapsStyle) {
      affectedFamilies.add('extended-class');
      affectedFamilies.add('extended-style');
    }
    if (styleRanges.some(target => unresolvedClassRanges.some(range => mediaRangesIntersect(target, range)))) {
      affectedFamilies.add('extended-style');
    }
    if (classRanges.some(target => unresolvedStyleRanges.some(range => mediaRangesIntersect(target, range)))) {
      affectedFamilies.add('extended-class');
    }

    return plans.map(plan => {
      const family = this.extendedFamily(plan.input.directive);
      if (plan.status !== 'converted' || family === undefined) return plan;
      if (affectedFamilies.has(family)) {
        return contextUnverified(
          plan.input,
          'Responsive class and style display ownership cannot be proven for every overlapping activation range.',
        );
      }
      if (family === 'extended-style') return plan;
      return {
        ...plan,
        classNames: plan.classNames.filter(className => {
          const descriptor = describeTailwindDisplay(className);
          return (
            descriptor === undefined ||
            descriptor.important ||
            !rangesCover(activationRange(descriptor.activation), styleRanges)
          );
        }),
      };
    });
  }

  private visibilityOwnsHiddenRange(target: MediaRange, states: readonly VisibilityState[]): boolean {
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

  private extendedFamily(
    directive: LocatedFlexLayoutInput['directive'],
  ): 'extended-class' | 'extended-style' | undefined {
    if (extendedClassDirectives.has(directive)) return 'extended-class';
    if (extendedStyleDirectives.has(directive)) return 'extended-style';
    return undefined;
  }
}
