import type { LocatedFlexLayoutInput } from '../analyzer/flex-layout-attribute.analyzer';
import type { PlannedConversion } from '../adapter/conversion-adapter';
import { BreakpointCatalog, type BreakpointClassification } from '../breakpoint/breakpoint-catalog';
import type { BreakpointMigrationConfig } from '../config/breakpoint-migration-config';
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
import { cssPropertiesOverlap } from './css-property-ownership';
import { ExtendedFamilyPlanner } from './extended/extended-family.planner';
import { ExtendedSemanticPlanner } from './extended/extended-semantic.planner';
import { parseResponsiveClassValue, type SemanticResponsiveClassValue } from './extended/responsive-class-value.parser';
import type { ResponsiveStyleValue } from './extended/responsive-style.model';
import { parseResponsiveStyleValue } from './extended/responsive-style-value.parser';
import { SemanticFamilyCompositionPlanner } from './semantic-family-composition.planner';
import { parseLiteralStyleDeclarations } from './literal-style-declaration';
import { ResponsiveFamilyPlanner, type SemanticTargetPolicy } from './responsive-family.planner';
import {
  directiveFamily,
  type DirectiveFamily,
  type ResolvedSemanticPlan,
  type ResolvedSemanticValue,
  type SemanticActivation,
  type VisibilitySemantics,
} from './semantic-plan';
import { type SourcePropertyEvidence, unknownSourcePropertyEvidence } from './source-property-evidence';
import { VisibilityStatePlanner } from './visibility/visibility-state.planner';
import { parseVisibilityValue } from './visibility/visibility-value.parser';

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

const defaultSemanticBreakpointConfig: BreakpointMigrationConfig = {
  orientationBreakpoints: true,
  printWithBreakpoints: [],
};

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

function activation(
  input: LocatedFlexLayoutInput,
  catalog: BreakpointCatalog,
): SemanticActivation | UnresolvedConversion {
  if (input.breakpoint === undefined) return { kind: 'base' };
  const classification = catalog.classify(input.breakpoint);
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

function semanticPolicy(
  renderer: ConversionRenderer,
  catalog: BreakpointCatalog,
): SemanticTargetPolicy<SemanticPlanningPlan> {
  return {
    emptyPlan: input => resolved(input, { kind: 'empty' }),
    targetEligibility: input => rendererEligibility(renderer, input),
    validateActivation: plan => {
      if (plan.status !== 'converted') return plan;
      const plannedActivation = activation(plan.input, catalog);
      return 'status' in plannedActivation ? plannedActivation : plan;
    },
    isTargetEligibilityFailure: plan =>
      plan.status !== 'converted' &&
      (plan.code === 'target-unsupported' ||
        plan.code === 'breakpoint-unverified' ||
        plan.code === 'custom-breakpoint'),
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
      const plannedActivation = activation(plan.input, catalog);
      return 'status' in plannedActivation ? plannedActivation : { ...plan, activations: [plannedActivation] };
    },
    addPrintFallback: plan => {
      if (plan.status !== 'converted') return plan;
      const print = catalog.classify('print');
      return print.kind === 'verified'
        ? { ...plan, activations: [...plan.activations, { kind: 'media', definition: print.definition }] }
        : plan;
    },
  };
}

function equalClassValues(left: SemanticResponsiveClassValue, right: SemanticResponsiveClassValue): boolean {
  return (
    left.tokens.length === right.tokens.length &&
    left.tokens.every((token, index) => token.source === right.tokens[index]?.source)
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

function extendedMayControlDisplay(input: LocatedFlexLayoutInput, evidence: SourcePropertyEvidence): boolean {
  if (input.binding !== 'literal') return true;
  if (extendedStyleDirectives.has(input.directive)) {
    const parsed = parseLiteralStyleDeclarations(input.value);
    return (
      parsed.status === 'unverified' ||
      parsed.declarations.some(declaration => cssPropertiesOverlap(declaration.property, 'display'))
    );
  }
  return input.value
    .split(/\s+/u)
    .filter(Boolean)
    .some(token => {
      const classification = evidence.classifyClassToken(token);
      return (
        classification.status === 'unverified' ||
        classification.evidence.properties.some(property => cssPropertiesOverlap(property, 'display'))
      );
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

function configuredPrintOwner(
  inputs: readonly LocatedFlexLayoutInput[],
  catalog: BreakpointCatalog,
): { readonly inputId: string; readonly activation: SemanticActivation } | undefined {
  const configuredAliases = catalog.printWithBreakpoints;
  if (configuredAliases === undefined || inputs.some(input => input.breakpoint === 'print')) return undefined;
  const print = catalog.classify('print');
  if (print.kind !== 'verified') return undefined;
  const selected = inputs
    .flatMap(input => {
      if (input.breakpoint === undefined || !configuredAliases.includes(input.breakpoint)) return [];
      const classification = catalog.classify(input.breakpoint);
      return classification.kind === 'verified' ? [{ input, definition: classification.definition }] : [];
    })
    .sort(
      (left, right) =>
        right.definition.priority - left.definition.priority ||
        configuredAliases.indexOf(left.input.breakpoint ?? '') -
          configuredAliases.indexOf(right.input.breakpoint ?? ''),
    )[0];
  return selected === undefined
    ? undefined
    : { inputId: selected.input.id, activation: { kind: 'media', definition: print.definition } };
}

export class ElementSemanticPlanner {
  constructor(private readonly breakpointConfig?: BreakpointMigrationConfig) {}

  plan(
    inputs: readonly LocatedFlexLayoutInput[],
    context: SemanticConversionContext,
    renderer: ConversionRenderer,
  ): readonly PlannedConversion[] {
    const completeContext = { ...context, inputs };
    const catalog = this.catalog(renderer);
    const responsive = new ResponsiveFamilyPlanner(catalog, semanticPolicy(renderer, catalog));
    const visibilityInputs = inputs.filter(input => visibilityDirectives.has(input.directive));
    const extendedInputs = inputs.filter(input => extendedDirectives.has(input.directive));
    const ordinaryInputs = inputs.filter(
      input => !visibilityDirectives.has(input.directive) && !extendedDirectives.has(input.directive),
    );

    const initial = [
      ...responsive.plan(ordinaryInputs, completeContext, (input, itemContext) =>
        this.planOne(input, itemContext, renderer),
      ),
      ...this.planVisibility(visibilityInputs, renderer, catalog),
      ...this.planExtendedFamilies(extendedInputs, completeContext, renderer, catalog),
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
    closed = this.assignGridDisplayOwnership(closed);
    closed = new SemanticFamilyCompositionPlanner(
      catalog,
      renderer.sourcePropertyEvidence ?? unknownSourcePropertyEvidence,
    ).compose(closed, completeContext);

    return closed.map(plan => (plan.status === 'converted' ? renderer.render(plan, completeContext) : plan));
  }

  closeDependencies(
    plans: readonly PlannedConversion[],
    context: SemanticConversionContext,
    plansByInputId: ReadonlyMap<string, PlannedConversion>,
    sourceEvidence: SourcePropertyEvidence = unknownSourcePropertyEvidence,
  ): readonly PlannedConversion[] {
    let closed = this.closeRenderedFamilies(plans);
    closed = this.closeRenderedDisplayDependencies(closed, sourceEvidence);
    closed = this.closeRenderedFamilies(closed);
    closed = this.closeRenderedDisplayDependencies(closed, sourceEvidence);
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

  private planFlexItem(input: LocatedFlexLayoutInput, context: SemanticConversionContext): SemanticPlanningPlan {
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

  private planGrid(input: LocatedFlexLayoutInput, context: SemanticConversionContext): SemanticPlanningPlan {
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
    catalog: BreakpointCatalog,
  ): readonly SemanticPlanningPlan[] {
    const eligibility = new Map(inputs.map(input => [input.id, rendererEligibility(renderer, input)]));
    if ([...eligibility.values()].some(plan => plan !== undefined)) {
      return inputs.map(input => eligibility.get(input.id) ?? visibilityContextUnverified(input));
    }

    const familyPlan = new VisibilityStatePlanner(catalog).plan(inputs);
    if (familyPlan.status === 'unresolved') {
      return familyPlan.plans.map(plan =>
        plan.status === 'converted' ? visibilityContextUnverified(plan.input) : plan,
      );
    }
    const states = familyPlan.states.map(state => ({ intent: state.intent, activation: state.activation }));
    const owner = familyPlan.states[0]?.input.id;
    return inputs.map(input => ({
      ...resolved(input, { kind: 'visibility', emit: input.id === owner, states }),
      activations: [],
    }));
  }

  private planExtendedFamilies(
    inputs: readonly LocatedFlexLayoutInput[],
    context: SemanticConversionContext,
    renderer: ConversionRenderer,
    catalog: BreakpointCatalog,
  ): readonly SemanticPlanningPlan[] {
    const plansById = new Map<string, SemanticPlanningPlan>();
    const familyPlanner = new ExtendedFamilyPlanner(catalog);
    const sourceEvidence = renderer.sourcePropertyEvidence ?? unknownSourcePropertyEvidence;
    const semanticPlanner = new ExtendedSemanticPlanner(sourceEvidence);

    for (const family of ['extended-class', 'extended-style'] as const) {
      const familyInputs = inputs.filter(input =>
        family === 'extended-class'
          ? extendedClassDirectives.has(input.directive)
          : extendedStyleDirectives.has(input.directive),
      );
      if (!familyInputs.length) continue;
      const eligibility = new Map(familyInputs.map(input => [input.id, rendererEligibility(renderer, input)]));
      if ([...eligibility.values()].some(plan => plan !== undefined)) {
        for (const input of familyInputs) {
          plansById.set(
            input.id,
            eligibility.get(input.id) ??
              contextUnverified(input, 'Another member of this responsive family is unresolved.'),
          );
        }
        continue;
      }

      if (family === 'extended-class') {
        const familyPlan = familyPlanner.plan<SemanticResponsiveClassValue>({
          kind: 'class',
          inputs: familyInputs,
          valueParser: input => parseResponsiveClassValue(input, sourceEvidence),
          equals: equalClassValues,
        });
        const decision = semanticPlanner.plan({
          kind: 'class',
          familyPlan,
          attributes: context.attributeEvidence,
        });
        if (familyPlan.status === 'unresolved') {
          for (const plan of familyPlan.plans) {
            plansById.set(
              plan.input.id,
              plan.status === 'converted'
                ? contextUnverified(plan.input, 'Another member of this responsive family is unresolved.')
                : plan,
            );
          }
          continue;
        }
        if (decision.status === 'unresolved') {
          for (const plan of decision.plans) {
            plansById.set(
              plan.input.id,
              plan.status === 'converted'
                ? contextUnverified(plan.input, 'Another member of this responsive family is unresolved.')
                : plan,
            );
          }
          continue;
        }
        const printOwner = configuredPrintOwner(familyInputs, catalog);
        const states = familyPlan.states.map(state => ({
          activations: [state.activation, ...(printOwner?.inputId === state.input.id ? [printOwner.activation] : [])],
          tokens: state.value.tokens,
        }));
        for (const input of familyInputs) {
          plansById.set(input.id, {
            ...resolved(input, {
              kind: 'extended-class',
              emit: decision.ownerInputId === input.id,
              retainedTokens:
                decision.ownerInputId === undefined && input.id === familyPlan.states[0]?.input.id
                  ? decision.retainedTokens
                  : [],
              states,
            }),
            activations: [],
          });
        }
        continue;
      }

      const familyPlan = familyPlanner.plan<ResponsiveStyleValue>({
        kind: 'style',
        inputs: familyInputs,
        valueParser: input => parseResponsiveStyleValue(input, sourceEvidence),
        equals: equalStyleValues,
      });
      const decision = semanticPlanner.plan({
        kind: 'style',
        familyPlan,
        attributes: context.attributeEvidence,
      });
      if (familyPlan.status === 'unresolved') {
        for (const plan of familyPlan.plans) {
          plansById.set(
            plan.input.id,
            plan.status === 'converted'
              ? contextUnverified(plan.input, 'Another member of this responsive family is unresolved.')
              : plan,
          );
        }
        continue;
      }
      if (decision.status === 'unresolved') {
        for (const plan of decision.plans) {
          plansById.set(
            plan.input.id,
            plan.status === 'converted'
              ? contextUnverified(plan.input, 'Another member of this responsive family is unresolved.')
              : plan,
          );
        }
        continue;
      }
      const printOwner = configuredPrintOwner(familyInputs, catalog);
      const states = familyPlan.states.map(state => ({
        activations: [state.activation, ...(printOwner?.inputId === state.input.id ? [printOwner.activation] : [])],
        declarations: state.value.declarations,
      }));
      for (const input of familyInputs) {
        plansById.set(input.id, {
          ...resolved(input, {
            kind: 'extended-style',
            emit: decision.ownerInputId === input.id,
            states,
          }),
          activations: [],
        });
      }
    }

    return inputs.map(input => plansById.get(input.id) ?? dynamicBinding(input, true));
  }

  private closeResponsiveDependencies(
    plans: readonly SemanticPlanningPlan[],
    context: SemanticConversionContext,
    renderer: ConversionRenderer,
    responsive: ResponsiveFamilyPlanner<SemanticPlanningPlan>,
  ): readonly SemanticPlanningPlan[] {
    const responsiveInputs = plans.map(plan => plan.input).filter(input => !extendedDirectives.has(input.directive));
    const current = new Map(plans.map(plan => [plan.input.id, plan]));
    const closed = responsive.closeDependencies(
      responsiveInputs,
      context,
      (input, itemContext) => current.get(input.id) ?? this.planOne(input, itemContext, renderer),
    );
    const closedById = new Map(closed.map(plan => [plan.input.id, plan]));
    return plans.map(plan => closedById.get(plan.input.id) ?? plan);
  }

  private closeDisplayDependencies(
    plans: readonly SemanticPlanningPlan[],
    target: ConversionRenderer['target'],
  ): readonly SemanticPlanningPlan[] {
    if (target === 'tailwind') return plans;
    const layoutPlans = plans.filter(plan => plan.input.directive === 'fxLayout');
    const visibilityPlans = plans.filter(plan => visibilityDirectives.has(plan.input.directive));
    const authorityPlans: readonly SemanticPlanningPlan[] = [];
    const visibilityIsNoOp =
      visibilityPlans.length > 0 &&
      visibilityPlans.every(
        plan =>
          plan.status === 'converted' &&
          plan.family === 'visibility' &&
          (plan.value as VisibilitySemantics).states.every(state => state.intent === 'shown'),
      );
    if ((!layoutPlans.length && !authorityPlans.length) || !visibilityPlans.length || visibilityIsNoOp) return plans;
    if (![...layoutPlans, ...visibilityPlans, ...authorityPlans].some(plan => plan.status !== 'converted'))
      return plans;

    const affected = new Set([...layoutPlans, ...visibilityPlans, ...authorityPlans].map(plan => plan.input.id));
    return plans.map(plan =>
      plan.status === 'converted' && affected.has(plan.input.id) ? displayContextUnverified(plan.input) : plan,
    );
  }

  private closeGridContainerDependencies(plans: readonly SemanticPlanningPlan[]): readonly SemanticPlanningPlan[] {
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

  private assignGridDisplayOwnership(plans: readonly SemanticPlanningPlan[]): readonly SemanticPlanningPlan[] {
    const hasBaseInline = plans.some(
      plan => plan.status === 'converted' && plan.input.directive === 'gdInline' && plan.input.breakpoint === undefined,
    );
    const ownerByBreakpoint = new Map<string, string>();
    if (!hasBaseInline) {
      for (const plan of plans) {
        if (plan.status !== 'converted' || !gridContainerDirectives.has(plan.input.directive)) continue;
        const breakpoint = plan.input.breakpoint ?? 'base';
        if (!ownerByBreakpoint.has(breakpoint)) ownerByBreakpoint.set(breakpoint, plan.input.id);
      }
    }
    return plans.map(plan =>
      plan.status === 'converted' && gridContainerDirectives.has(plan.input.directive)
        ? { ...plan, emitGridDisplay: ownerByBreakpoint.get(plan.input.breakpoint ?? 'base') === plan.input.id }
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

  private closeRenderedDisplayDependencies(
    plans: readonly PlannedConversion[],
    evidence: SourcePropertyEvidence,
  ): readonly PlannedConversion[] {
    const layoutPlans = plans.filter(plan => plan.input.directive === 'fxLayout');
    const visibilityPlans = plans.filter(plan => visibilityDirectives.has(plan.input.directive));
    const authorityPlans = plans.filter(
      plan =>
        displayAuthorityDirectives.has(plan.input.directive) &&
        (extendedMayControlDisplay(plan.input, evidence) ||
          (plan.status !== 'converted' && extendedClassDirectives.has(plan.input.directive))),
    );
    const visibilityIsNoOp =
      visibilityPlans.length > 0 &&
      visibilityPlans.every(plan => plan.status === 'converted' && parseVisibilityValue(plan.input) === 'shown');
    if ((!layoutPlans.length && !authorityPlans.length) || !visibilityPlans.length || visibilityIsNoOp) return plans;
    if (![...layoutPlans, ...visibilityPlans, ...authorityPlans].some(plan => plan.status !== 'converted'))
      return plans;
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

  private catalog(renderer: ConversionRenderer): BreakpointCatalog {
    return new BreakpointCatalog(this.breakpointConfig ?? renderer.breakpointConfig ?? defaultSemanticBreakpointConfig);
  }
}
