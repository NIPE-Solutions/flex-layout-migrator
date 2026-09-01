import type { LocatedFlexLayoutInput } from '../../../analyzer/flex-layout-attribute.analyzer';
import {
  BreakpointCatalog,
  mediaRangesIntersect,
  type BreakpointClassification,
} from '../../../breakpoint/breakpoint-catalog';
import type { PlannedConversion } from '../../conversion-adapter';
import type {
  ExtendedFamilyPlan,
  ExtendedFamilyPlanRequest,
  ExtendedResponsiveKind,
  ExtendedResponsiveState,
} from './responsive-class.model';

type ClassifiedMember<T> =
  | { readonly input: LocatedFlexLayoutInput; readonly state: ExtendedResponsiveState<T> }
  | { readonly input: LocatedFlexLayoutInput; readonly plan: PlannedConversion };

type ClassifiedState<T> = Extract<ClassifiedMember<T>, { readonly state: ExtendedResponsiveState<T> }>;

function dynamicBinding(input: LocatedFlexLayoutInput): PlannedConversion {
  return {
    status: 'review',
    input,
    code: 'dynamic-binding',
    reason: 'Angular property bindings and interpolation may depend on runtime state.',
    suggestion: 'Replace the binding manually or make it a literal before migration.',
  };
}

function deprecatedAlias(input: LocatedFlexLayoutInput, kind: ExtendedResponsiveKind): PlannedConversion {
  return {
    status: 'review',
    input,
    code: 'semantic-unsupported',
    reason: `Deprecated responsive ${kind} aliases have version-dependent behavior.`,
    suggestion: `Keep the deprecated alias or migrate the complete responsive ${kind} family manually.`,
  };
}

function unresolvedBreakpoint(
  input: LocatedFlexLayoutInput,
  classification: Exclude<BreakpointClassification, { readonly kind: 'verified' }>,
): PlannedConversion {
  if (classification.kind === 'custom') {
    return {
      status: 'review',
      input,
      code: 'custom-breakpoint',
      reason: `The breakpoint alias ${classification.alias} may be registered by the project.`,
      suggestion: 'Provide its media query or migrate this responsive family manually.',
    };
  }

  const kind = classification.kind === 'print' ? 'print' : 'optional';
  return {
    status: 'review',
    input,
    code: 'breakpoint-unverified',
    reason: `Exact media-query output for the ${kind} breakpoint alias ${classification.alias} is not implemented.`,
    suggestion: 'Keep the responsive directive until exact breakpoint support is available.',
  };
}

function unverifiedValue(
  input: LocatedFlexLayoutInput,
  kind: ExtendedResponsiveKind,
  token: string | undefined,
  reason: string,
): PlannedConversion {
  if (kind === 'style') {
    return {
      status: 'review',
      input,
      code: 'style-value-unverified',
      reason,
      suggestion: 'Keep the complete responsive style family or replace unsafe declarations before migration.',
    };
  }

  return {
    status: 'review',
    input,
    code: 'tailwind-candidate-unverified',
    reason:
      token === undefined
        ? reason
        : `The first unverified token is ${JSON.stringify(token)}. It may be an application or plugin class. ${reason}`,
    suggestion: 'Keep the complete responsive class family or replace unverified classes before migration.',
  };
}

function contextUnverified(input: LocatedFlexLayoutInput): PlannedConversion {
  return {
    status: 'review',
    input,
    code: 'context-unverified',
    reason: 'Another member of this responsive family is unresolved.',
    suggestion: 'Migrate the complete responsive family together manually.',
  };
}

function responsivePrecedenceUnverified(input: LocatedFlexLayoutInput): PlannedConversion {
  return {
    status: 'review',
    input,
    code: 'responsive-precedence-unverified',
    reason: 'The responsive family contains different values in intersecting activation ranges.',
    suggestion: 'Make intersecting values identical or migrate the complete responsive family manually.',
  };
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export class ExtendedFamilyPlanner {
  constructor(private readonly catalog = new BreakpointCatalog()) {}

  plan<T>(request: ExtendedFamilyPlanRequest<T>): ExtendedFamilyPlan<T> {
    const members = request.inputs
      .map(input => this.classify(input, request.kind, request.valueParser))
      .sort((left, right) => this.compare(left.input, right.input));

    if (!members.every((member): member is ClassifiedState<T> => 'state' in member)) {
      return {
        status: 'unresolved',
        plans: members.map(member => ('plan' in member ? member.plan : contextUnverified(member.input))),
      };
    }

    const states = members.map(member => member.state);
    if (this.hasConflictingStates(states, request.equals)) {
      return {
        status: 'unresolved',
        plans: states.map(state => responsivePrecedenceUnverified(state.input)),
      };
    }

    return { status: 'converted', states };
  }

  private classify<T>(
    input: LocatedFlexLayoutInput,
    kind: ExtendedResponsiveKind,
    valueParser: ExtendedFamilyPlanRequest<T>['valueParser'],
  ): ClassifiedMember<T> {
    if (input.binding !== 'literal' || /\{\{[\s\S]*\}\}/u.test(input.value)) {
      return { input, plan: dynamicBinding(input) };
    }
    const expectedDirective = kind === 'class' ? 'ngClass' : 'ngStyle';
    if (input.directive !== expectedDirective) return { input, plan: deprecatedAlias(input, kind) };
    if (input.breakpoint === undefined) return { input, plan: deprecatedAlias(input, kind) };

    const breakpoint = this.catalog.classify(input.breakpoint);
    if (breakpoint.kind !== 'verified') return { input, plan: unresolvedBreakpoint(input, breakpoint) };

    const parsed = valueParser(input);
    if (parsed.status === 'unverified') {
      return { input, plan: unverifiedValue(input, kind, parsed.token, parsed.reason) };
    }

    return {
      input,
      state: {
        input,
        activation: { kind: 'media', definition: breakpoint.definition },
        value: parsed.value,
      },
    };
  }

  private hasConflictingStates<T>(
    states: readonly ExtendedResponsiveState<T>[],
    equals: (left: T, right: T) => boolean,
  ): boolean {
    return states.some((left, leftIndex) =>
      states
        .slice(leftIndex + 1)
        .some(
          right =>
            !equals(left.value, right.value) &&
            mediaRangesIntersect(left.activation.definition.range, right.activation.definition.range),
        ),
    );
  }

  private compare(left: LocatedFlexLayoutInput, right: LocatedFlexLayoutInput): number {
    const leftPriority = this.breakpointPriority(left.breakpoint);
    const rightPriority = this.breakpointPriority(right.breakpoint);
    if (leftPriority !== rightPriority) return rightPriority - leftPriority;

    const aliasOrder = compareText(left.breakpoint ?? '', right.breakpoint ?? '');
    return aliasOrder || compareText(left.id, right.id);
  }

  private breakpointPriority(alias: string | undefined): number {
    if (alias === undefined) return Number.NEGATIVE_INFINITY;
    const classification = this.catalog.classify(alias);
    return classification.kind === 'verified' ? classification.definition.priority : Number.NEGATIVE_INFINITY;
  }
}
