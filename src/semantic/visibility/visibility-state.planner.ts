import type { LocatedFlexLayoutInput } from '../../analyzer/flex-layout-attribute.analyzer';
import {
  BreakpointCatalog,
  mediaDefinitionsIntersect,
  type BreakpointClassification,
} from '../../breakpoint/breakpoint-catalog';
import type { UnresolvedSemanticPlan } from '../semantic-plan';
import type { VisibilityState } from './visibility.model';
import { parseVisibilityValue } from './visibility-value.parser';

export type VisibilityFamilyPlan =
  | { readonly status: 'converted'; readonly states: readonly VisibilityState[] }
  | { readonly status: 'unresolved'; readonly plans: readonly UnresolvedSemanticPlan[] };

type ClassifiedMember =
  | { readonly input: LocatedFlexLayoutInput; readonly state: VisibilityState }
  | { readonly input: LocatedFlexLayoutInput; readonly plan: UnresolvedSemanticPlan };

type ClassifiedState = Extract<ClassifiedMember, { readonly state: VisibilityState }>;

function dynamicBinding(input: LocatedFlexLayoutInput): UnresolvedSemanticPlan {
  return {
    status: 'review',
    input,
    code: 'dynamic-binding',
    reason: 'Angular property bindings may depend on runtime state.',
    suggestion: 'Replace the binding manually or make it a literal before migration.',
  };
}

function unresolvedBreakpoint(
  input: LocatedFlexLayoutInput,
  classification: Exclude<BreakpointClassification, { readonly kind: 'verified' }>,
): UnresolvedSemanticPlan {
  if (classification.kind === 'custom') {
    return {
      status: 'review',
      input,
      code: 'custom-breakpoint',
      reason: `The breakpoint alias ${classification.alias} may be registered by the project.`,
      suggestion: 'Provide its media query or migrate this responsive input manually.',
    };
  }

  const kind = classification.kind === 'print' ? 'print' : 'optional';
  return {
    status: 'review',
    input,
    code: 'breakpoint-unverified',
    reason: `The ${kind} breakpoint alias ${classification.alias} is not enabled by explicit migration configuration.`,
    suggestion:
      classification.kind === 'print'
        ? 'Verify the source printWithBreakpoints value, then rerun with --print-with-breakpoints.'
        : 'Verify that the source enables orientation breakpoints, then rerun with --orientation-breakpoints.',
  };
}

function contextUnverified(input: LocatedFlexLayoutInput): UnresolvedSemanticPlan {
  return {
    status: 'review',
    input,
    code: 'context-unverified',
    reason: 'Another member of this visibility family is unresolved.',
    suggestion: 'Migrate the complete visibility family together manually.',
  };
}

function responsivePrecedenceUnverified(input: LocatedFlexLayoutInput): UnresolvedSemanticPlan {
  return {
    status: 'review',
    input,
    code: 'responsive-precedence-unverified',
    reason: 'The visibility family contains conflicting base or overlapping responsive states.',
    suggestion: 'Simplify the conflicting declarations or migrate this visibility family manually.',
  };
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export class VisibilityStatePlanner {
  constructor(private readonly catalog = new BreakpointCatalog()) {}

  plan(inputs: readonly LocatedFlexLayoutInput[]): VisibilityFamilyPlan {
    const members = inputs
      .map(input => this.classify(input))
      .sort((left, right) => this.compare(left.input, right.input));

    if (!members.every((member): member is ClassifiedState => 'state' in member)) {
      return {
        status: 'unresolved',
        plans: members.map(member => ('plan' in member ? member.plan : contextUnverified(member.input))),
      };
    }

    const states = members.map(member => member.state);
    if (this.hasConflictingStates(states)) {
      return {
        status: 'unresolved',
        plans: states.map(state => responsivePrecedenceUnverified(state.input)),
      };
    }

    return { status: 'converted', states };
  }

  private classify(input: LocatedFlexLayoutInput): ClassifiedMember {
    if (input.binding !== 'literal') return { input, plan: dynamicBinding(input) };

    if (input.breakpoint === undefined) {
      return {
        input,
        state: { input, intent: parseVisibilityValue(input), activation: { kind: 'base' } },
      };
    }

    const classification = this.catalog.classify(input.breakpoint);
    if (classification.kind !== 'verified') {
      return { input, plan: unresolvedBreakpoint(input, classification) };
    }

    return {
      input,
      state: {
        input,
        intent: parseVisibilityValue(input),
        activation: { kind: 'media', definition: classification.definition },
      },
    };
  }

  private hasConflictingStates(states: readonly VisibilityState[]): boolean {
    const baseStates = states.filter(state => state.activation.kind === 'base');
    if (baseStates.some(state => state.intent !== baseStates[0]?.intent)) return true;

    const responsiveStates = states.filter(
      (state): state is VisibilityState & { readonly activation: { readonly kind: 'media' } } =>
        state.activation.kind === 'media',
    );
    return responsiveStates.some((left, leftIndex) =>
      responsiveStates
        .slice(leftIndex + 1)
        .some(
          right =>
            left.intent !== right.intent &&
            mediaDefinitionsIntersect(left.activation.definition.media, right.activation.definition.media),
        ),
    );
  }

  private compare(left: LocatedFlexLayoutInput, right: LocatedFlexLayoutInput): number {
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
