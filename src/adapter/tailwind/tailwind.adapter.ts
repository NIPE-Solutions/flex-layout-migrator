import type { LocatedFlexLayoutInput } from '../../analyzer/flex-layout-attribute.analyzer';
import { isKnownBreakpoint } from '../../analyzer/flex-layout.catalog';
import type { ConversionAdapter, ConversionContext, PlannedConversion } from '../conversion-adapter';
import { TailwindClassPlanner } from './tailwind-class.planner';
import { planLayoutGap } from './directives/layout-gap.strategy';
import { planFlexItem } from './directives/flex-item.strategy';
import { planFlexOffset } from './directives/flex-offset.strategy';
import type { TailwindStrategyResult } from './tailwind-semantic.model';
import { planLayoutAlign } from './directives/layout-align.strategy';
import { planIndependentDirective } from './independent-directive.registry';
import type { TemplateAttribute } from '../../template/template.model';

const flexItemDirectives = new Set<LocatedFlexLayoutInput['directive']>(['fxFlex', 'fxGrow', 'fxShrink']);

const supportedDirectives = new Set<LocatedFlexLayoutInput['directive']>([
  'fxFlex',
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

function preserveRequiredLayoutContext(plans: readonly PlannedConversion[]): readonly PlannedConversion[] {
  const unresolvedDependent = plans.some(
    plan =>
      (plan.input.directive === 'fxLayoutGap' || plan.input.directive === 'fxLayoutAlign') &&
      plan.status !== 'converted',
  );
  if (!unresolvedDependent) return plans;
  return plans.map(plan =>
    plan.input.directive === 'fxLayout' && plan.status === 'converted'
      ? {
          status: 'review',
          input: plan.input,
          code: 'context-unverified',
          reason: 'This layout is required to preserve an unresolved context-dependent directive.',
          suggestion: 'Migrate the layout and its dependent directives together after resolving their behavior.',
        }
      : plan,
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

export class TailwindAdapter implements ConversionAdapter {
  readonly name = 'tailwind' as const;
  private readonly classPlanner = new TailwindClassPlanner();

  planElement(inputs: readonly LocatedFlexLayoutInput[], context: ConversionContext): readonly PlannedConversion[] {
    const flexInputs = inputs.filter(input => flexItemDirectives.has(input.directive));
    if (!flexInputs.length) {
      return preserveRequiredLayoutContext(inputs.map(input => this.plan(input, context)));
    }

    const flex = flexInputs.filter(input => input.directive === 'fxFlex');
    let flexPlans: readonly PlannedConversion[];
    if (flex.length !== 1) {
      flexPlans = flexInputs.map(input => ({
        status: 'invalid',
        input,
        code: 'invalid-value',
        reason: flex.length
          ? 'Multiple fxFlex inputs cannot form one static flex item.'
          : `${input.directive} requires fxFlex.`,
        suggestion: 'Keep one static fxFlex directive or migrate this flex item manually.',
      }));
    } else if (flexInputs.some(input => input.binding !== 'literal' || input.breakpoint)) {
      flexPlans = flexInputs.map(input => {
        const ownPlan = this.plan(input, context);
        return input.binding !== 'literal' || input.breakpoint
          ? ownPlan
          : {
              status: 'review',
              input,
              code: 'context-unverified',
              reason: 'The flex sizing group contains a dynamic or responsive member.',
              suggestion: 'Make fxFlex, fxGrow, and fxShrink static or migrate them together manually.',
            };
      });
    } else {
      const layout = staticLayoutContext(context.parent?.attributes ?? []);
      const planned = planFlexItem({
        basis: flex[0]?.value ?? '',
        grow: flexInputs.find(input => input.directive === 'fxGrow')?.value,
        shrink: flexInputs.find(input => input.directive === 'fxShrink')?.value,
        layout,
      });
      flexPlans = flexInputs.map(input => {
        if (planned.status === 'converted') {
          return {
            status: 'converted',
            input,
            classNames: input.directive === 'fxFlex' ? planned.classNames : [],
          };
        }
        if (planned.status === 'invalid') {
          return {
            status: 'invalid',
            input,
            code: planned.code,
            reason: `${input.value} is not a valid member of the flex sizing group.`,
            suggestion: 'Correct the static flex value or migrate the group manually.',
          };
        }
        return { ...planned, input };
      });
    }

    const flexPlanById = new Map(flexPlans.map(plan => [plan.input.id, plan]));
    return preserveRequiredLayoutContext(inputs.map(input => flexPlanById.get(input.id) ?? this.plan(input, context)));
  }

  plan(input: LocatedFlexLayoutInput, context: ConversionContext): PlannedConversion {
    if (input.breakpoint && !isKnownBreakpoint(input.breakpoint)) {
      return {
        status: 'review',
        input,
        code: 'custom-breakpoint',
        reason: `The breakpoint alias ${input.breakpoint} may be registered by the project.`,
        suggestion: 'Provide its media query or migrate this responsive input manually.',
      };
    }

    if (input.binding === 'property') {
      return {
        status: 'review',
        input,
        code: 'dynamic-binding',
        reason: 'Angular property bindings may depend on runtime state.',
        suggestion: 'Replace the binding manually or make it a literal before migration.',
      };
    }

    if (input.breakpoint) {
      return {
        status: 'review',
        input,
        code: 'breakpoint-unverified',
        reason: `Exact media-query output for ${input.breakpoint} is not implemented.`,
        suggestion: 'Keep the responsive directive until exact breakpoint support is available.',
      };
    }

    if (input.directive === 'fxGrow' || input.directive === 'fxShrink') {
      return {
        status: 'invalid',
        input,
        code: 'invalid-value',
        reason: `${input.directive} is owned by an fxFlex directive and cannot be converted independently.`,
        suggestion: 'Add or retain fxFlex and migrate the complete sizing group.',
      };
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
      const layoutValue = staticLayoutContext(context.element.attributes);
      const gap = planLayoutGap(input.value, layoutValue);
      if (gap.status === 'converted') return { status: 'converted', input, classNames: gap.classNames };
      if (gap.status === 'invalid') {
        return {
          status: 'invalid',
          input,
          code: gap.code,
          reason: `${input.value} is not a supported ${input.directive} value.`,
          suggestion: 'Correct the value or migrate this directive manually.',
        };
      }
      return { ...gap, input };
    }

    if (input.directive === 'fxFlex') {
      const flex = planFlexItem({
        basis: input.value,
        layout: staticLayoutContext(context.parent?.attributes ?? []),
      });
      if (flex.status === 'converted') return { status: 'converted', input, classNames: flex.classNames };
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
      const layout = staticLayoutContext(context.parent?.attributes ?? []);
      return toPlannedConversion(input, planFlexOffset(input.value, layout));
    }
    if (input.directive === 'fxLayoutAlign') {
      const layout = staticLayoutContext(context.element.attributes);
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
      if (alignment.ok) return { status: 'converted', input, classNames: alignment.value.classNames };
      return {
        status: 'invalid',
        input,
        code: 'invalid-value',
        reason: `${input.value} is not a supported fxLayoutAlign value.`,
        suggestion: 'Correct the value or migrate this directive manually.',
      };
    }

    const classNames = this.classPlanner.plan(input, context);
    if (!classNames) {
      return {
        status: 'invalid',
        input,
        code: 'invalid-value',
        reason: `${input.value} is not a supported ${input.directive} value.`,
        suggestion: 'Correct the value or migrate this directive manually.',
      };
    }

    return { status: 'converted', input, classNames };
  }
}
