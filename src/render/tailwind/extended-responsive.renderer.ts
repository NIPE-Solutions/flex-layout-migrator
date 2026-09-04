import type { LocatedFlexLayoutInput } from '../../analyzer/flex-layout-attribute.analyzer';
import type { PlannedConversion } from '../../adapter/conversion-adapter';
import { TailwindSourcePropertyEvidence } from '../../evidence/tailwind-source-property.evidence';
import { ExtendedSemanticPlanner } from '../../semantic/extended/extended-semantic.planner';
import type {
  ExtendedFamilyPlan,
  ExtendedResponsiveState,
  ResponsiveClassValue,
} from '../../semantic/extended/responsive-class.model';
import type { SemanticResponsiveClassValue } from '../../semantic/extended/responsive-class-value.parser';
import type { ResponsiveStyleValue } from '../../semantic/extended/responsive-style.model';
import type { ResolvedSemanticPlan } from '../../semantic/semantic-plan';
import type { TemplateAttribute } from '../../template/template.model';
import { TailwindRenderer } from './tailwind.renderer';

interface ExtendedResponsiveRequestBase {
  readonly existingClassNames: readonly string[];
  readonly attributes: readonly TemplateAttribute[];
}

export type ExtendedResponsivePlanRequest =
  | (ExtendedResponsiveRequestBase & {
      readonly kind: 'class';
      readonly familyPlan: ExtendedFamilyPlan<ResponsiveClassValue>;
    })
  | (ExtendedResponsiveRequestBase & {
      readonly kind: 'style';
      readonly familyPlan: ExtendedFamilyPlan<ResponsiveStyleValue>;
    });

export type ExtendedResponsivePlan =
  | { readonly status: 'converted'; readonly plans: readonly PlannedConversion[] }
  | { readonly status: 'unresolved'; readonly plans: readonly PlannedConversion[] };

function diagnostic(
  input: LocatedFlexLayoutInput,
  code: 'class-conflict' | 'tailwind-candidate-unverified',
  reason: string,
  suggestion: string,
): PlannedConversion {
  return { status: 'review', input, code, reason, suggestion };
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function canonicalStates<T>(
  states: readonly ExtendedResponsiveState<T>[],
): readonly ExtendedResponsiveState<T>[] {
  return [...states].sort((left, right) => {
    const priority = right.activation.definition.priority - left.activation.definition.priority;
    if (priority) return priority;
    const alias = compareText(left.activation.definition.alias, right.activation.definition.alias);
    return alias || compareText(left.input.id, right.input.id);
  });
}

/**
 * Legacy request-shape bridge. Candidate conversion is delegated exclusively
 * to TailwindRenderer after the request has become a resolved semantic plan.
 */
export class ExtendedResponsivePlanner {
  private readonly evidence = new TailwindSourcePropertyEvidence();
  private readonly semanticPlanner = new ExtendedSemanticPlanner(this.evidence);
  private readonly renderer = new TailwindRenderer();

  plan(request: ExtendedResponsivePlanRequest): ExtendedResponsivePlan {
    if (request.familyPlan.status === 'unresolved') {
      return { status: 'unresolved', plans: request.familyPlan.plans };
    }
    return request.kind === 'class' ? this.planClass(request) : this.planStyle(request);
  }

  private planClass(
    request: Extract<ExtendedResponsivePlanRequest, { readonly kind: 'class' }>,
  ): ExtendedResponsivePlan {
    if (request.familyPlan.status === 'unresolved') return request.familyPlan;
    const semanticStates: ExtendedResponsiveState<SemanticResponsiveClassValue>[] = [];
    for (const state of canonicalStates(request.familyPlan.states)) {
      const tokens = [];
      for (const source of [...new Set(state.value.tokens)]) {
        const classification = this.evidence.classifyClassToken(source);
        if (classification.status === 'unverified' || classification.evidence.properties.length === 0) {
          return {
            status: 'unresolved',
            plans: request.familyPlan.states.map(item =>
              diagnostic(
                item.input,
                'tailwind-candidate-unverified',
                `The class token ${JSON.stringify(source)} is not a verified Tailwind candidate with stable property ownership.`,
                'Keep the complete responsive family or replace the unverified value before migration.',
              ),
            ),
          };
        }
        tokens.push(classification.evidence);
      }
      semanticStates.push({ ...state, value: { tokens } });
    }
    const familyPlan = { status: 'converted' as const, states: semanticStates };
    const decision = this.semanticPlanner.plan({ kind: 'class', familyPlan, attributes: request.attributes });
    if (decision.status === 'unresolved') return decision;
    const semanticPlans = semanticStates.map((state): ResolvedSemanticPlan => ({
      status: 'converted',
      input: state.input,
      family: 'extended-class',
      value: {
        kind: 'extended-class',
        emit: decision.ownerInputId === state.input.id,
        states: semanticStates.map(item => ({ activations: [item.activation], tokens: item.value.tokens })),
        retainedTokens:
          decision.ownerInputId === undefined && state.input.id === semanticStates[0]?.input.id
            ? decision.retainedTokens
            : [],
      },
      activations: [],
    }));
    return this.render(semanticPlans, request);
  }

  private planStyle(
    request: Extract<ExtendedResponsivePlanRequest, { readonly kind: 'style' }>,
  ): ExtendedResponsivePlan {
    if (request.familyPlan.status === 'unresolved') return request.familyPlan;
    const states = canonicalStates(request.familyPlan.states);
    const decision = this.semanticPlanner.plan({
      kind: 'style',
      familyPlan: { status: 'converted', states },
      attributes: request.attributes,
    });
    if (decision.status === 'unresolved') return decision;
    const semanticPlans = states.map((state): ResolvedSemanticPlan => ({
      status: 'converted',
      input: state.input,
      family: 'extended-style',
      value: {
        kind: 'extended-style',
        emit: decision.ownerInputId === state.input.id,
        states: states.map(item => ({ activations: [item.activation], declarations: item.value.declarations })),
      },
      activations: [],
    }));
    return this.render(semanticPlans, request);
  }

  private render(
    plans: readonly ResolvedSemanticPlan[],
    request: ExtendedResponsiveRequestBase,
  ): ExtendedResponsivePlan {
    const context = {
      element: {
        id: 'extended-responsive-compatibility',
        name: 'div',
        source: { start: 0, end: 0 },
        startTag: { start: 0, end: 0 },
        structural: false,
        attributes: request.attributes,
      },
      inputs: plans.map(plan => plan.input),
      parentInputs: [],
      existingClassNames: request.existingClassNames,
      attributeEvidence: request.attributes,
    };
    const existing = new Set(request.existingClassNames);
    const rendered = plans.map(plan => {
      const output = this.renderer.render(plan, context);
      return output.status === 'converted'
        ? { ...output, classNames: output.classNames.filter(className => !existing.has(className)) }
        : output;
    });
    const resolved = this.renderer.resolveClassConflicts(rendered, request.existingClassNames);
    if (resolved.some(plan => plan.status !== 'converted')) {
      return {
        status: 'unresolved',
        plans: plans.map(plan =>
          diagnostic(
            plan.input,
            'class-conflict',
            'An existing Tailwind utility controls a CSS property generated by this responsive family.',
            'Remove or reconcile the conflicting utility before migrating this family.',
          ),
        ),
      };
    }
    return { status: 'converted', plans: resolved };
  }
}
