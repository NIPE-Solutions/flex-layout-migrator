import type { LocatedFlexLayoutInput } from '../analyzer/flex-layout-attribute.analyzer';
import type { PlannedConversion } from '../adapter/conversion-adapter';
import {
  BreakpointCatalog,
  mediaDefinitionsIntersect,
  type BreakpointClassification,
} from '../breakpoint/breakpoint-catalog';
import { planFlexAlignSemantics } from '../flex/flex-align.semantic';
import { planFlexFillSemantics } from '../flex/flex-fill.semantic';
import { planFlexItemSemantics } from '../flex/flex-item.semantic';
import { planFlexOffsetSemantics } from '../flex/flex-offset.semantic';
import { planFlexOrderSemantics } from '../flex/flex-order.semantic';
import type { SemanticResult } from '../flex/flex-semantic.model';
import { planLayoutAlignment } from '../flex/layout-align.semantic';
import { planLayoutGapSemantics } from '../flex/layout-gap.semantic';
import { parseLayout } from '../flex/layout.semantic';
import { parseGridValue } from '../grid/grid-value.parser';
import type { ConversionRenderer } from '../render/conversion-renderer';
import { templateAttributeKeys } from '../template/template-attribute';
import type { TemplateAttribute } from '../template/template.model';
import type { SemanticConversionContext } from './conversion-context';
import { ResponsiveFamilyPlanner, type SemanticTargetPolicy } from './responsive-family.planner';
import {
  directiveFamily,
  type DirectiveFamily,
  type ResolvedSemanticPlan,
  type ResolvedSemanticValue,
  type SemanticActivation,
} from './semantic-plan';

type UnresolvedConversion = Exclude<PlannedConversion, { readonly status: 'converted' }>;
type SemanticPlanningPlan = ResolvedSemanticPlan | UnresolvedConversion;

const flexItemDirectives = new Set<LocatedFlexLayoutInput['directive']>(['fxFlex', 'fxGrow', 'fxShrink']);
const visibilityDirectives = new Set<LocatedFlexLayoutInput['directive']>(['fxShow', 'fxHide']);
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
const displayAuthorityDirectives = new Set<LocatedFlexLayoutInput['directive']>([
  'class',
  'ngClass',
  'style',
  'ngStyle',
]);
const localLayoutDirectives = new Set<LocatedFlexLayoutInput['directive']>([
  'fxLayout',
  'fxLayoutGap',
  'fxLayoutAlign',
]);
const parentLayoutDependentDirectives = new Set<LocatedFlexLayoutInput['directive']>([
  'fxFlex',
  'fxGrow',
  'fxShrink',
  'fxFlexOffset',
]);

const semanticBreakpointCatalog = new BreakpointCatalog({
  orientationBreakpoints: true,
  printWithBreakpoints: [],
});

function invalid(input: LocatedFlexLayoutInput): UnresolvedConversion {
  return {
    status: 'invalid',
    input,
    code: 'invalid-value',
    reason: `${input.value} is not a supported ${input.directive} value.`,
    suggestion: 'Correct the value or migrate this directive manually.',
  };
}

function dynamicBinding(input: LocatedFlexLayoutInput, extended = false): UnresolvedConversion {
  return {
    status: 'review',
    input,
    code: 'dynamic-binding',
    reason: extended
      ? 'Angular property bindings and interpolation may depend on runtime state.'
      : 'Angular property bindings may depend on runtime state.',
    suggestion: 'Replace the binding manually or make it a literal before migration.',
  };
}

function contextUnverified(input: LocatedFlexLayoutInput, reason: string): UnresolvedConversion {
  return {
    status: 'review',
    input,
    code: 'context-unverified',
    reason,
    suggestion: 'Migrate the responsive context and its dependent directive families together manually.',
  };
}

function displayContextUnverified(input: LocatedFlexLayoutInput): UnresolvedConversion {
  return {
    status: 'review',
    input,
    code: 'context-unverified',
    reason: 'The element display context contains an unresolved layout or visibility family.',
    suggestion: 'Migrate the complete layout and visibility context together manually.',
  };
}

function visibilityContextUnverified(input: LocatedFlexLayoutInput): UnresolvedConversion {
  return {
    status: 'review',
    input,
    code: 'context-unverified',
    reason: 'Another member of this visibility family is unresolved.',
    suggestion: 'Migrate the complete visibility family together manually.',
  };
}

function responsivePrecedenceUnverified(
  input: LocatedFlexLayoutInput,
  target: ConversionRenderer['target'],
): UnresolvedConversion {
  return {
    status: 'review',
    input,
    code: 'responsive-precedence-unverified',
    reason:
      target === 'css'
        ? 'Overlapping responsive ranges emit different CSS declarations for the same directive family.'
        : 'Overlapping responsive ranges emit different utilities for the same directive family.',
    suggestion: 'Simplify the overlapping declarations or migrate this directive family manually.',
  };
}

function visibilityPrecedenceUnverified(input: LocatedFlexLayoutInput): UnresolvedConversion {
  return {
    status: 'review',
    input,
    code: 'responsive-precedence-unverified',
    reason: 'The visibility family contains conflicting base or overlapping responsive states.',
    suggestion: 'Simplify the conflicting declarations or migrate this visibility family manually.',
  };
}

function unresolvedBreakpoint(
  input: LocatedFlexLayoutInput,
  classification: Exclude<BreakpointClassification, { readonly kind: 'verified' }>,
): UnresolvedConversion {
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

function staticLayoutContext(attributes: readonly TemplateAttribute[]): string | undefined {
  const layouts = attributes.filter(
    attribute => attribute.name === 'fxLayout' || attribute.name.startsWith('fxLayout.'),
  );
  if (!layouts.length) return 'row';
  if (layouts.length !== 1) return undefined;
  const layout = layouts[0];
  return layout?.name === 'fxLayout' && layout.binding === 'literal' ? layout.value : undefined;
}

function activation(input: LocatedFlexLayoutInput): SemanticActivation | UnresolvedConversion {
  if (input.breakpoint === undefined) return { kind: 'base' };
  const classification = semanticBreakpointCatalog.classify(input.breakpoint);
  return classification.kind === 'verified'
    ? { kind: 'media', definition: classification.definition }
    : unresolvedBreakpoint(input, classification);
}

function resolved(input: LocatedFlexLayoutInput, value: ResolvedSemanticValue): ResolvedSemanticPlan {
  const family = directiveFamily(input.directive);
  if (family === undefined) throw new Error(`Semantic planning received an unknown directive: ${input.directive}`);
  return { status: 'converted', input, family, value, activations: [] };
}

function fromSemantic<T extends ResolvedSemanticValue>(
  input: LocatedFlexLayoutInput,
  result: SemanticResult<T>,
): SemanticPlanningPlan {
  if (result.status === 'planned') return resolved(input, result.value);
  if (result.status === 'invalid') return invalid(input);
  return { ...result, input };
}

function sameSemanticOutput(left: SemanticPlanningPlan, right: SemanticPlanningPlan): boolean {
  return (
    left.status === 'converted' &&
    right.status === 'converted' &&
    left.family === right.family &&
    JSON.stringify(left.value) === JSON.stringify(right.value)
  );
}

function rendererEligibility(
  renderer: ConversionRenderer,
  input: LocatedFlexLayoutInput,
): UnresolvedConversion | undefined {
  const eligibility = renderer.eligibility(input);
  if (eligibility?.status === 'converted') {
    throw new Error('Renderer eligibility must not emit target output');
  }
  return eligibility;
}

function semanticPolicy(renderer: ConversionRenderer): SemanticTargetPolicy<SemanticPlanningPlan> {
  return {
    emptyPlan: input => resolved(input, { kind: 'empty' }),
    targetEligibility: input => rendererEligibility(renderer, input),
    validateActivation: plan => {
      if (plan.status !== 'converted') return plan;
      const plannedActivation = activation(plan.input);
      return 'status' in plannedActivation ? plannedActivation : plan;
    },
    isTargetEligibilityFailure: plan =>
      plan.status !== 'converted' &&
      (plan.code === 'target-unsupported' || plan.code === 'breakpoint-unverified' || plan.code === 'custom-breakpoint'),
    sameOutput: sameSemanticOutput,
    contextUnverified,
    contextualOutputUnverified: input =>
      contextUnverified(
        input,
        renderer.target === 'css'
          ? 'This directive emits different declarations across its active responsive layout contexts.'
          : 'This directive emits different utilities across its active responsive layout contexts.',
      ),
    responsivePrecedenceUnverified: input => responsivePrecedenceUnverified(input, renderer.target),
    decorate: plan => {
      if (plan.status !== 'converted') return plan;
      const plannedActivation = activation(plan.input);
      return 'status' in plannedActivation ? plannedActivation : { ...plan, activations: [plannedActivation] };
    },
    addPrintFallback: plan => plan,
  };
}

function parseVisibilityIntent(input: LocatedFlexLayoutInput): 'shown' | 'hidden' {
  const shown = input.value !== 'false';
  return input.directive === 'fxHide' ? (shown ? 'hidden' : 'shown') : shown ? 'shown' : 'hidden';
}

function extendedMayControlDisplay(input: LocatedFlexLayoutInput): boolean {
  if (extendedStyleDirectives.has(input.directive)) return /(?:^|;)\s*display\s*:/iu.test(input.value);
  const displayUtilities = new Set([
    'hidden',
    'block',
    'inline',
    'inline-block',
    'flex',
    'inline-flex',
    'grid',
    'inline-grid',
    'contents',
    'table',
    'list-item',
  ]);
  return input.value.split(/\s+/u).some(token => {
    if (token.includes('[display:')) return true;
    return displayUtilities.has(token.split(':').at(-1)?.replace(/^!/u, '').replace(/!$/u, '') ?? '');
  });
}

function hasLiteralGridParentClass(context: SemanticConversionContext): boolean {
  return Boolean(
    context.parent?.attributes.some(attribute => {
      if (attribute.binding !== 'literal' || !templateAttributeKeys(attribute).has('class')) return false;
      return attribute.value.split(/\s+/u).some(className => className === 'grid' || className === 'inline-grid');
    }),
  );
}

export class ElementSemanticPlanner {
  planInput(
    input: LocatedFlexLayoutInput,
    context: SemanticConversionContext,
    renderer: ConversionRenderer,
  ): PlannedConversion {
    const plan = this.planOne(input, context, renderer);
    if (plan.status !== 'converted') return plan;
    const plannedActivation = activation(input);
    return 'status' in plannedActivation
      ? plannedActivation
      : renderer.render({ ...plan, activations: [plannedActivation] }, context);
  }

  plan(
    inputs: readonly LocatedFlexLayoutInput[],
    context: SemanticConversionContext,
    renderer: ConversionRenderer,
  ): readonly PlannedConversion[] {
    const completeContext = { ...context, inputs };
    const responsive = new ResponsiveFamilyPlanner(semanticBreakpointCatalog, semanticPolicy(renderer));
    const visibilityInputs = inputs.filter(input => visibilityDirectives.has(input.directive));
    const extendedInputs = inputs.filter(input => extendedDirectives.has(input.directive));
    const ordinaryInputs = inputs.filter(
      input => !visibilityDirectives.has(input.directive) && !extendedDirectives.has(input.directive),
    );

    const initial = [
      ...responsive.plan(ordinaryInputs, completeContext, (input, itemContext) =>
        this.planOne(input, itemContext, renderer),
      ),
      ...this.planVisibility(visibilityInputs, renderer),
      ...extendedInputs.map(input => this.planExtended(input, renderer)),
    ];
    const initialById = new Map(initial.map(plan => [plan.input.id, plan]));
    let closed: readonly SemanticPlanningPlan[] = inputs.map(
      input => initialById.get(input.id) ?? this.planOne(input, completeContext, renderer),
    );
    closed = this.closeResponsiveDependencies(closed, completeContext, renderer, responsive);
    closed = this.closeDisplayDependencies(closed, renderer.target);
    closed = this.closeResponsiveDependencies(closed, completeContext, renderer, responsive);
    closed = this.closeDisplayDependencies(closed, renderer.target);
    closed = this.closeGridContainerDependencies(closed);

    return closed.map(plan =>
      plan.status === 'converted' ? renderer.render(plan, completeContext) : plan,
    );
  }

  closeDependencies(
    plans: readonly PlannedConversion[],
    context: SemanticConversionContext,
    plansByInputId: ReadonlyMap<string, PlannedConversion>,
  ): readonly PlannedConversion[] {
    let closed = this.closeRenderedFamilies(plans);
    closed = this.closeRenderedDisplayDependencies(closed);
    closed = this.closeRenderedFamilies(closed);
    closed = this.closeRenderedDisplayDependencies(closed);
    closed = this.closeParentLayoutDependencies(closed, context, plansByInputId);
    return this.closeGridParentDependencies(closed, context, plansByInputId);
  }

  private planOne(
    input: LocatedFlexLayoutInput,
    context: SemanticConversionContext,
    renderer: ConversionRenderer,
  ): SemanticPlanningPlan {
    const eligibility = rendererEligibility(renderer, input);
    if (eligibility) return eligibility;
    if (input.binding === 'property') return dynamicBinding(input);

    if (input.directive === 'fxLayout') {
      const layout = parseLayout(input.value);
      return layout.ok ? resolved(input, layout.value) : invalid(input);
    }
    if (input.directive === 'fxLayoutGap') {
      const layout = context.activeLayout ?? staticLayoutContext(context.element.attributes);
      return fromSemantic(input, planLayoutGapSemantics(input.value, layout));
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
      return fromSemantic(input, planLayoutAlignment(input.value, layout));
    }
    if (flexItemDirectives.has(input.directive)) return this.planFlexItem(input, context);
    if (input.directive === 'fxFlexAlign') return fromSemantic(input, planFlexAlignSemantics(input.value));
    if (input.directive === 'fxFlexFill' || input.directive === 'fxFill') {
      return fromSemantic(input, planFlexFillSemantics());
    }
    if (input.directive === 'fxFlexOffset') {
      const layout = context.activeParentLayout ?? staticLayoutContext(context.parent?.attributes ?? []);
      return fromSemantic(input, planFlexOffsetSemantics(input.value, layout));
    }
    if (input.directive === 'fxFlexOrder') return fromSemantic(input, planFlexOrderSemantics(input.value));
    if (gridDirectives.has(input.directive)) return this.planGrid(input, context);

    return {
      status: 'unsupported',
      input,
      code: 'target-unsupported',
      reason: `The ${renderer.target === 'css' ? 'CSS' : 'Tailwind'} target does not support ${input.directive}.`,
      suggestion: 'Keep the directive and migrate it manually.',
    };
  }

  private planFlexItem(
    input: LocatedFlexLayoutInput,
    context: SemanticConversionContext,
  ): SemanticPlanningPlan {
    const flexInputs = context.inputs.filter(item => flexItemDirectives.has(item.directive));
    const atBreakpoint = (directive: LocatedFlexLayoutInput['directive']) =>
      flexInputs.filter(item => item.directive === directive && item.breakpoint === input.breakpoint);
    const atBase = (directive: LocatedFlexLayoutInput['directive']) =>
      flexInputs.filter(item => item.directive === directive && item.breakpoint === undefined);
    const exactFlex = atBreakpoint('fxFlex');
    const basis = exactFlex[0] ?? (input.breakpoint ? atBase('fxFlex')[0] : undefined);
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

    return fromSemantic(
      input,
      planFlexItemSemantics({
        basis: basis.value,
        grow: grow?.value,
        shrink: shrink?.value,
        layout: context.activeParentLayout ?? staticLayoutContext(context.parent?.attributes ?? []),
      }),
    );
  }

  private planGrid(
    input: LocatedFlexLayoutInput,
    context: SemanticConversionContext,
  ): SemanticPlanningPlan {
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
    if (
      parsed.plan.role === 'child' &&
      !context.parentInputs.some(parentInput => gridContainerDirectives.has(parentInput.directive)) &&
      !hasLiteralGridParentClass(context)
    ) {
      return contextUnverified(input, 'The parent element does not have a statically proven Grid container context.');
    }
    return resolved(input, parsed.plan);
  }

  private planVisibility(
    inputs: readonly LocatedFlexLayoutInput[],
    renderer: ConversionRenderer,
  ): readonly SemanticPlanningPlan[] {
    const plans = inputs.map(input => {
      const eligibility = rendererEligibility(renderer, input);
      if (eligibility) return eligibility;
      if (input.binding !== 'literal') return dynamicBinding(input);
      const plannedActivation = activation(input);
      if ('status' in plannedActivation) return plannedActivation;
      return {
        ...resolved(input, { intent: parseVisibilityIntent(input) }),
        activations: [plannedActivation],
      } satisfies ResolvedSemanticPlan;
    });

    if (plans.some(plan => plan.status !== 'converted')) {
      return plans.map(plan => (plan.status === 'converted' ? visibilityContextUnverified(plan.input) : plan));
    }
    const resolvedPlans = plans as readonly ResolvedSemanticPlan[];
    const basePlans = resolvedPlans.filter(plan => plan.activations[0]?.kind === 'base');
    const baseIntents = new Set(basePlans.map(plan => (plan.value as { readonly intent: string }).intent));
    const responsiveConflict = resolvedPlans.some((left, leftIndex) => {
      const leftActivation = left.activations[0];
      if (leftActivation?.kind !== 'media') return false;
      return resolvedPlans.slice(leftIndex + 1).some(right => {
        const rightActivation = right.activations[0];
        return (
          rightActivation?.kind === 'media' &&
          (left.value as { readonly intent: string }).intent !==
            (right.value as { readonly intent: string }).intent &&
          mediaDefinitionsIntersect(leftActivation.definition.media, rightActivation.definition.media)
        );
      });
    });
    return baseIntents.size > 1 || responsiveConflict
      ? inputs.map(visibilityPrecedenceUnverified)
      : resolvedPlans;
  }

  private planExtended(
    input: LocatedFlexLayoutInput,
    renderer: ConversionRenderer,
  ): SemanticPlanningPlan {
    const eligibility = rendererEligibility(renderer, input);
    if (eligibility) return eligibility;
    if (input.binding !== 'literal' || /\{\{[\s\S]*\}\}/u.test(input.value)) return dynamicBinding(input, true);
    const isClass = extendedClassDirectives.has(input.directive);
    if (input.directive !== (isClass ? 'ngClass' : 'ngStyle') || input.breakpoint === undefined) {
      const kind = isClass ? 'class' : 'style';
      return {
        status: 'review',
        input,
        code: 'semantic-unsupported',
        reason: `Deprecated responsive ${kind} aliases have version-dependent behavior.`,
        suggestion: `Keep the deprecated alias or migrate the complete responsive ${kind} family manually.`,
      };
    }
    const plannedActivation = activation(input);
    if ('status' in plannedActivation) return plannedActivation;
    return {
      ...resolved(
        input,
        isClass
          ? { kind: 'extended-class', source: input.value }
          : { kind: 'extended-style', source: input.value },
      ),
      activations: [plannedActivation],
    };
  }

  private closeResponsiveDependencies(
    plans: readonly SemanticPlanningPlan[],
    context: SemanticConversionContext,
    renderer: ConversionRenderer,
    responsive: ResponsiveFamilyPlanner<SemanticPlanningPlan>,
  ): readonly SemanticPlanningPlan[] {
    const responsiveInputs = plans
      .map(plan => plan.input)
      .filter(input => !extendedDirectives.has(input.directive));
    const current = new Map(plans.map(plan => [plan.input.id, plan]));
    const closed = responsive.closeDependencies(responsiveInputs, context, (input, itemContext) =>
      current.get(input.id) ?? this.planOne(input, itemContext, renderer),
    );
    const closedById = new Map(closed.map(plan => [plan.input.id, plan]));
    return plans.map(plan => closedById.get(plan.input.id) ?? plan);
  }

  private closeDisplayDependencies(
    plans: readonly SemanticPlanningPlan[],
    target: ConversionRenderer['target'],
  ): readonly SemanticPlanningPlan[] {
    const layoutPlans = plans.filter(plan => plan.input.directive === 'fxLayout');
    const visibilityPlans = plans.filter(plan => visibilityDirectives.has(plan.input.directive));
    const authorityPlans =
      target === 'tailwind'
        ? plans.filter(
            plan => displayAuthorityDirectives.has(plan.input.directive) && extendedMayControlDisplay(plan.input),
          )
        : [];
    const visibilityIsNoOp =
      visibilityPlans.length > 0 &&
      visibilityPlans.every(
        plan => plan.status === 'converted' && (plan.value as { readonly intent?: string }).intent === 'shown',
      );
    if ((!layoutPlans.length && !authorityPlans.length) || !visibilityPlans.length || visibilityIsNoOp) return plans;
    if (![...layoutPlans, ...visibilityPlans, ...authorityPlans].some(plan => plan.status !== 'converted')) return plans;

    const affected = new Set([...layoutPlans, ...visibilityPlans, ...authorityPlans].map(plan => plan.input.id));
    return plans.map(plan =>
      plan.status === 'converted' && affected.has(plan.input.id) ? displayContextUnverified(plan.input) : plan,
    );
  }

  private closeGridContainerDependencies(
    plans: readonly SemanticPlanningPlan[],
  ): readonly SemanticPlanningPlan[] {
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

  private closeRenderedFamilies(plans: readonly PlannedConversion[]): readonly PlannedConversion[] {
    const groups = new Map<DirectiveFamily, PlannedConversion[]>();
    for (const plan of plans) {
      const family = directiveFamily(plan.input.directive);
      if (!family) continue;
      const members = groups.get(family) ?? [];
      members.push(plan);
      groups.set(family, members);
    }
    const unresolvedFamilies = new Set(
      [...groups].filter(([, members]) => members.some(plan => plan.status !== 'converted')).map(([family]) => family),
    );
    let closed = plans.map(plan => {
      const family = directiveFamily(plan.input.directive);
      return plan.status === 'converted' && family !== undefined && unresolvedFamilies.has(family)
        ? contextUnverified(plan.input, 'Another member of this responsive directive family is unresolved.')
        : plan;
    });

    if (closed.some(plan => localLayoutDirectives.has(plan.input.directive) && plan.status !== 'converted')) {
      closed = closed.map(plan =>
        plan.status === 'converted' && localLayoutDirectives.has(plan.input.directive)
          ? contextUnverified(
              plan.input,
              'The element layout context contains an unresolved dependent directive family.',
            )
          : plan,
      );
    }
    return closed;
  }

  private closeRenderedDisplayDependencies(plans: readonly PlannedConversion[]): readonly PlannedConversion[] {
    const layoutPlans = plans.filter(plan => plan.input.directive === 'fxLayout');
    const visibilityPlans = plans.filter(plan => visibilityDirectives.has(plan.input.directive));
    const authorityPlans = plans.filter(
      plan =>
        displayAuthorityDirectives.has(plan.input.directive) &&
        (extendedMayControlDisplay(plan.input) ||
          (plan.status !== 'converted' && extendedClassDirectives.has(plan.input.directive))),
    );
    const visibilityIsNoOp =
      visibilityPlans.length > 0 &&
      visibilityPlans.every(plan => plan.status === 'converted' && plan.classNames.length === 0);
    if ((!layoutPlans.length && !authorityPlans.length) || !visibilityPlans.length || visibilityIsNoOp) return plans;
    if (![...layoutPlans, ...visibilityPlans, ...authorityPlans].some(plan => plan.status !== 'converted')) return plans;
    const affected = new Set([...layoutPlans, ...visibilityPlans, ...authorityPlans].map(plan => plan.input.id));
    return plans.map(plan =>
      plan.status === 'converted' && affected.has(plan.input.id) ? displayContextUnverified(plan.input) : plan,
    );
  }

  private closeParentLayoutDependencies(
    plans: readonly PlannedConversion[],
    context: SemanticConversionContext,
    plansByInputId: ReadonlyMap<string, PlannedConversion>,
  ): readonly PlannedConversion[] {
    if (!plans.some(plan => parentLayoutDependentDirectives.has(plan.input.directive))) return plans;
    const parentContextInputs = context.parentInputs.filter(input => localLayoutDirectives.has(input.directive));
    const knownParentPlans = parentContextInputs
      .map(input => plansByInputId.get(input.id))
      .filter((plan): plan is PlannedConversion => plan !== undefined);
    if (!knownParentPlans.some(plan => plan.status !== 'converted')) return plans;
    return plans.map(plan =>
      plan.status === 'converted' && parentLayoutDependentDirectives.has(plan.input.directive)
        ? contextUnverified(plan.input, 'The responsive parent layout family contains an unresolved member.')
        : plan,
    );
  }

  private closeGridParentDependencies(
    plans: readonly PlannedConversion[],
    context: SemanticConversionContext,
    plansByInputId: ReadonlyMap<string, PlannedConversion>,
  ): readonly PlannedConversion[] {
    if (!plans.some(plan => gridChildDirectives.has(plan.input.directive))) return plans;
    const parentGridInputs = context.parentInputs.filter(
      input => gridContainerDirectives.has(input.directive) || input.directive === 'gdInline',
    );
    const parentPlansAreSafe =
      parentGridInputs.some(input => gridContainerDirectives.has(input.directive)) &&
      parentGridInputs.every(input => plansByInputId.get(input.id)?.status === 'converted');
    if (parentPlansAreSafe || (parentGridInputs.length === 0 && hasLiteralGridParentClass(context))) return plans;
    if (parentGridInputs.length > 0 && parentGridInputs.every(input => !plansByInputId.has(input.id))) return plans;

    return plans.map(plan =>
      plan.status === 'converted' && gridChildDirectives.has(plan.input.directive)
        ? contextUnverified(plan.input, 'The parent Grid container conversion is unresolved.')
        : plan,
    );
  }
}
