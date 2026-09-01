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

const flexItemDirectives = new Set<LocatedFlexLayoutInput['directive']>(['fxFlex', 'fxGrow', 'fxShrink']);
const visibilityDirectives = new Set<LocatedFlexLayoutInput['directive']>(['fxShow', 'fxHide']);

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
    key => key === 'class' || key === 'ngclass' || key.startsWith('class.'),
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
    return this.closeDisplayDependencies(closed);
  }

  private directiveFamily(directive: LocatedFlexLayoutInput['directive']): string {
    if (flexItemDirectives.has(directive)) return 'flex-item';
    if (directive === 'fxFlexFill' || directive === 'fxFill') return 'flex-fill';
    if (visibilityDirectives.has(directive)) return 'visibility';
    return directive;
  }

  planElement(inputs: readonly LocatedFlexLayoutInput[], context: ConversionContext): readonly PlannedConversion[] {
    const visibilityInputs = inputs.filter(input => visibilityDirectives.has(input.directive));
    const strategyInputs = inputs.filter(input => !visibilityDirectives.has(input.directive));
    const strategyPlans = this.responsiveFamilyPlanner.plan(
      strategyInputs,
      { ...context, inputs },
      (input, itemContext) => this.planSemantic(input, itemContext),
    );
    if (!visibilityInputs.length) return strategyPlans;

    const layoutPlans = strategyPlans.filter(plan => plan.input.directive === 'fxLayout');
    const visibilityPlan = this.visibilityStatePlanner.plan(visibilityInputs);
    const displayResolution =
      visibilityPlan.status === 'converted'
        ? this.visibleDisplayResolver.resolve({
            states: visibilityPlan.states,
            layoutPlans,
            existingClassNames: context.existingClassNames ?? [],
            attributes: (context.attributeEvidence ?? context.element.attributes).filter(
              attribute => !isBoundClassAttribute(attribute),
            ),
          })
        : { status: 'resolved' as const, utility: undefined };
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

  private closeDisplayDependencies(plans: readonly PlannedConversion[]): readonly PlannedConversion[] {
    const layoutPlans = plans.filter(plan => plan.input.directive === 'fxLayout');
    const visibilityPlans = plans.filter(plan => visibilityDirectives.has(plan.input.directive));
    const visibilityIsNoOp =
      visibilityPlans.length > 0 &&
      visibilityPlans.every(plan => plan.status === 'converted' && plan.classNames.length === 0);
    if (!layoutPlans.length || !visibilityPlans.length || visibilityIsNoOp) return plans;

    const displayContextIsUnresolved = [...layoutPlans, ...visibilityPlans].some(plan => plan.status !== 'converted');
    if (!displayContextIsUnresolved) return plans;
    return plans.map(plan =>
      plan.status === 'converted' &&
      (plan.input.directive === 'fxLayout' || visibilityDirectives.has(plan.input.directive))
        ? contextUnverified(
            plan.input,
            'The element display context contains an unresolved layout or visibility family.',
          )
        : plan,
    );
  }
}
