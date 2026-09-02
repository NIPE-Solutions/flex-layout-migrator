import type { LocatedFlexLayoutInput } from '../../analyzer/flex-layout-attribute.analyzer';
import type { ConversionAdapter, ConversionContext, PlannedConversion } from '../conversion-adapter';
import { planLayoutGap } from './directives/layout-gap.strategy';
import { planFlexItem } from './directives/flex-item.strategy';
import { planFlexOffset } from './directives/flex-offset.strategy';
import type { TailwindStrategyResult } from './tailwind-semantic.model';
import { planLayoutAlign } from './directives/layout-align.strategy';
import { planIndependentDirective } from './independent-directive.registry';
import type { TemplateAttribute } from '../../template/template.model';
import { templateAttributeKeys } from '../../template/template-attribute';
import { planLayout } from './directives/layout.strategy';
import { describeTailwindDisplay, findTailwindClassConflicts } from './tailwind-class-conflict';
import { BreakpointCatalog } from '../../breakpoint/breakpoint-catalog';
import { ResponsiveVariantEmitter } from './responsive-variant.emitter';
import { planResponsiveClasses } from './responsive-plan';
import { ResponsiveFamilyPlanner } from './responsive-family.planner';
import { DisplayCompositionPlanner } from './visibility/display-composition.planner';
import { VisibilityStatePlanner } from './visibility/visibility-state.planner';
import { VisibleDisplayResolver } from './visibility/visible-display.resolver';
import { ExtendedFamilyPlanner } from './extended/extended-family.planner';
import { ExtendedDisplayCompositionPlanner } from './extended/extended-display-composition.planner';
import { ExtendedResponsivePlanner } from './extended/extended-responsive.planner';
import { parseResponsiveClassValue } from './extended/responsive-class-value.parser';
import type { ResponsiveClassValue } from './extended/responsive-class.model';
import { parseResponsiveStyleValue } from './extended/responsive-style-value.parser';
import type { ResponsiveStyleValue } from './extended/responsive-style.model';
import { TailwindCandidateClassifier } from './extended/tailwind-candidate-classifier';
import { GeneratedPropertyCompositionPlanner } from './extended/generated-property-composition.planner';
import { parseGridValue } from '../../grid/grid-value.parser';
import { TailwindGridRenderer } from './grid/tailwind-grid.renderer';

const flexItemDirectives = new Set<LocatedFlexLayoutInput['directive']>(['fxFlex', 'fxGrow', 'fxShrink']);
const visibilityDirectives = new Set<LocatedFlexLayoutInput['directive']>(['fxShow', 'fxHide']);
const responsiveDisplayAuthorityDirectives = new Set<LocatedFlexLayoutInput['directive']>([
  'class',
  'ngClass',
  'style',
  'ngStyle',
]);
const responsiveStyleAuthorityDirectives = new Set<LocatedFlexLayoutInput['directive']>(['style', 'ngStyle']);
const extendedClassDirectives = new Set<LocatedFlexLayoutInput['directive']>(['class', 'ngClass']);
const extendedStyleDirectives = new Set<LocatedFlexLayoutInput['directive']>(['style', 'ngStyle']);
const extendedDirectives = new Set<LocatedFlexLayoutInput['directive']>([
  ...extendedClassDirectives,
  ...extendedStyleDirectives,
]);
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
const gridChildDirectives = new Set<LocatedFlexLayoutInput['directive']>([
  'gdArea',
  'gdColumn',
  'gdGridAlign',
  'gdRow',
]);

const supportedDirectives = new Set<LocatedFlexLayoutInput['directive']>([
  'fxFlex',
  'fxGrow',
  'fxShrink',
  'fxFlexAlign',
  'fxFlexFill',
  'fxFill',
  'fxFlexOffset',
  'fxFlexOrder',
  'fxLayout',
  'fxLayoutAlign',
  'fxLayoutGap',
]);

function toPlannedConversion(input: LocatedFlexLayoutInput, result: TailwindStrategyResult): PlannedConversion {
  if (result.status === 'converted') return { status: 'converted', input, classNames: result.classNames };
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

function toResponsivePlannedConversion(
  input: LocatedFlexLayoutInput,
  result: TailwindStrategyResult,
  catalog: BreakpointCatalog,
  emitter: ResponsiveVariantEmitter,
): PlannedConversion {
  return toPlannedConversion(
    input,
    result.status === 'converted' ? planResponsiveClasses(input, result.classNames, catalog, emitter) : result,
  );
}

function staticLayoutContext(attributes: readonly TemplateAttribute[]): string | undefined {
  const layouts = attributes.filter(
    attribute => attribute.name === 'fxLayout' || attribute.name.startsWith('fxLayout.'),
  );
  if (!layouts.length) return 'row';
  if (layouts.length !== 1) return undefined;
  const layout = layouts[0];
  return layout?.name === 'fxLayout' && layout.binding === 'literal' ? layout.value : undefined;
}

function isBoundClassAttribute(attribute: TemplateAttribute): boolean {
  if (attribute.binding !== 'property') return false;
  return [...templateAttributeKeys(attribute)].some(
    key => key === 'class' || key === 'ngclass' || key.startsWith('class.') || key.startsWith('ngclass.'),
  );
}

function contextUnverified(input: LocatedFlexLayoutInput, reason: string): PlannedConversion {
  return {
    status: 'review',
    input,
    code: 'context-unverified',
    reason,
    suggestion: 'Migrate the complete layout and visibility context together manually.',
  };
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

function equalClassValues(left: ResponsiveClassValue, right: ResponsiveClassValue): boolean {
  return (
    left.tokens.length === right.tokens.length && left.tokens.every((token, index) => token === right.tokens[index])
  );
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

export class TailwindAdapter implements ConversionAdapter {
  readonly name = 'tailwind' as const;
  private readonly breakpointCatalog = new BreakpointCatalog();
  private readonly responsiveEmitter = new ResponsiveVariantEmitter();
  private readonly responsiveFamilyPlanner = new ResponsiveFamilyPlanner(
    this.breakpointCatalog,
    this.responsiveEmitter,
  );
  private readonly visibilityStatePlanner = new VisibilityStatePlanner(this.breakpointCatalog);
  private readonly visibleDisplayResolver = new VisibleDisplayResolver();
  private readonly displayCompositionPlanner = new DisplayCompositionPlanner(this.breakpointCatalog);
  private readonly extendedFamilyPlanner = new ExtendedFamilyPlanner(this.breakpointCatalog);
  private readonly extendedResponsivePlanner = new ExtendedResponsivePlanner();
  private readonly tailwindCandidateClassifier = new TailwindCandidateClassifier();
  private readonly extendedDisplayCompositionPlanner = new ExtendedDisplayCompositionPlanner(
    this.breakpointCatalog,
    this.tailwindCandidateClassifier,
  );
  private readonly generatedPropertyCompositionPlanner = new GeneratedPropertyCompositionPlanner(
    this.breakpointCatalog,
    this.tailwindCandidateClassifier,
  );
  private readonly gridRenderer = new TailwindGridRenderer();

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
        .map(plan => this.directiveFamily(plan.input.directive)),
    );
    return plans.map(plan =>
      plan.status === 'converted' && conflictingFamilies.has(this.directiveFamily(plan.input.directive))
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

  closePlanDependencies(
    plans: readonly PlannedConversion[],
    context: ConversionContext,
    plansByInputId: ReadonlyMap<string, PlannedConversion>,
  ): readonly PlannedConversion[] {
    const inputs = plans.map(plan => plan.input);
    const closeResponsiveDependencies = (current: readonly PlannedConversion[]): readonly PlannedConversion[] => {
      const currentPlans = new Map(current.map(plan => [plan.input.id, plan]));
      return this.responsiveFamilyPlanner.closeDependencies(
        inputs,
        { ...context, inputs },
        (input, itemContext) =>
          currentPlans.get(input.id) ?? plansByInputId.get(input.id) ?? this.planSemantic(input, itemContext),
      );
    };

    let closed = closeResponsiveDependencies(plans);
    closed = this.closeDisplayDependencies(closed);
    closed = closeResponsiveDependencies(closed);
    closed = this.closeDisplayDependencies(closed);
    return this.closeGridParentDependencies(closed, context, plansByInputId);
  }

  private directiveFamily(directive: LocatedFlexLayoutInput['directive']): string {
    if (flexItemDirectives.has(directive)) return 'flex-item';
    if (directive === 'fxFlexFill' || directive === 'fxFill') return 'flex-fill';
    if (visibilityDirectives.has(directive)) return 'visibility';
    if (extendedClassDirectives.has(directive)) return 'extended-class';
    if (extendedStyleDirectives.has(directive)) return 'extended-style';
    return directive;
  }

  planElement(inputs: readonly LocatedFlexLayoutInput[], context: ConversionContext): readonly PlannedConversion[] {
    const visibilityInputs = inputs.filter(input => visibilityDirectives.has(input.directive));
    const strategyInputs = inputs.filter(input => !visibilityDirectives.has(input.directive));
    const plannedStrategies = this.responsiveFamilyPlanner.plan(
      strategyInputs,
      { ...context, inputs },
      (input, itemContext) => this.planSemantic(input, itemContext),
      (family, familyInputs, itemContext) => this.planExtendedFamily(family, familyInputs, itemContext),
    );
    const initialStrategyPlans = this.generatedPropertyCompositionPlanner.compose(
      this.composeGridDisplay(this.closeGridContainerDependencies(plannedStrategies)),
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
            existingClassNames: context.existingClassNames ?? [],
            attributes: (context.attributeEvidence ?? context.element.attributes).filter(
              attribute => !isBoundClassAttribute(attribute),
            ),
            responsiveStyleInputs,
          })
        : { status: 'resolved' as const, utility: undefined };
    const displayResolution = this.extendedDisplayCompositionPlanner.resolveVisibleDisplay(
      baseDisplayResolution,
      strategyPlans,
      visibilityPlan,
    );
    const composed = this.displayCompositionPlanner.compose({
      visibilityPlan,
      displayResolution,
      layoutPlans,
    });
    const plansById = new Map(
      [...strategyPlans.filter(plan => plan.input.directive !== 'fxLayout'), ...composed.plans].map(plan => [
        plan.input.id,
        plan,
      ]),
    );
    return inputs.map(input => plansById.get(input.id) ?? this.planSemantic(input, context));
  }

  plan(input: LocatedFlexLayoutInput, context: ConversionContext): PlannedConversion {
    if (visibilityDirectives.has(input.directive)) {
      const family = this.visibilityStatePlanner.plan([input]);
      if (family.status === 'unresolved')
        return family.plans[0] ?? contextUnverified(input, 'Visibility is unresolved.');
      return contextUnverified(input, 'Visibility requires complete element-family context before conversion.');
    }

    if (extendedDirectives.has(input.directive)) {
      const family = extendedClassDirectives.has(input.directive) ? 'extended-class' : 'extended-style';
      const plans = this.planExtendedFamily(family, [input], { ...context, inputs: [input] });
      const intrinsic = plans[0];
      if (intrinsic?.status !== 'converted') {
        return intrinsic ?? contextUnverified(input, 'The responsive extended family is unresolved.');
      }
      return contextUnverified(
        input,
        'Responsive class and style conversion requires complete element-family context.',
      );
    }

    const semantic = this.planSemantic(input, context);
    if (semantic.status !== 'converted') return semantic;
    return toResponsivePlannedConversion(
      input,
      { status: 'converted', classNames: semantic.classNames },
      this.breakpointCatalog,
      this.responsiveEmitter,
    );
  }

  private planSemantic(input: LocatedFlexLayoutInput, context: ConversionContext): PlannedConversion {
    if (input.binding === 'property') {
      return toPlannedConversion(
        input,
        planResponsiveClasses(input, [], this.breakpointCatalog, this.responsiveEmitter),
      );
    }

    if (!supportedDirectives.has(input.directive)) {
      if (gridDirectives.has(input.directive)) return this.planGrid(input, context);
      return {
        status: 'unsupported',
        input,
        code: 'target-unsupported',
        reason: `The Tailwind target does not support ${input.directive}.`,
        suggestion: 'Keep the directive and migrate it manually.',
      };
    }

    if (input.directive === 'fxLayoutGap') {
      const layoutValue = context.activeLayout ?? staticLayoutContext(context.element.attributes);
      const gap = planLayoutGap(input.value, layoutValue);
      return toPlannedConversion(input, gap);
    }

    if (flexItemDirectives.has(input.directive)) {
      const flexInputs = (context.inputs ?? [input]).filter(item => flexItemDirectives.has(item.directive));
      const sameBreakpoint = (item: LocatedFlexLayoutInput) => item.breakpoint === input.breakpoint;
      const atBreakpoint = (directive: LocatedFlexLayoutInput['directive']) =>
        flexInputs.filter(item => item.directive === directive && sameBreakpoint(item));
      const atBase = (directive: LocatedFlexLayoutInput['directive']) =>
        flexInputs.filter(item => item.directive === directive && item.breakpoint === undefined);
      const exactFlex = atBreakpoint('fxFlex');
      const baseFlex = atBase('fxFlex');
      const basis = exactFlex[0] ?? (input.breakpoint ? baseFlex[0] : undefined);
      const exactGrow = atBreakpoint('fxGrow');
      const exactShrink = atBreakpoint('fxShrink');
      const grow = exactGrow[0] ?? (input.breakpoint ? atBase('fxGrow')[0] : undefined);
      const shrink = exactShrink[0] ?? (input.breakpoint ? atBase('fxShrink')[0] : undefined);
      const duplicateMember = [exactFlex, exactGrow, exactShrink].some(items => items.length > 1);
      if (!basis || duplicateMember) {
        return {
          status: 'invalid',
          input,
          code: 'invalid-value',
          reason: basis
            ? 'Multiple flex sizing inputs define the same responsive state.'
            : `${input.directive} requires an active fxFlex value.`,
          suggestion: 'Keep one flex sizing value per breakpoint or migrate this group manually.',
        };
      }
      const flex = planFlexItem({
        basis: basis.value,
        grow: grow?.value,
        shrink: shrink?.value,
        layout: context.activeParentLayout ?? staticLayoutContext(context.parent?.attributes ?? []),
      });
      if (flex.status === 'converted') {
        return toPlannedConversion(input, flex);
      }
      if (flex.status === 'invalid') {
        return {
          status: 'invalid',
          input,
          code: flex.code,
          reason: `${input.value} is not a supported fxFlex value.`,
          suggestion: 'Correct the value or migrate this directive manually.',
        };
      }
      return { ...flex, input };
    }

    const independent = planIndependentDirective(input);
    if (independent) return toPlannedConversion(input, independent);
    if (input.directive === 'fxFlexOffset') {
      const layout = context.activeParentLayout ?? staticLayoutContext(context.parent?.attributes ?? []);
      return toPlannedConversion(input, planFlexOffset(input.value, layout));
    }
    if (input.directive === 'fxLayoutAlign') {
      const layout = context.activeLayout ?? staticLayoutContext(context.element.attributes);
      if (layout === undefined) {
        return {
          status: 'review',
          input,
          code: 'context-unverified',
          reason: 'Alignment sizing and direction depend on a dynamic or responsive layout.',
          suggestion: 'Make the layout static or migrate layout and alignment together manually.',
        };
      }
      const alignment = planLayoutAlign(input.value, layout);
      if (alignment.ok) {
        return toPlannedConversion(input, { status: 'converted', classNames: alignment.value.classNames });
      }
      return {
        status: 'invalid',
        input,
        code: 'invalid-value',
        reason: `${input.value} is not a supported fxLayoutAlign value.`,
        suggestion: 'Correct the value or migrate this directive manually.',
      };
    }

    if (input.directive === 'fxLayout') {
      const layout = planLayout(input.value);
      if (layout.ok) {
        return toPlannedConversion(input, { status: 'converted', classNames: layout.value.classNames });
      }
    }
    return {
      status: 'invalid',
      input,
      code: 'invalid-value',
      reason: `${input.value} is not a supported ${input.directive} value.`,
      suggestion: 'Correct the value or migrate this directive manually.',
    };
  }

  private planGrid(input: LocatedFlexLayoutInput, context: ConversionContext): PlannedConversion {
    const parsed = parseGridValue(input);
    if (parsed.status === 'review') {
      return {
        status: 'review',
        input,
        code: parsed.code,
        reason: parsed.reason,
        suggestion: 'Replace the binding with a literal or migrate this Grid directive manually.',
      };
    }
    if (parsed.status === 'invalid') {
      return {
        status: 'invalid',
        input,
        code: parsed.code,
        reason: parsed.reason,
        suggestion: 'Correct the value or migrate this Grid directive manually.',
      };
    }

    if (parsed.plan.role === 'child' && !this.hasGridParentContext(context)) {
      return contextUnverified(input, 'The parent element does not have a statically proven Grid container context.');
    }

    const rendered = this.gridRenderer.render(parsed.plan);
    if (rendered.status === 'review') {
      return {
        status: 'review',
        input,
        code: rendered.code,
        reason: rendered.reason,
        suggestion: 'Use an exact Tailwind class manually or retain the Grid directive.',
      };
    }
    const display =
      parsed.plan.role === 'container'
        ? ['grid']
        : parsed.plan.role === 'modifier'
          ? [parsed.plan.inline ? 'inline-grid' : 'grid']
          : [];
    return { status: 'converted', input, classNames: [...display, ...rendered.classNames] };
  }

  private hasGridParentContext(context: ConversionContext): boolean {
    if (context.parentInputs?.some(input => gridContainerDirectives.has(input.directive))) return true;
    return this.hasLiteralGridParentClass(context);
  }

  private closeGridParentDependencies(
    plans: readonly PlannedConversion[],
    context: ConversionContext,
    plansByInputId: ReadonlyMap<string, PlannedConversion>,
  ): readonly PlannedConversion[] {
    if (!plans.some(plan => gridChildDirectives.has(plan.input.directive))) return plans;
    const parentGridInputs =
      context.parentInputs?.filter(
        input => gridContainerDirectives.has(input.directive) || input.directive === 'gdInline',
      ) ?? [];
    const parentPlansAreSafe =
      parentGridInputs.some(input => gridContainerDirectives.has(input.directive)) &&
      parentGridInputs.every(input => plansByInputId.get(input.id)?.status === 'converted');
    if (parentPlansAreSafe || (parentGridInputs.length === 0 && this.hasLiteralGridParentClass(context))) return plans;

    return plans.map(plan =>
      plan.status === 'converted' && gridChildDirectives.has(plan.input.directive)
        ? contextUnverified(plan.input, 'The parent Grid container conversion is unresolved.')
        : plan,
    );
  }

  private hasLiteralGridParentClass(context: ConversionContext): boolean {
    return Boolean(
      context.parent?.attributes.some(attribute => {
        if (attribute.binding !== 'literal' || !templateAttributeKeys(attribute).has('class')) return false;
        return attribute.value.split(/\s+/u).some(className => className === 'grid' || className === 'inline-grid');
      }),
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
      return {
        ...plan,
        classNames: plan.classNames.filter(className => describeTailwindDisplay(className) === undefined),
      };
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

  private planExtendedFamily(
    family: 'extended-class' | 'extended-style',
    inputs: readonly LocatedFlexLayoutInput[],
    context: ConversionContext,
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
        attributes: context.attributeEvidence ?? context.element.attributes,
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
      attributes: context.attributeEvidence ?? context.element.attributes,
    }).plans;
  }

  private closeDisplayDependencies(plans: readonly PlannedConversion[]): readonly PlannedConversion[] {
    const layoutPlans = plans.filter(plan => plan.input.directive === 'fxLayout');
    const visibilityPlans = plans.filter(plan => visibilityDirectives.has(plan.input.directive));
    const authorityPlans = plans.filter(
      plan =>
        responsiveDisplayAuthorityDirectives.has(plan.input.directive) &&
        this.extendedDisplayCompositionPlanner.inputMayControlDisplay(plan.input),
    );
    const visibilityIsNoOp =
      visibilityPlans.length > 0 &&
      visibilityPlans.every(plan => plan.status === 'converted' && plan.classNames.length === 0);
    if ((!layoutPlans.length && !authorityPlans.length) || !visibilityPlans.length || visibilityIsNoOp) return plans;

    const displayContextIsUnresolved = [...layoutPlans, ...visibilityPlans, ...authorityPlans].some(
      plan => plan.status !== 'converted',
    );
    if (!displayContextIsUnresolved) return plans;
    return plans.map(plan =>
      plan.status === 'converted' &&
      (plan.input.directive === 'fxLayout' ||
        visibilityDirectives.has(plan.input.directive) ||
        (responsiveDisplayAuthorityDirectives.has(plan.input.directive) &&
          this.extendedDisplayCompositionPlanner.inputMayControlDisplay(plan.input)))
        ? contextUnverified(
            plan.input,
            'The element display context contains an unresolved layout or visibility family.',
          )
        : plan,
    );
  }
}
