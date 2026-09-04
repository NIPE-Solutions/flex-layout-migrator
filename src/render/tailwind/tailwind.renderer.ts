import type { LocatedFlexLayoutInput } from '../../analyzer/flex-layout-attribute.analyzer';
import type { BreakpointMigrationConfig } from '../../config/breakpoint-migration-config';
import { MigrationApplicationError } from '../../migrator/migration-application.error';
import type { FlexAlignSemantics } from '../../flex/flex-align.semantic';
import type { FlexFillSemantics } from '../../flex/flex-fill.semantic';
import type { FlexItemSemantics } from '../../flex/flex-item.semantic';
import type { FlexOffsetSemantics } from '../../flex/flex-offset.semantic';
import type { FlexOrderSemantics } from '../../flex/flex-order.semantic';
import type { LayoutAlignmentSemantics } from '../../flex/layout-align.semantic';
import type { LayoutGapSemantics } from '../../flex/layout-gap.semantic';
import type { LayoutSemantics } from '../../flex/layout.semantic';
import type { GridSemanticPlan } from '../../grid/grid-semantic.model';
import { TailwindSourcePropertyEvidence } from '../../evidence/tailwind-source-property.evidence';
import { renderFlexAlign } from '../../adapter/tailwind/directives/flex-align.strategy';
import { renderFlexFill } from '../../adapter/tailwind/directives/flex-fill.strategy';
import { renderFlexItem } from '../../adapter/tailwind/directives/flex-item.strategy';
import { renderFlexOffset } from '../../adapter/tailwind/directives/flex-offset.strategy';
import { renderFlexOrder } from '../../adapter/tailwind/directives/flex-order.strategy';
import { renderLayoutAlignment } from '../../adapter/tailwind/directives/layout-align.strategy';
import { renderLayoutGap } from '../../adapter/tailwind/directives/layout-gap.strategy';
import { renderLayout } from '../../adapter/tailwind/directives/layout.strategy';
import { ExtendedResponsiveEmitter } from '../../adapter/tailwind/extended/extended-responsive.emitter';
import { TailwindGridRenderer } from '../../adapter/tailwind/grid/tailwind-grid.renderer';
import {
  describeTailwindDisplay,
  describeTailwindUtility,
  findTailwindClassConflicts,
} from '../../adapter/tailwind/tailwind-class-conflict';
import { cssPropertiesOverlap } from '../../semantic/css-property-ownership';
import { ResponsiveVariantEmitter } from '../../adapter/tailwind/responsive-variant.emitter';
import { VisibilityEmitter } from '../../adapter/tailwind/visibility/visibility.emitter';
import type { SemanticConversionContext } from '../../semantic/conversion-context';
import {
  directiveFamily,
  type ExtendedClassSemantics,
  type ExtendedStyleSemantics,
  type ResolvedSemanticPlan,
  type VisibilitySemantics,
} from '../../semantic/semantic-plan';
import type { ConversionRenderer, PlannedConversion } from '../conversion-renderer';

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
const extendedDirectives = new Set<LocatedFlexLayoutInput['directive']>(['class', 'ngClass', 'style', 'ngStyle']);
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

export class TailwindRenderer implements ConversionRenderer {
  readonly target = 'tailwind' as const;
  readonly breakpointConfig: BreakpointMigrationConfig;
  readonly sourcePropertyEvidence = new TailwindSourcePropertyEvidence();
  private readonly responsiveEmitter = new ResponsiveVariantEmitter();
  private readonly visibilityEmitter = new VisibilityEmitter();
  private readonly extendedEmitter = new ExtendedResponsiveEmitter();
  private readonly gridRenderer = new TailwindGridRenderer();

  constructor(config: BreakpointMigrationConfig = { orientationBreakpoints: false }) {
    this.breakpointConfig = Object.freeze({ ...config });
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
    return undefined;
  }

  render(plan: ResolvedSemanticPlan, _context: SemanticConversionContext): PlannedConversion {
    const inputFamily = directiveFamily(plan.input.directive);
    if (inputFamily !== plan.family) {
      throw new MigrationApplicationError(
        'internal-invariant',
        `Tailwind renderer received semantic family "${String(plan.family)}" for directive "${plan.input.directive}", which belongs to "${String(inputFamily)}".`,
        [plan.input.fileName],
      );
    }

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
        return this.renderVisibility(plan, plan.value as VisibilitySemantics);
      case 'extended-class':
        return this.renderExtendedClass(plan, plan.value as ExtendedClassSemantics);
      case 'extended-style':
        return this.renderExtendedStyle(plan, plan.value as ExtendedStyleSemantics);
      case 'grid-align-columns':
      case 'grid-align-rows':
      case 'grid-area':
      case 'grid-areas':
      case 'grid-auto':
      case 'grid-column':
      case 'grid-columns':
      case 'grid-gap':
      case 'grid-align':
      case 'grid-inline':
      case 'grid-row':
      case 'grid-rows':
        return this.renderGrid(plan, plan.value as GridSemanticPlan);
      default:
        throw new MigrationApplicationError(
          'internal-invariant',
          `Tailwind renderer does not handle semantic family "${String(plan.family)}".`,
          [plan.input.fileName],
        );
    }
    return {
      status: 'converted',
      input: plan.input,
      classNames: this.applySemanticSuppressions(this.decorate(classNames, plan), plan),
    };
  }

  resolveConflicts(
    plans: readonly PlannedConversion[],
    context: SemanticConversionContext,
  ): readonly PlannedConversion[] {
    return this.resolveClassConflicts(plans, context.existingClassNames);
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
      value.role === 'container' && plan.emitGridDisplay !== false
        ? ['grid']
        : value.role === 'modifier'
          ? [value.inline ? 'inline-grid' : 'grid']
          : [];
    return {
      status: 'converted',
      input: plan.input,
      classNames: this.applySemanticSuppressions(this.decorate([...display, ...rendered.classNames], plan), plan),
    };
  }

  private renderVisibility(plan: ResolvedSemanticPlan, value: VisibilitySemantics): PlannedConversion {
    const classNames = value.emit
      ? [
          ...new Set(
            value.states.flatMap(state =>
              this.visibilityEmitter.emit({ ...state, input: plan.input }, value.restorationDisplay),
            ),
          ),
        ]
      : [];
    return { status: 'converted', input: plan.input, classNames };
  }

  private renderExtendedClass(plan: ResolvedSemanticPlan, value: ExtendedClassSemantics): PlannedConversion {
    const classNames = value.emit
      ? [
          ...new Set(
            value.states.flatMap(state =>
              state.activations.flatMap(itemActivation => {
                if (itemActivation.kind !== 'media') return [];
                return this.extendedEmitter.emitClass({
                  input: plan.input,
                  activation: itemActivation,
                  value: { tokens: state.tokens.map(token => token.source) },
                });
              }),
            ),
          ),
        ]
      : [];
    return {
      status: 'converted',
      input: plan.input,
      classNames: this.applySemanticSuppressions(classNames, plan),
      ...(value.retainedTokens.length > 0
        ? { retainedClassNames: value.retainedTokens.map(token => token.source) }
        : {}),
    };
  }

  private renderExtendedStyle(plan: ResolvedSemanticPlan, value: ExtendedStyleSemantics): PlannedConversion {
    const classNames = value.emit
      ? [
          ...new Set(
            value.states.flatMap(state =>
              state.activations.flatMap(itemActivation => {
                if (itemActivation.kind !== 'media') return [];
                return this.extendedEmitter.emitStyle({
                  input: plan.input,
                  activation: itemActivation,
                  value: { declarations: state.declarations },
                });
              }),
            ),
          ),
        ]
      : [];
    return { status: 'converted', input: plan.input, classNames: this.applySemanticSuppressions(classNames, plan) };
  }

  private applySemanticSuppressions(classNames: readonly string[], plan: ResolvedSemanticPlan): readonly string[] {
    if (!plan.suppressedProperties?.length && !plan.suppressedEffects?.length) return classNames;
    return classNames.filter(className => {
      const descriptor = describeTailwindUtility(className);
      if (descriptor === undefined) return true;
      if (
        plan.suppressedProperties?.some(property =>
          descriptor.cssProperties.some(candidate => cssPropertiesOverlap(candidate, property)),
        )
      ) {
        return false;
      }
      return !(plan.suppressedEffects ?? []).some(suppression => {
        if (
          descriptor.important !== suppression.important ||
          descriptor.cssProperties.length !== suppression.properties.length ||
          !descriptor.cssProperties.every((property, index) => property === suppression.properties[index])
        ) {
          return false;
        }
        if (suppression.activation.kind === 'base') return descriptor.activation.kind === 'base';
        if (descriptor.activation.kind !== 'media') return false;
        if ((descriptor.activation.mediaType ?? 'screen') !== suppression.activation.definition.media.type)
          return false;
        const descriptorActivation = descriptor.activation;
        return suppression.activation.definition.media.clauses.some(
          range =>
            range.min === descriptorActivation.range.min &&
            range.max === descriptorActivation.range.max &&
            range.orientation === descriptorActivation.range.orientation,
        );
      });
    });
  }
}
