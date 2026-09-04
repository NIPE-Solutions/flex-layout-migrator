import type { LocatedFlexLayoutInput } from '../../analyzer/flex-layout-attribute.analyzer';
import { BreakpointCatalog } from '../../breakpoint/breakpoint-catalog';
import type { SemanticConversionContext } from '../../semantic/conversion-context';
import type { ConversionContext, PlannedConversion } from '../conversion-adapter';
import {
  ResponsiveFamilyPlanner as SemanticResponsiveFamilyPlanner,
  type DirectiveFamily,
  type ResponsivePlanExtendedFamily,
  type ResponsivePlanOne,
  type SemanticTargetPolicy,
} from '../../semantic/responsive-family.planner';
import { planResponsiveClasses } from './responsive-plan';
import { ResponsiveVariantEmitter } from './responsive-variant.emitter';
import type { TailwindStrategyResult } from './tailwind-semantic.model';

export type { DirectiveFamily };
export type PlanOne = ResponsivePlanOne<PlannedConversion>;
export type PlanExtendedFamily = ResponsivePlanExtendedFamily<PlannedConversion>;

function semanticContext(
  context: ConversionContext,
  inputs: readonly LocatedFlexLayoutInput[],
): SemanticConversionContext {
  return {
    ...context,
    inputs,
    parentInputs: context.parentInputs ?? [],
    existingClassNames: context.existingClassNames ?? [],
    attributeEvidence: context.attributeEvidence ?? context.element.attributes,
  };
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

function printCandidate(candidate: string): string {
  if (candidate.startsWith('[@media_print]:')) return candidate;
  if (candidate.startsWith('[@media_')) {
    const variantEnd = candidate.indexOf(']:');
    if (variantEnd >= 0) return `[@media_print]${candidate.slice(variantEnd + 1)}`;
  }
  return `[@media_print]:${candidate}`;
}

class TailwindResponsiveFamilyPlanner {
  private readonly sharedPlanner: SemanticResponsiveFamilyPlanner<PlannedConversion>;

  constructor(
    private readonly catalog = new BreakpointCatalog(),
    private readonly emitter = new ResponsiveVariantEmitter(),
  ) {
    const policy: SemanticTargetPolicy<PlannedConversion> = {
      emptyPlan: input => converted(input, []),
      targetEligibility: () => undefined,
      validateActivation: plan => this.validateBreakpoint(plan),
      isTargetEligibilityFailure: plan =>
        plan.status !== 'converted' && (plan.code === 'breakpoint-unverified' || plan.code === 'custom-breakpoint'),
      sameOutput: sameClasses,
      contextUnverified,
      contextualOutputUnverified: input =>
        contextUnverified(
          input,
          'This directive emits different utilities across its active responsive layout contexts.',
        ),
      responsivePrecedenceUnverified: input => ({
        status: 'review',
        input,
        code: 'responsive-precedence-unverified',
        reason: 'Overlapping responsive ranges emit different utilities for the same directive family.',
        suggestion: 'Simplify the overlapping declarations or migrate this directive family manually.',
      }),
      decorate: plan => this.decorate(plan),
      addPrintFallback: plan => this.addPrintFallback(plan),
    };
    this.sharedPlanner = new SemanticResponsiveFamilyPlanner(this.catalog, policy);
  }

  plan(
    inputs: readonly LocatedFlexLayoutInput[],
    context: ConversionContext,
    planOne: PlanOne,
    planExtendedFamily?: PlanExtendedFamily,
  ): readonly PlannedConversion[] {
    return this.sharedPlanner.plan(inputs, semanticContext(context, inputs), planOne, planExtendedFamily);
  }

  closeDependencies(
    inputs: readonly LocatedFlexLayoutInput[],
    context: ConversionContext,
    planOne: PlanOne,
  ): readonly PlannedConversion[] {
    return this.sharedPlanner.closeDependencies(inputs, semanticContext(context, inputs), planOne);
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

  private addPrintFallback(plan: PlannedConversion): PlannedConversion {
    if (plan.status !== 'converted') return plan;
    return {
      ...plan,
      classNames: [...new Set([...plan.classNames, ...plan.classNames.map(printCandidate)])],
    };
  }
}

/** @deprecated Test-only compatibility alias. Production rendering uses ElementSemanticPlanner. */
export { TailwindResponsiveFamilyPlanner as ResponsiveFamilyPlanner };
