import type { LocatedFlexLayoutInput } from '../../analyzer/flex-layout-attribute.analyzer';
import { DEFAULT_BREAKPOINTS } from '../../analyzer/flex-layout.catalog';
import type { BreakpointMigrationConfig } from '../../config/breakpoint-migration-config';
import type { FlexAlignSemantics } from '../../flex/flex-align.semantic';
import type { FlexFillSemantics } from '../../flex/flex-fill.semantic';
import type { FlexItemSemantics } from '../../flex/flex-item.semantic';
import type { FlexOffsetSemantics } from '../../flex/flex-offset.semantic';
import type { FlexOrderSemantics } from '../../flex/flex-order.semantic';
import type { LayoutAlignmentSemantics } from '../../flex/layout-align.semantic';
import type { LayoutGapSemantics } from '../../flex/layout-gap.semantic';
import type { LayoutSemantics } from '../../flex/layout.semantic';
import type { PlannedConversion } from '../../adapter/conversion-adapter';
import type { CssDeclaration, CssSemanticFamily, OwnedCssRule } from '../../adapter/css/css-artifact.model';
import { CssArtifactRegistry } from '../../adapter/css/css-artifact.registry';
import { cssRuleContext } from '../../adapter/css/css-breakpoint.context';
import { CssInvariantError } from '../../adapter/css/css-invariant.error';
import { renderFlexAlignCss } from '../../adapter/css/flex/flex-align.css-renderer';
import { renderFlexFillCss } from '../../adapter/css/flex/flex-fill.css-renderer';
import { renderFlexItemCss } from '../../adapter/css/flex/flex-item.css-renderer';
import { renderFlexOffsetCss } from '../../adapter/css/flex/flex-offset.css-renderer';
import { renderFlexOrderCss } from '../../adapter/css/flex/flex-order.css-renderer';
import { renderLayoutAlignmentCss } from '../../adapter/css/flex/layout-align.css-renderer';
import { renderLayoutGapCss } from '../../adapter/css/flex/layout-gap.css-renderer';
import { renderLayoutCss } from '../../adapter/css/flex/layout.css-renderer';
import type { SemanticConversionContext } from '../../semantic/conversion-context';
import type { ResolvedSemanticPlan } from '../../semantic/semantic-plan';
import type { ConversionRenderer } from '../conversion-renderer';

const supportedFamilies = new Set<CssSemanticFamily>([
  'layout',
  'layout-gap',
  'layout-align',
  'flex-item',
  'flex-align',
  'flex-fill',
  'flex-offset',
  'flex-order',
]);
const supportedBreakpoints = new Set<string>(DEFAULT_BREAKPOINTS);

function targetUnsupported(input: LocatedFlexLayoutInput): PlannedConversion {
  return {
    status: 'unsupported',
    input,
    code: 'target-unsupported',
    reason: `The CSS target does not support ${input.sourceName}.`,
    suggestion: 'Use the Tailwind target when it supports this input, or migrate the directive manually.',
  };
}

export class CssRenderer implements ConversionRenderer {
  readonly target = 'css' as const;
  readonly breakpointConfig: BreakpointMigrationConfig;
  private readonly referencedClassNamesByInputId = new Map<string, readonly string[]>();

  constructor(
    readonly registry: CssArtifactRegistry = new CssArtifactRegistry(),
    config: BreakpointMigrationConfig = { orientationBreakpoints: false },
  ) {
    this.breakpointConfig = Object.freeze({ ...config });
  }

  eligibility(input: LocatedFlexLayoutInput): PlannedConversion | undefined {
    const family = this.cssFamily(input);
    if (family === undefined) return targetUnsupported(input);
    if (input.breakpoint !== undefined && !supportedBreakpoints.has(input.breakpoint)) return targetUnsupported(input);
    return undefined;
  }

  render(plan: ResolvedSemanticPlan, _context: SemanticConversionContext): PlannedConversion {
    const family = this.cssFamily(plan.input);
    if (family === undefined || family !== plan.family) {
      throw new CssInvariantError(`CSS emission received an unsupported directive: ${plan.input.directive}`);
    }
    if (plan.activations.length !== 1) {
      throw new CssInvariantError('CSS emission requires exactly one resolved activation');
    }

    const declarations = this.declarations(plan);
    if (declarations.length === 0) return { status: 'converted', input: plan.input, classNames: [] };
    const planActivation = plan.activations[0];
    const rule = this.registry.register(
      family,
      declarations,
      planActivation?.kind === 'media' ? cssRuleContext(planActivation.definition) : { priority: 0 },
    );
    return { status: 'converted', input: plan.input, classNames: [rule.className] };
  }

  resolveConflicts(
    plans: readonly PlannedConversion[],
    _context: SemanticConversionContext,
  ): readonly PlannedConversion[] {
    return plans;
  }

  record(plans: readonly PlannedConversion[]): void {
    for (const plan of plans) {
      this.referencedClassNamesByInputId.set(plan.input.id, plan.status === 'converted' ? plan.classNames : []);
    }
  }

  referencedClassNames(): ReadonlySet<string> {
    return new Set([...this.referencedClassNamesByInputId.values()].flatMap(classNames => [...classNames]));
  }

  finalizedRules(): readonly OwnedCssRule[] {
    return this.registry.rulesReferencedBy(this.referencedClassNames());
  }

  private cssFamily(input: LocatedFlexLayoutInput): CssSemanticFamily | undefined {
    const family =
      input.directive === 'fxLayout'
        ? 'layout'
        : input.directive === 'fxLayoutGap'
          ? 'layout-gap'
          : input.directive === 'fxLayoutAlign'
            ? 'layout-align'
            : input.directive === 'fxFlex' || input.directive === 'fxGrow' || input.directive === 'fxShrink'
              ? 'flex-item'
              : input.directive === 'fxFlexAlign'
                ? 'flex-align'
                : input.directive === 'fxFlexFill' || input.directive === 'fxFill'
                  ? 'flex-fill'
                  : input.directive === 'fxFlexOffset'
                    ? 'flex-offset'
                    : input.directive === 'fxFlexOrder'
                      ? 'flex-order'
                      : undefined;
    return family !== undefined && supportedFamilies.has(family) ? family : undefined;
  }

  private declarations(plan: ResolvedSemanticPlan): readonly CssDeclaration[] {
    switch (plan.family) {
      case 'layout':
        return renderLayoutCss(plan.value as LayoutSemantics);
      case 'layout-gap':
        return renderLayoutGapCss(plan.value as LayoutGapSemantics);
      case 'layout-align':
        return renderLayoutAlignmentCss(plan.value as LayoutAlignmentSemantics);
      case 'flex-item':
        return renderFlexItemCss(plan.value as FlexItemSemantics);
      case 'flex-align':
        return renderFlexAlignCss(plan.value as FlexAlignSemantics);
      case 'flex-fill':
        return renderFlexFillCss(plan.value as FlexFillSemantics);
      case 'flex-offset':
        return renderFlexOffsetCss(plan.value as FlexOffsetSemantics);
      case 'flex-order':
        return renderFlexOrderCss(plan.value as FlexOrderSemantics);
      default:
        throw new CssInvariantError(`CSS emission received an unsupported semantic family: ${plan.family}`);
    }
  }
}
