import type { LocatedFlexLayoutInput } from '../../analyzer/flex-layout-attribute.analyzer';
import { BreakpointCatalog } from '../../breakpoint/breakpoint-catalog';
import type { BreakpointMigrationConfig } from '../../config/breakpoint-migration-config';
import type { FlexAlignSemantics } from '../../flex/flex-align.semantic';
import type { FlexFillSemantics } from '../../flex/flex-fill.semantic';
import type { FlexItemSemantics } from '../../flex/flex-item.semantic';
import type { FlexOffsetSemantics } from '../../flex/flex-offset.semantic';
import type { FlexOrderSemantics } from '../../flex/flex-order.semantic';
import type { LayoutAlignmentSemantics } from '../../flex/layout-align.semantic';
import type { LayoutGapSemantics } from '../../flex/layout-gap.semantic';
import type { LayoutSemantics } from '../../flex/layout.semantic';
import type { GridSemanticPlan } from '../../grid/grid-semantic.model';
import type { PlannedConversion } from '../../adapter/conversion-adapter';
import { renderFlexAlign } from '../../adapter/tailwind/directives/flex-align.strategy';
import { renderFlexFill } from '../../adapter/tailwind/directives/flex-fill.strategy';
import { renderFlexItem } from '../../adapter/tailwind/directives/flex-item.strategy';
import { renderFlexOffset } from '../../adapter/tailwind/directives/flex-offset.strategy';
import { renderFlexOrder } from '../../adapter/tailwind/directives/flex-order.strategy';
import { renderLayoutAlignment } from '../../adapter/tailwind/directives/layout-align.strategy';
import { renderLayoutGap } from '../../adapter/tailwind/directives/layout-gap.strategy';
import { renderLayout } from '../../adapter/tailwind/directives/layout.strategy';
import { ExtendedDisplayCompositionPlanner } from '../../adapter/tailwind/extended/extended-display-composition.planner';
import { ExtendedFamilyPlanner } from '../../adapter/tailwind/extended/extended-family.planner';
import { ExtendedResponsivePlanner } from '../../adapter/tailwind/extended/extended-responsive.planner';
import { GeneratedPropertyCompositionPlanner } from '../../adapter/tailwind/extended/generated-property-composition.planner';
import { parseResponsiveClassValue } from '../../adapter/tailwind/extended/responsive-class-value.parser';
import type { ResponsiveClassValue } from '../../adapter/tailwind/extended/responsive-class.model';
import { parseResponsiveStyleValue } from '../../adapter/tailwind/extended/responsive-style-value.parser';
import type { ResponsiveStyleValue } from '../../adapter/tailwind/extended/responsive-style.model';
import { TailwindCandidateClassifier } from '../../adapter/tailwind/extended/tailwind-candidate-classifier';
import { TailwindGridRenderer } from '../../adapter/tailwind/grid/tailwind-grid.renderer';
import {
  describeTailwindDisplay,
  findTailwindClassConflicts,
} from '../../adapter/tailwind/tailwind-class-conflict';
import { ResponsiveVariantEmitter } from '../../adapter/tailwind/responsive-variant.emitter';
import { DisplayCompositionPlanner } from '../../adapter/tailwind/visibility/display-composition.planner';
import { VisibilityStatePlanner } from '../../adapter/tailwind/visibility/visibility-state.planner';
import { VisibleDisplayResolver } from '../../adapter/tailwind/visibility/visible-display.resolver';
import type { SemanticConversionContext } from '../../semantic/conversion-context';
import { directiveFamily, type ResolvedSemanticPlan } from '../../semantic/semantic-plan';
import { templateAttributeKeys } from '../../template/template-attribute';
import type { ConversionRenderer } from '../conversion-renderer';

const sharedDirectives = new Set<LocatedFlexLayoutInput['directive']>([
  'fxLayout',
  'fxLayoutGap',
  'fxLayoutAlign',
  'fxFlex',
  'fxGrow',
  'fxShrink',
  'fxFlexAlign',
  'fxFlexFill',
  'fxFill',
  'fxFlexOffset',
  'fxFlexOrder',
]);
const visibilityDirectives = new Set<LocatedFlexLayoutInput['directive']>(['fxShow', 'fxHide']);
const extendedClassDirectives = new Set<LocatedFlexLayoutInput['directive']>(['class', 'ngClass']);
const extendedStyleDirectives = new Set<LocatedFlexLayoutInput['directive']>(['style', 'ngStyle']);
const extendedDirectives = new Set<LocatedFlexLayoutInput['directive']>([
  ...extendedClassDirectives,
  ...extendedStyleDirectives,
]);
const responsiveStyleAuthorityDirectives = new Set<LocatedFlexLayoutInput['directive']>(['style', 'ngStyle']);
const gridDirectives = new Set<LocatedFlexLayoutInput['directive']>([
  'gdAlignColumns',
  'gdAlignRows',
  'gdArea',
  'gdAreas',
  'gdAuto',
  'gdColumn',
  'gdColumns',
  'gdGap',
  'gdGridAlign',
  'gdInline',
  'gdRow',
  'gdRows',
]);
const gridContainerDirectives = new Set<LocatedFlexLayoutInput['directive']>([
  'gdAlignColumns',
  'gdAlignRows',
  'gdAreas',
  'gdAuto',
  'gdColumns',
  'gdGap',
  'gdRows',
]);

function contextUnverified(input: LocatedFlexLayoutInput, reason: string): PlannedConversion {
  return {
    status: 'review',
    input,
    code: 'context-unverified',
    reason,
    suggestion: 'Migrate the complete layout and visibility context together manually.',
  };
}

function breakpointUnverified(
  input: LocatedFlexLayoutInput,
  catalog: BreakpointCatalog,
): PlannedConversion | undefined {
  if (input.breakpoint === undefined) return undefined;
  const classification = catalog.classify(input.breakpoint);
  if (classification.kind === 'verified') return undefined;
  if (classification.kind === 'custom') {
    return {
      status: 'review',
      input,
      code: 'custom-breakpoint',
      reason: `The breakpoint alias ${classification.alias} may be registered by the project.`,
      suggestion: extendedDirectives.has(input.directive)
        ? 'Provide its media query or migrate this responsive family manually.'
        : 'Provide its media query or migrate this responsive input manually.',
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

function isBoundClassAttribute(attribute: SemanticConversionContext['attributeEvidence'][number]): boolean {
  if (attribute.binding !== 'property') return false;
  return [...templateAttributeKeys(attribute)].some(
    key => key === 'class' || key === 'ngclass' || key.startsWith('class.') || key.startsWith('ngclass.'),
  );
}

function equalClassValues(left: ResponsiveClassValue, right: ResponsiveClassValue): boolean {
  return left.tokens.length === right.tokens.length && left.tokens.every((token, index) => token === right.tokens[index]);
}

function equalStyleValues(left: ResponsiveStyleValue, right: ResponsiveStyleValue): boolean {
  return (
    left.declarations.length === right.declarations.length &&
    left.declarations.every(
      (declaration, index) =>
        declaration.property === right.declarations[index]?.property &&
        declaration.value === right.declarations[index]?.value,
    )
  );
}

function compatibleVisibilityClasses(
  plan: Extract<PlannedConversion, { readonly status: 'converted' }>,
  existingClassNames: readonly string[],
): readonly string[] {
  if (!visibilityDirectives.has(plan.input.directive)) return existingClassNames;
  const generatedDisplays = plan.classNames.map(describeTailwindDisplay).filter(descriptor => descriptor !== undefined);
  const hasBaseHidden = generatedDisplays.some(
    descriptor => descriptor.activation.kind === 'base' && descriptor.utility === 'hidden',
  );
  return existingClassNames.filter(className => {
    const existing = describeTailwindDisplay(className);
    if (
      !existing ||
      existing.activation.kind !== 'base' ||
      existing.important ||
      existing.token !== existing.utility ||
      existing.utility === 'hidden'
    ) {
      return true;
    }
    const suppliesResponsiveVisibility = hasBaseHidden
      ? generatedDisplays.some(
          generated => generated.activation.kind === 'media' && generated.utility === existing.utility,
        )
      : generatedDisplays.length > 0 && generatedDisplays.every(generated => generated.activation.kind === 'media');
    return !suppliesResponsiveVisibility;
  });
}

function printCandidate(candidate: string): string {
  if (candidate.startsWith('[@media_print]:')) return candidate;
  if (candidate.startsWith('[@media_')) {
    const variantEnd = candidate.indexOf(']:');
    if (variantEnd >= 0) return `[@media_print]${candidate.slice(variantEnd + 1)}`;
  }
  return `[@media_print]:${candidate}`;
}

export class TailwindRenderer implements ConversionRenderer {
  readonly target = 'tailwind' as const;
  private readonly breakpointCatalog: BreakpointCatalog;
  private readonly responsiveEmitter = new ResponsiveVariantEmitter();
  private readonly visibilityStatePlanner: VisibilityStatePlanner;
  private readonly visibleDisplayResolver = new VisibleDisplayResolver();
  private readonly displayCompositionPlanner: DisplayCompositionPlanner;
  private readonly extendedFamilyPlanner: ExtendedFamilyPlanner;
  private readonly extendedResponsivePlanner = new ExtendedResponsivePlanner();
  private readonly tailwindCandidateClassifier = new TailwindCandidateClassifier();
  private readonly extendedDisplayCompositionPlanner: ExtendedDisplayCompositionPlanner;
  private readonly generatedPropertyCompositionPlanner: GeneratedPropertyCompositionPlanner;
  private readonly gridRenderer = new TailwindGridRenderer();
  private readonly printWithBreakpoints: readonly string[] | undefined;

  constructor(config: BreakpointMigrationConfig = { orientationBreakpoints: false }) {
    this.breakpointCatalog = new BreakpointCatalog(config);
    this.printWithBreakpoints = config.printWithBreakpoints;
    this.visibilityStatePlanner = new VisibilityStatePlanner(this.breakpointCatalog);
    this.displayCompositionPlanner = new DisplayCompositionPlanner(this.breakpointCatalog);
    this.extendedFamilyPlanner = new ExtendedFamilyPlanner(this.breakpointCatalog);
    this.extendedDisplayCompositionPlanner = new ExtendedDisplayCompositionPlanner(
      this.breakpointCatalog,
      this.tailwindCandidateClassifier,
    );
    this.generatedPropertyCompositionPlanner = new GeneratedPropertyCompositionPlanner(
      this.breakpointCatalog,
      this.tailwindCandidateClassifier,
    );
  }

  eligibility(input: LocatedFlexLayoutInput): PlannedConversion | undefined {
    if (input.binding !== 'property') {
      if (
        !sharedDirectives.has(input.directive) &&
        !visibilityDirectives.has(input.directive) &&
        !extendedDirectives.has(input.directive) &&
        !gridDirectives.has(input.directive)
      ) {
        return {
          status: 'unsupported',
          input,
          code: 'target-unsupported',
          reason: `The Tailwind target does not support ${input.directive}.`,
          suggestion: 'Keep the directive and migrate it manually.',
        };
      }
    }
    return breakpointUnverified(input, this.breakpointCatalog);
  }

  render(plan: ResolvedSemanticPlan, _context: SemanticConversionContext): PlannedConversion {
    let classNames: readonly string[];
    switch (plan.family) {
      case 'layout':
        classNames = renderLayout(plan.value as LayoutSemantics);
        break;
      case 'layout-gap': {
        const result = renderLayoutGap(plan.value as LayoutGapSemantics);
        classNames = result.status === 'converted' ? result.classNames : [];
        break;
      }
      case 'layout-align':
        classNames = renderLayoutAlignment(plan.value as LayoutAlignmentSemantics).classNames;
        break;
      case 'flex-item':
        classNames = renderFlexItem(plan.value as FlexItemSemantics);
        break;
      case 'flex-align': {
        const result = renderFlexAlign(plan.value as FlexAlignSemantics);
        classNames = result.status === 'converted' ? result.classNames : [];
        break;
      }
      case 'flex-fill': {
        const result = renderFlexFill(plan.value as FlexFillSemantics);
        classNames = result.status === 'converted' ? result.classNames : [];
        break;
      }
      case 'flex-offset': {
        const result = renderFlexOffset(plan.value as FlexOffsetSemantics);
        classNames = result.status === 'converted' ? result.classNames : [];
        break;
      }
      case 'flex-order': {
        const result = renderFlexOrder(plan.value as FlexOrderSemantics);
        classNames = result.status === 'converted' ? result.classNames : [];
        break;
      }
      case 'visibility':
      case 'extended-class':
      case 'extended-style':
        classNames = [];
        break;
      default:
        return this.renderGrid(plan, plan.value as GridSemanticPlan);
    }
    return {
      status: 'converted',
      input: plan.input,
      classNames: this.decorate(classNames, plan),
    };
  }

  resolveConflicts(
    plans: readonly PlannedConversion[],
    context: SemanticConversionContext,
  ): readonly PlannedConversion[] {
    return this.resolveClassConflicts(this.composeTargetFamilies(plans, context), context.existingClassNames);
  }

  record(_plans: readonly PlannedConversion[]): void {}

  resolveClassConflicts(
    plans: readonly PlannedConversion[],
    existingClassNames: readonly string[],
  ): readonly PlannedConversion[] {
    const convertedPlans = plans.filter(
      (plan): plan is Extract<PlannedConversion, { readonly status: 'converted' }> => plan.status === 'converted',
    );
    const sharedConflictingTokens = findTailwindClassConflicts(
      existingClassNames,
      convertedPlans.flatMap(plan => plan.classNames),
    );
    const conflictingFamilies = new Set(
      convertedPlans
        .filter(plan => {
          if (!visibilityDirectives.has(plan.input.directive)) {
            return plan.classNames.some(className => sharedConflictingTokens.has(className));
          }
          const conflictingTokens = findTailwindClassConflicts(
            compatibleVisibilityClasses(plan, existingClassNames),
            plan.classNames,
          );
          return plan.classNames.some(className => conflictingTokens.has(className));
        })
        .map(plan => directiveFamily(plan.input.directive) ?? plan.input.directive),
    );
    return plans.map(plan =>
      plan.status === 'converted' &&
      conflictingFamilies.has(directiveFamily(plan.input.directive) ?? plan.input.directive)
        ? {
            status: 'review',
            input: plan.input,
            code: 'class-conflict',
            reason: 'An existing Tailwind utility controls a CSS property generated by this conversion.',
            suggestion: 'Remove or reconcile the conflicting utility before migrating this directive.',
          }
        : plan,
    );
  }

  private decorate(classNames: readonly string[], plan: ResolvedSemanticPlan): readonly string[] {
    return plan.activations.flatMap(planActivation =>
      planActivation.kind === 'base'
        ? classNames
        : classNames.flatMap(className => this.responsiveEmitter.emit(planActivation.definition, className)),
    );
  }

  private renderGrid(plan: ResolvedSemanticPlan, value: GridSemanticPlan): PlannedConversion {
    const rendered = this.gridRenderer.render(value);
    if (rendered.status === 'review') {
      return {
        status: 'review',
        input: plan.input,
        code: rendered.code,
        reason: rendered.reason,
        suggestion: 'Use an exact Tailwind class manually or retain the Grid directive.',
      };
    }
    const display =
      value.role === 'container' ? ['grid'] : value.role === 'modifier' ? [value.inline ? 'inline-grid' : 'grid'] : [];
    return {
      status: 'converted',
      input: plan.input,
      classNames: this.decorate([...display, ...rendered.classNames], plan),
    };
  }

  private composeTargetFamilies(
    plans: readonly PlannedConversion[],
    context: SemanticConversionContext,
  ): readonly PlannedConversion[] {
    const visibilityInputs = context.inputs.filter(input => visibilityDirectives.has(input.directive));
    const strategyInputs = context.inputs.filter(input => !visibilityDirectives.has(input.directive));
    const replacedExtended = this.replaceExtendedPlans(plans, strategyInputs, context);
    const printAware = this.addConfiguredPrintFallbacks(replacedExtended, strategyInputs);
    const initialStrategyPlans = this.generatedPropertyCompositionPlanner.compose(
      this.composeGridDisplay(this.closeGridContainerDependencies(printAware)),
    );
    if (!visibilityInputs.length) {
      return this.extendedDisplayCompositionPlanner.composeWithLayout(initialStrategyPlans);
    }

    const initialVisibilityPlan = this.visibilityStatePlanner.plan(visibilityInputs);
    const extendedComposition = this.extendedDisplayCompositionPlanner.compose(
      initialStrategyPlans,
      initialVisibilityPlan,
    );
    const strategyPlans = extendedComposition.strategyPlans;
    const visibilityPlan = extendedComposition.visibilityPlan;
    const layoutPlans = strategyPlans.filter(plan => plan.input.directive === 'fxLayout');
    const plansByStrategyInputId = new Map(strategyPlans.map(plan => [plan.input.id, plan]));
    const responsiveStyleInputs = strategyInputs.filter(
      input =>
        responsiveStyleAuthorityDirectives.has(input.directive) &&
        plansByStrategyInputId.get(input.id)?.status !== 'converted' &&
        this.extendedDisplayCompositionPlanner.inputMayControlDisplay(input),
    );
    const baseDisplayResolution =
      visibilityPlan.status === 'converted'
        ? this.visibleDisplayResolver.resolve({
            states: visibilityPlan.states,
            layoutPlans,
            existingClassNames: context.existingClassNames,
            attributes: context.attributeEvidence.filter(attribute => !isBoundClassAttribute(attribute)),
            responsiveStyleInputs,
          })
        : { status: 'resolved' as const, utility: undefined };
    const displayResolution = this.extendedDisplayCompositionPlanner.resolveVisibleDisplay(
      baseDisplayResolution,
      strategyPlans,
      visibilityPlan,
    );
    const composed = this.displayCompositionPlanner.compose({ visibilityPlan, displayResolution, layoutPlans });
    const plansById = new Map(
      [...strategyPlans.filter(plan => plan.input.directive !== 'fxLayout'), ...composed.plans].map(plan => [
        plan.input.id,
        plan,
      ]),
    );
    return context.inputs.map(input => plansById.get(input.id) ?? plans.find(plan => plan.input.id === input.id)!).filter(Boolean);
  }

  private replaceExtendedPlans(
    plans: readonly PlannedConversion[],
    inputs: readonly LocatedFlexLayoutInput[],
    context: SemanticConversionContext,
  ): readonly PlannedConversion[] {
    const replacements = new Map<string, PlannedConversion>();
    for (const family of ['extended-class', 'extended-style'] as const) {
      const familyInputs = inputs.filter(input =>
        family === 'extended-class'
          ? extendedClassDirectives.has(input.directive)
          : extendedStyleDirectives.has(input.directive),
      );
      if (!familyInputs.length) continue;
      for (const plan of this.planExtendedFamily(family, familyInputs, context)) {
        replacements.set(plan.input.id, plan);
      }
    }
    return plans
      .filter(plan => !visibilityDirectives.has(plan.input.directive))
      .map(plan => replacements.get(plan.input.id) ?? plan);
  }

  private planExtendedFamily(
    family: 'extended-class' | 'extended-style',
    inputs: readonly LocatedFlexLayoutInput[],
    context: SemanticConversionContext,
  ): readonly PlannedConversion[] {
    if (family === 'extended-class') {
      const familyPlan = this.extendedFamilyPlanner.plan<ResponsiveClassValue>({
        kind: 'class',
        inputs,
        valueParser: input => parseResponsiveClassValue(input, this.tailwindCandidateClassifier),
        equals: equalClassValues,
      });
      return this.extendedResponsivePlanner.plan({
        kind: 'class',
        familyPlan,
        existingClassNames: [],
        attributes: context.attributeEvidence,
      }).plans;
    }
    const familyPlan = this.extendedFamilyPlanner.plan<ResponsiveStyleValue>({
      kind: 'style',
      inputs,
      valueParser: parseResponsiveStyleValue,
      equals: equalStyleValues,
    });
    return this.extendedResponsivePlanner.plan({
      kind: 'style',
      familyPlan,
      existingClassNames: [],
      attributes: context.attributeEvidence,
    }).plans;
  }

  private addConfiguredPrintFallbacks(
    plans: readonly PlannedConversion[],
    inputs: readonly LocatedFlexLayoutInput[],
  ): readonly PlannedConversion[] {
    const configuredAliases = this.printWithBreakpoints;
    if (configuredAliases === undefined) return plans;
    const plansById = new Map(plans.map(plan => [plan.input.id, plan]));
    const selectedIds = new Set<string>();
    const families = new Set(inputs.map(input => directiveFamily(input.directive)).filter(family => family !== undefined));
    for (const family of families) {
      if (family === 'visibility') continue;
      const familyInputs = inputs.filter(input => directiveFamily(input.directive) === family);
      const familyPlans = familyInputs.map(input => plansById.get(input.id)).filter(plan => plan !== undefined);
      if (familyPlans.some(plan => plan.status !== 'converted') || familyInputs.some(input => input.breakpoint === 'print')) {
        continue;
      }
      const selected = familyInputs
        .flatMap(input => {
          if (input.breakpoint === undefined || !configuredAliases.includes(input.breakpoint)) return [];
          const classification = this.breakpointCatalog.classify(input.breakpoint);
          return classification.kind === 'verified' ? [{ input, definition: classification.definition }] : [];
        })
        .sort(
          (left, right) =>
            right.definition.priority - left.definition.priority ||
            configuredAliases.indexOf(left.input.breakpoint ?? '') -
              configuredAliases.indexOf(right.input.breakpoint ?? ''),
        )[0];
      if (selected) selectedIds.add(selected.input.id);
    }
    return plans.map(plan =>
      plan.status === 'converted' && selectedIds.has(plan.input.id)
        ? { ...plan, classNames: [...new Set([...plan.classNames, ...plan.classNames.map(printCandidate)])] }
        : plan,
    );
  }

  private composeGridDisplay(plans: readonly PlannedConversion[]): readonly PlannedConversion[] {
    const convertedInline = plans.find(
      plan => plan.status === 'converted' && plan.input.directive === 'gdInline' && plan.input.breakpoint === undefined,
    );
    const displayOwnerByBreakpoint = new Map<string, string>();
    if (!convertedInline) {
      for (const plan of plans) {
        if (plan.status !== 'converted' || !gridContainerDirectives.has(plan.input.directive)) continue;
        const breakpoint = plan.input.breakpoint ?? 'base';
        if (!displayOwnerByBreakpoint.has(breakpoint)) displayOwnerByBreakpoint.set(breakpoint, plan.input.id);
      }
    }
    return plans.map(plan => {
      if (plan.status !== 'converted' || !gridContainerDirectives.has(plan.input.directive)) return plan;
      const owner = displayOwnerByBreakpoint.get(plan.input.breakpoint ?? 'base');
      if (owner === plan.input.id) return plan;
      return { ...plan, classNames: plan.classNames.filter(className => describeTailwindDisplay(className) === undefined) };
    });
  }

  private closeGridContainerDependencies(plans: readonly PlannedConversion[]): readonly PlannedConversion[] {
    const containerPlans = plans.filter(
      plan => gridContainerDirectives.has(plan.input.directive) || plan.input.directive === 'gdInline',
    );
    if (!containerPlans.some(plan => plan.status !== 'converted')) return plans;
    return plans.map(plan =>
      plan.status === 'converted' &&
      (gridContainerDirectives.has(plan.input.directive) || plan.input.directive === 'gdInline')
        ? contextUnverified(plan.input, 'The Grid container display family contains an unresolved member.')
        : plan,
    );
  }
}
