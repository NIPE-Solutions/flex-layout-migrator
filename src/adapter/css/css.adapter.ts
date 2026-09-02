import type { BreakpointDefinition } from '../../breakpoint/breakpoint-catalog';
import { BreakpointCatalog } from '../../breakpoint/breakpoint-catalog';
import type { BreakpointMigrationConfig } from '../../config/breakpoint-migration-config';
import { planFlexAlignSemantics } from '../../flex/flex-align.semantic';
import { planFlexFillSemantics } from '../../flex/flex-fill.semantic';
import { planFlexItemSemantics } from '../../flex/flex-item.semantic';
import { planFlexOffsetSemantics } from '../../flex/flex-offset.semantic';
import { planFlexOrderSemantics } from '../../flex/flex-order.semantic';
import type { SemanticResult } from '../../flex/flex-semantic.model';
import { planLayoutAlignment } from '../../flex/layout-align.semantic';
import { planLayoutGapSemantics } from '../../flex/layout-gap.semantic';
import { parseLayout } from '../../flex/layout.semantic';
import type { AdapterSessionResult, ConversionAdapterSession } from '../conversion-adapter.session';
import { sessionBoundAdapter } from '../conversion-adapter.session';
import type { ConversionAdapter, ConversionContext, PlannedConversion } from '../conversion-adapter';
import { SharedResponsiveFamilyPlanner } from '../responsive-family.planner';
import type { CssDeclaration, CssSemanticFamily } from './css-artifact.model';
import { CssArtifactRegistry } from './css-artifact.registry';
import { cssRuleContext } from './css-breakpoint.context';
import { CssInvariantError } from './css-invariant.error';
import { renderFlexAlignCss } from './flex/flex-align.css-renderer';
import { renderFlexFillCss } from './flex/flex-fill.css-renderer';
import { renderFlexItemCss } from './flex/flex-item.css-renderer';
import { renderFlexOffsetCss } from './flex/flex-offset.css-renderer';
import { renderFlexOrderCss } from './flex/flex-order.css-renderer';
import { renderLayoutAlignmentCss } from './flex/layout-align.css-renderer';
import { renderLayoutGapCss } from './flex/layout-gap.css-renderer';
import { renderLayoutCss } from './flex/layout.css-renderer';

type AdapterInput = Parameters<ConversionAdapter['plan']>[0];
type AdapterDirective = AdapterInput['directive'];
type UnresolvedPlan = Exclude<PlannedConversion, { readonly status: 'converted' }>;

interface ConvertedCssPlan {
  readonly status: 'converted';
  readonly input: AdapterInput;
  readonly classNames: readonly string[];
  readonly family?: CssSemanticFamily;
  readonly declarations?: readonly CssDeclaration[];
}

type CssPlan = ConvertedCssPlan | UnresolvedPlan;

const flexItemDirectives = new Set<AdapterDirective>(['fxFlex', 'fxGrow', 'fxShrink']);
const visibilityDirectives = new Set<AdapterDirective>(['fxShow', 'fxHide']);
const familyByDirective = new Map<AdapterDirective, CssSemanticFamily>([
  ['fxLayout', 'layout'],
  ['fxLayoutGap', 'layout-gap'],
  ['fxLayoutAlign', 'layout-align'],
  ['fxFlex', 'flex-item'],
  ['fxGrow', 'flex-item'],
  ['fxShrink', 'flex-item'],
  ['fxFlexAlign', 'flex-align'],
  ['fxFlexFill', 'flex-fill'],
  ['fxFill', 'flex-fill'],
  ['fxFlexOffset', 'flex-offset'],
  ['fxFlexOrder', 'flex-order'],
]);

function invalid(input: AdapterInput): UnresolvedPlan {
  return {
    status: 'invalid',
    input,
    code: 'invalid-value',
    reason: `${input.value} is not a supported ${input.directive} value.`,
    suggestion: 'Correct the value or migrate this directive manually.',
  };
}

function targetUnsupported(input: AdapterInput): UnresolvedPlan {
  return {
    status: 'unsupported',
    input,
    code: 'target-unsupported',
    reason: `The CSS target does not support ${input.sourceName}.`,
    suggestion: 'Use the Tailwind target when it supports this input, or migrate the directive manually.',
  };
}

function dynamicBinding(input: AdapterInput): UnresolvedPlan {
  return {
    status: 'review',
    input,
    code: 'dynamic-binding',
    reason: 'Angular property bindings may depend on runtime state.',
    suggestion: 'Replace the binding manually or make it a literal before migration.',
  };
}

function contextUnverified(input: AdapterInput, reason: string): UnresolvedPlan {
  return {
    status: 'review',
    input,
    code: 'context-unverified',
    reason,
    suggestion: 'Migrate the responsive context and its dependent directive families together manually.',
  };
}

function responsivePrecedenceUnverified(input: AdapterInput): UnresolvedPlan {
  return {
    status: 'review',
    input,
    code: 'responsive-precedence-unverified',
    reason: 'Overlapping responsive ranges emit different CSS declarations for the same directive family.',
    suggestion: 'Simplify the overlapping declarations or migrate this directive family manually.',
  };
}

function displayContextUnverified(input: AdapterInput): UnresolvedPlan {
  return {
    status: 'review',
    input,
    code: 'context-unverified',
    reason: 'The element display context contains an unresolved layout or visibility family.',
    suggestion: 'Migrate the complete layout and visibility context together manually.',
  };
}

function staticLayoutContext(attributes: ConversionContext['element']['attributes']): string | undefined {
  const layouts = attributes.filter(
    attribute => attribute.name === 'fxLayout' || attribute.name.startsWith('fxLayout.'),
  );
  if (!layouts.length) return 'row';
  if (layouts.length !== 1) return undefined;
  const layout = layouts[0];
  return layout?.name === 'fxLayout' && layout.binding === 'literal' ? layout.value : undefined;
}

function fromSemantic<T>(
  input: AdapterInput,
  family: CssSemanticFamily,
  result: SemanticResult<T>,
  render: (value: T) => readonly CssDeclaration[],
): CssPlan {
  if (result.status === 'planned') {
    return { status: 'converted', input, classNames: [], family, declarations: render(result.value) };
  }
  if (result.status === 'invalid') return invalid(input);
  return { ...result, input };
}

function canonicalClasses(plan: ConvertedCssPlan): readonly string[] {
  return [...new Set(plan.classNames)].sort();
}

function sameOutput(left: CssPlan, right: CssPlan): boolean {
  if (left.status !== 'converted' || right.status !== 'converted') return false;
  if (left.declarations !== undefined && right.declarations !== undefined) {
    return (
      left.family === right.family &&
      left.declarations.length === right.declarations.length &&
      left.declarations.every(
        (declaration, index) =>
          declaration.property === right.declarations?.[index]?.property &&
          declaration.value === right.declarations?.[index]?.value,
      )
    );
  }
  const leftClasses = canonicalClasses(left);
  const rightClasses = canonicalClasses(right);
  return (
    leftClasses.length === rightClasses.length &&
    leftClasses.every((className, index) => className === rightClasses[index])
  );
}

function closeDisplayDependencies<TPlan extends CssPlan>(
  plans: readonly TPlan[],
  downgrade: (input: AdapterInput) => TPlan,
): readonly TPlan[] {
  const visibilityIsUnresolved = plans.some(
    plan => visibilityDirectives.has(plan.input.directive) && plan.status !== 'converted',
  );
  if (!visibilityIsUnresolved) return plans;
  return plans.map(plan =>
    plan.status === 'converted' && plan.input.directive === 'fxLayout' ? downgrade(plan.input) : plan,
  );
}

export class CssAdapter implements ConversionAdapter {
  readonly name = 'css' as const;
  private readonly breakpointCatalog = new BreakpointCatalog();
  private readonly responsiveFamilyPlanner: SharedResponsiveFamilyPlanner<CssPlan>;
  private readonly referencedClassNamesByInputId = new Map<string, readonly string[]>();

  constructor(private readonly registry: CssArtifactRegistry) {
    this.responsiveFamilyPlanner = new SharedResponsiveFamilyPlanner(this.breakpointCatalog, {
      emptyPlan: input => this.emptyPlan(input),
      targetEligibility: input => this.targetEligibility(input),
      validateActivation: plan => plan,
      isTargetEligibilityFailure: plan => plan.status === 'unsupported' && plan.code === 'target-unsupported',
      sameOutput,
      contextUnverified,
      contextualOutputUnverified: input =>
        contextUnverified(
          input,
          'This directive emits different declarations across its active responsive layout contexts.',
        ),
      responsivePrecedenceUnverified,
      decorate: plan => plan,
      addPrintFallback: plan => plan,
    });
  }

  plan(input: AdapterInput, context: ConversionContext): PlannedConversion {
    return this.emit(this.targetEligibility(input) ?? this.planSemantic(input, context));
  }

  planElement(inputs: readonly AdapterInput[], context: ConversionContext): readonly PlannedConversion[] {
    const completeContext: ConversionContext = { ...context, inputs };
    let plans = this.responsiveFamilyPlanner.plan(inputs, completeContext, (input, itemContext) =>
      this.planSemantic(input, itemContext),
    );
    plans = closeDisplayDependencies(plans, input => displayContextUnverified(input) as CssPlan);
    plans = this.closeResponsiveDependencies(plans, completeContext, new Map());
    plans = closeDisplayDependencies(plans, input => displayContextUnverified(input) as CssPlan);
    return plans.map(plan => this.emit(plan));
  }

  closePlanDependencies(
    plans: readonly PlannedConversion[],
    context: ConversionContext,
    plansByInputId: ReadonlyMap<string, PlannedConversion>,
  ): readonly PlannedConversion[] {
    let closed: readonly CssPlan[] = this.closeResponsiveDependencies(plans, context, plansByInputId);
    closed = closeDisplayDependencies(closed, input => displayContextUnverified(input) as CssPlan);
    closed = this.closeResponsiveDependencies(closed, context, plansByInputId);
    return closeDisplayDependencies(closed, input => displayContextUnverified(input) as CssPlan);
  }

  acceptPlans(plans: readonly PlannedConversion[]): void {
    for (const plan of plans) {
      this.referencedClassNamesByInputId.set(plan.input.id, plan.status === 'converted' ? plan.classNames : []);
    }
  }

  referencedClassNames(): ReadonlySet<string> {
    return new Set([...this.referencedClassNamesByInputId.values()].flatMap(classNames => [...classNames]));
  }

  private closeResponsiveDependencies(
    plans: readonly CssPlan[],
    context: ConversionContext,
    plansByInputId: ReadonlyMap<string, PlannedConversion>,
  ): readonly CssPlan[] {
    const inputs = plans.map(plan => plan.input);
    const currentPlans = new Map(plans.map(plan => [plan.input.id, plan]));
    return this.responsiveFamilyPlanner.closeDependencies(
      inputs,
      { ...context, inputs },
      (input, itemContext) =>
        currentPlans.get(input.id) ??
        plansByInputId.get(input.id) ??
        this.targetEligibility(input) ??
        this.planSemantic(input, itemContext),
    );
  }

  private targetEligibility(input: AdapterInput): UnresolvedPlan | undefined {
    if (!familyByDirective.has(input.directive)) return targetUnsupported(input);
    if (input.breakpoint !== undefined && this.breakpointCatalog.classify(input.breakpoint).kind !== 'verified') {
      return targetUnsupported(input);
    }
    return undefined;
  }

  private emptyPlan(input: AdapterInput): CssPlan {
    const family = familyByDirective.get(input.directive);
    return family === undefined
      ? targetUnsupported(input)
      : { status: 'converted', input, classNames: [], family, declarations: [] };
  }

  private planSemantic(input: AdapterInput, context: ConversionContext): CssPlan {
    const family = familyByDirective.get(input.directive);
    if (!family) return targetUnsupported(input);
    if (input.binding === 'property') return dynamicBinding(input);

    if (input.directive === 'fxLayout') {
      const layout = parseLayout(input.value);
      return layout.ok
        ? {
            status: 'converted',
            input,
            classNames: [],
            family,
            declarations: renderLayoutCss(layout.value),
          }
        : invalid(input);
    }

    if (input.directive === 'fxLayoutGap') {
      const layout = context.activeLayout ?? staticLayoutContext(context.element.attributes);
      return fromSemantic(input, family, planLayoutGapSemantics(input.value, layout), renderLayoutGapCss);
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
      return fromSemantic(input, family, planLayoutAlignment(input.value, layout), renderLayoutAlignmentCss);
    }

    if (flexItemDirectives.has(input.directive)) return this.planFlexItem(input, context, family);

    if (input.directive === 'fxFlexAlign') {
      return fromSemantic(input, family, planFlexAlignSemantics(input.value), renderFlexAlignCss);
    }

    if (input.directive === 'fxFlexFill' || input.directive === 'fxFill') {
      return fromSemantic(input, family, planFlexFillSemantics(), renderFlexFillCss);
    }

    if (input.directive === 'fxFlexOffset') {
      const layout = context.activeParentLayout ?? staticLayoutContext(context.parent?.attributes ?? []);
      return fromSemantic(input, family, planFlexOffsetSemantics(input.value, layout), renderFlexOffsetCss);
    }

    if (input.directive === 'fxFlexOrder') {
      return fromSemantic(input, family, planFlexOrderSemantics(input.value), renderFlexOrderCss);
    }

    return targetUnsupported(input);
  }

  private planFlexItem(input: AdapterInput, context: ConversionContext, family: CssSemanticFamily): CssPlan {
    const flexInputs = (context.inputs ?? [input]).filter(item => flexItemDirectives.has(item.directive));
    const sameBreakpoint = (item: AdapterInput) => item.breakpoint === input.breakpoint;
    const atBreakpoint = (directive: AdapterDirective) =>
      flexInputs.filter(item => item.directive === directive && sameBreakpoint(item));
    const atBase = (directive: AdapterDirective) =>
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

    const layout = context.activeParentLayout ?? staticLayoutContext(context.parent?.attributes ?? []);
    return fromSemantic(
      input,
      family,
      planFlexItemSemantics({
        basis: basis.value,
        grow: grow?.value,
        shrink: shrink?.value,
        layout,
      }),
      renderFlexItemCss,
    );
  }

  private emit(plan: CssPlan): PlannedConversion {
    if (plan.status !== 'converted') {
      this.referencedClassNamesByInputId.set(plan.input.id, []);
      return plan;
    }
    if (plan.declarations === undefined) {
      this.referencedClassNamesByInputId.set(plan.input.id, plan.classNames);
      return plan;
    }
    if (plan.declarations.length === 0) {
      this.referencedClassNamesByInputId.set(plan.input.id, []);
      return { status: 'converted', input: plan.input, classNames: [] };
    }

    const rule = this.registry.register(
      plan.family ?? this.requireFamily(plan.input),
      plan.declarations,
      cssRuleContext(this.breakpointDefinition(plan.input)),
    );
    const classNames = [rule.className];
    this.referencedClassNamesByInputId.set(plan.input.id, classNames);
    return { status: 'converted', input: plan.input, classNames };
  }

  private requireFamily(input: AdapterInput): CssSemanticFamily {
    const family = familyByDirective.get(input.directive);
    if (family === undefined) {
      throw new CssInvariantError(`CSS emission received an unsupported directive: ${input.directive}`);
    }
    return family;
  }

  private breakpointDefinition(input: AdapterInput): BreakpointDefinition | undefined {
    if (input.breakpoint === undefined) return undefined;
    const classification = this.breakpointCatalog.classify(input.breakpoint);
    if (classification.kind !== 'verified') {
      throw new CssInvariantError(`CSS emission received an unsupported breakpoint alias: ${input.breakpoint}`);
    }
    return classification.definition;
  }
}

export class CssAdapterSession implements ConversionAdapterSession {
  readonly adapter: ConversionAdapter;
  private readonly registry = new CssArtifactRegistry();
  private readonly cssAdapter = new CssAdapter(this.registry);
  private finalized = false;

  constructor(_config: BreakpointMigrationConfig = { orientationBreakpoints: false }) {
    this.adapter = sessionBoundAdapter(this.cssAdapter, () => this.assertActive());
  }

  finalize(): AdapterSessionResult {
    if (this.finalized) throw new Error('Adapter session already finalized');
    this.finalized = true;
    return Object.freeze({
      target: 'css' as const,
      rules: this.registry.rulesReferencedBy(this.cssAdapter.referencedClassNames()),
    });
  }

  private assertActive(): void {
    if (this.finalized) throw new Error('Adapter session is finalized');
  }
}
