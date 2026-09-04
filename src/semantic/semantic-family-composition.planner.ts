import type { LocatedFlexLayoutInput } from '../analyzer/flex-layout-attribute.analyzer';
import {
  mediaRangesIntersect,
  type BreakpointCatalog,
  type MediaRange,
} from '../breakpoint/breakpoint-catalog';
import type { PlannedConversion } from '../adapter/conversion-adapter';
import type { FlexFillSemantics } from '../flex/flex-fill.semantic';
import type { FlexItemSemantics } from '../flex/flex-item.semantic';
import type { FlexOffsetSemantics } from '../flex/flex-offset.semantic';
import type { LayoutAlignmentSemantics } from '../flex/layout-align.semantic';
import type { LayoutSemantics } from '../flex/layout.semantic';
import type { GridSemanticPlan } from '../grid/grid-semantic.model';
import { templateAttributeKeys } from '../template/template-attribute';
import type { SemanticConversionContext } from './conversion-context';
import { cssPropertiesOverlap, cssPropertyOwnershipCovers } from './css-property-ownership';
import { literalStyleMayControlDisplay, parseLiteralStyleDeclarations } from './literal-style-declaration';
import {
  directiveFamily,
  type DirectiveFamily,
  type ExtendedClassSemantics,
  type ExtendedStyleSemantics,
  type ResolvedSemanticPlan,
  type SemanticActivation,
  type SuppressedSemanticEffect,
  type VisibilitySemantics,
} from './semantic-plan';
import {
  type SourceClassTokenEvidence,
  type SourcePropertyEvidence,
} from './source-property-evidence';

type UnresolvedConversion = Exclude<PlannedConversion, { readonly status: 'converted' }>;
export type SemanticCompositionPlan = ResolvedSemanticPlan | UnresolvedConversion;

type PropertyAuthority = 'source-class' | 'source-inline' | 'semantic-replacement';

interface PropertyEffect {
  readonly planId: string;
  readonly family: DirectiveFamily;
  readonly activation: SemanticActivation;
  readonly properties: readonly string[];
  readonly important: boolean;
  readonly authority: PropertyAuthority;
  readonly suppressible: boolean;
  readonly retained: boolean;
  readonly signature: string;
  readonly display?: { readonly intent: 'shown' | 'hidden' | 'unverified'; readonly value?: string };
}

interface SourceAuthority {
  readonly input: LocatedFlexLayoutInput;
  readonly family: 'extended-class' | 'extended-style';
  readonly range: MediaRange;
  readonly properties: readonly string[] | undefined;
  readonly mayControlDisplay: boolean;
}

interface NumericRange {
  readonly min: number;
  readonly max: number;
}

const extendedClassDirectives = new Set<LocatedFlexLayoutInput['directive']>(['class', 'ngClass']);
const extendedStyleDirectives = new Set<LocatedFlexLayoutInput['directive']>(['style', 'ngStyle']);
const restorationDisplays = new Set([
  'inline',
  'block',
  'inline-block',
  'flow-root',
  'flex',
  'inline-flex',
  'grid',
  'inline-grid',
  'contents',
  'table',
  'inline-table',
  'table-caption',
  'table-cell',
  'table-column',
  'table-column-group',
  'table-footer-group',
  'table-header-group',
  'table-row-group',
  'table-row',
  'list-item',
]);

function numericRange(range: MediaRange): NumericRange {
  return {
    min: range.min ?? Number.NEGATIVE_INFINITY,
    max: range.max ?? Number.POSITIVE_INFINITY,
  };
}

function activationRange(activation: SemanticActivation): MediaRange {
  return activation.kind === 'base' ? {} : activation.definition.range;
}

function sameActivation(left: SemanticActivation, right: SemanticActivation): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'base' || right.kind === 'base') return true;
  return (
    left.definition.range.min === right.definition.range.min &&
    left.definition.range.max === right.definition.range.max
  );
}

function rangesCover(target: MediaRange, ranges: readonly MediaRange[]): boolean {
  const numericTarget = numericRange(target);
  const clipped = ranges
    .filter(range => mediaRangesIntersect(target, range))
    .map(range => {
      const numeric = numericRange(range);
      return {
        min: Math.max(numericTarget.min, numeric.min),
        max: Math.min(numericTarget.max, numeric.max),
      };
    })
    .sort((left, right) => left.min - right.min);
  const first = clipped[0];
  if (!first || first.min !== numericTarget.min) return false;
  let coveredUntil = first.max;
  for (const range of clipped.slice(1)) {
    if (range.min > coveredUntil) return false;
    coveredUntil = Math.max(coveredUntil, range.max);
  }
  return coveredUntil >= numericTarget.max;
}

function propertySetsOverlap(left: readonly string[], right: readonly string[]): boolean {
  return left.some(leftProperty => right.some(rightProperty => cssPropertiesOverlap(leftProperty, rightProperty)));
}

function propertiesEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((property, index) => property === right[index]);
}

function contextUnverified(input: LocatedFlexLayoutInput, reason: string): UnresolvedConversion {
  return {
    status: 'review',
    input,
    code: 'context-unverified',
    reason,
    suggestion: 'Migrate the coupled responsive families together manually.',
  };
}

function generatedOwnershipUnverified(input: LocatedFlexLayoutInput): UnresolvedConversion {
  return {
    status: 'review',
    input,
    code: 'context-unverified',
    reason: 'Generated responsive families have overlapping CSS ownership without one provable precedence.',
    suggestion: 'Migrate the coupled responsive families together manually.',
  };
}

function displayRestorationUnverified(input: LocatedFlexLayoutInput, reason: string): UnresolvedConversion {
  return {
    status: 'review',
    input,
    code: 'display-restoration-unverified',
    reason,
    suggestion: 'Provide one unambiguous visible display value or migrate this visibility family manually.',
  };
}

function partialDisplayContextUnverified(input: LocatedFlexLayoutInput): UnresolvedConversion {
  return {
    status: 'review',
    input,
    code: 'context-unverified',
    reason: 'Partially overlapping responsive layout and visibility displays have unverified cascade precedence.',
    suggestion: 'Migrate the coupled layout and visibility ranges together manually.',
  };
}

function authority(family: DirectiveFamily): PropertyAuthority {
  if (family === 'extended-class') return 'source-class';
  if (
    family === 'extended-style' ||
    family === 'layout' ||
    family === 'layout-align' ||
    family === 'flex-item' ||
    family === 'flex-align' ||
    family === 'flex-fill' ||
    family === 'flex-offset' ||
    family === 'flex-order' ||
    family === 'visibility'
  ) {
    return 'source-inline';
  }
  return 'semantic-replacement';
}

function displayIntent(value: string | undefined): PropertyEffect['display'] {
  if (value === undefined) return undefined;
  if (value === 'none') return { intent: 'hidden', value };
  return restorationDisplays.has(value)
    ? { intent: 'shown', value }
    : { intent: 'unverified', value };
}

function makeEffect(
  plan: ResolvedSemanticPlan,
  activation: SemanticActivation,
  properties: readonly string[],
  signature: string,
  options: {
    readonly important?: boolean;
    readonly suppressible?: boolean;
    readonly retained?: boolean;
    readonly display?: PropertyEffect['display'];
  } = {},
): PropertyEffect {
  return {
    planId: plan.input.id,
    family: plan.family,
    activation,
    properties,
    important: options.important ?? false,
    authority: authority(plan.family),
    suppressible: options.suppressible ?? false,
    retained: options.retained ?? false,
    signature,
    ...(options.display === undefined ? {} : { display: options.display }),
  };
}

function ordinaryPropertyGroups(plan: ResolvedSemanticPlan): readonly { properties: readonly string[]; signature: string; display?: PropertyEffect['display'] }[] {
  switch (plan.family) {
    case 'layout': {
      const value = plan.value as LayoutSemantics;
      return [
        { properties: ['display'], signature: value.display, display: displayIntent(value.display) },
        { properties: ['flex-direction'], signature: value.direction },
        ...(value.explicitWrap ? [{ properties: ['flex-wrap'], signature: value.wrap }] : []),
        { properties: ['box-sizing'], signature: value.boxSizing },
      ];
    }
    case 'layout-gap':
      return [{ properties: ['gap'], signature: 'gap' }];
    case 'layout-align': {
      const value = plan.value as LayoutAlignmentSemantics;
      return [
        { properties: ['justify-content'], signature: value.main },
        { properties: ['align-items'], signature: value.items },
        { properties: ['align-content'], signature: value.content },
        { properties: ['display'], signature: value.layout.display, display: displayIntent(value.layout.display) },
        { properties: ['flex-direction'], signature: value.layout.direction },
        ...(value.layout.explicitWrap ? [{ properties: ['flex-wrap'], signature: value.layout.wrap }] : []),
        { properties: ['box-sizing'], signature: value.layout.boxSizing },
        ...(value.stretchMaximum === undefined
          ? []
          : [{ properties: [`max-${value.stretchMaximum}`], signature: '100%' }]),
      ];
    }
    case 'flex-item': {
      const value = plan.value as FlexItemSemantics;
      const flex =
        value.basis.kind === 'computed'
          ? [
              { properties: ['flex-grow'], signature: value.grow },
              { properties: ['flex-shrink'], signature: value.shrink },
              { properties: ['flex-basis'], signature: value.basis.value },
            ]
          : [{ properties: ['flex'], signature: `${value.grow} ${value.shrink} ${value.basis.value}` }];
      return [
        ...flex,
        ...(value.min === undefined ? [] : [{ properties: [`min-${value.axis}`], signature: value.min }]),
        ...(value.max === undefined ? [] : [{ properties: [`max-${value.axis}`], signature: value.max }]),
        { properties: ['box-sizing'], signature: value.boxSizing },
      ];
    }
    case 'flex-align':
      return [{ properties: ['align-self'], signature: 'align-self' }];
    case 'flex-fill': {
      const value = plan.value as FlexFillSemantics;
      return [
        { properties: ['margin'], signature: value.margin },
        { properties: ['width'], signature: value.width },
        { properties: ['height'], signature: value.height },
        { properties: ['min-width'], signature: value.minWidth },
        { properties: ['min-height'], signature: value.minHeight },
      ];
    }
    case 'flex-offset': {
      const value = plan.value as FlexOffsetSemantics;
      return [
        {
          properties: [value.axis === 'inline-start' ? 'margin-inline-start' : 'margin-top'],
          signature: value.length,
        },
      ];
    }
    case 'flex-order':
      return [{ properties: ['order'], signature: 'order' }];
    default: {
      const value = plan.value as GridSemanticPlan;
      if (!('declarations' in value)) return [];
      return [
        ...(value.role === 'container' && plan.emitGridDisplay !== false
          ? [{ properties: ['display'], signature: 'grid', display: displayIntent('grid') }]
          : value.role === 'modifier'
            ? [
                {
                  properties: ['display'],
                  signature: value.inline ? 'inline-grid' : 'grid',
                  display: displayIntent(value.inline ? 'inline-grid' : 'grid'),
                },
              ]
            : []),
        ...value.declarations.map(declaration => ({
          properties: [declaration.property],
          signature: `${declaration.property}:${declaration.value}`,
        })),
      ];
    }
  }
}

function semanticEffects(plan: ResolvedSemanticPlan): readonly PropertyEffect[] {
  if (plan.family === 'visibility') return [];
  if (plan.family === 'extended-class') {
    const value = plan.value as ExtendedClassSemantics;
    const emitted = value.emit
      ? value.states.flatMap((state, stateIndex) =>
          state.activations.flatMap(activation =>
            state.tokens.flatMap((token, tokenIndex) => {
              if (token.properties.length === 0) return [];
              const controlsDisplay = token.properties.some(property =>
                cssPropertiesOverlap(property, 'display'),
              );
              return [
                makeEffect(
                  plan,
                  activation,
                  token.properties,
                  `class:${stateIndex}:${tokenIndex}:${token.source}`,
                  {
                    important: token.important,
                    suppressible: true,
                    display:
                      token.display === undefined
                        ? controlsDisplay
                          ? { intent: 'unverified' }
                          : undefined
                        : displayIntent(token.display),
                  },
                ),
              ];
            }),
          ),
        )
      : [];
    const retained = value.retainedTokens.flatMap((token, tokenIndex) => {
      if (token.properties.length === 0) return [];
      const controlsDisplay = token.properties.some(property =>
        cssPropertiesOverlap(property, 'display'),
      );
      return [
        makeEffect(plan, { kind: 'base' }, token.properties, `retained:${tokenIndex}:${token.source}`, {
          important: token.important,
          retained: true,
          display:
            token.display === undefined
              ? controlsDisplay
                ? { intent: 'unverified' }
                : undefined
              : displayIntent(token.display),
        }),
      ];
    });
    return [...emitted, ...retained];
  }
  if (plan.family === 'extended-style') {
    const value = plan.value as ExtendedStyleSemantics;
    return value.emit
      ? value.states.flatMap((state, stateIndex) =>
          state.activations.flatMap(activation =>
            state.declarations.map((declaration, declarationIndex) =>
              makeEffect(
                plan,
                activation,
                [declaration.property],
                `style:${stateIndex}:${declarationIndex}:${declaration.property}:${declaration.value}`,
                {
                  suppressible: true,
                  display: cssPropertiesOverlap(declaration.property, 'display')
                    ? declaration.property === 'display'
                      ? displayIntent(declaration.value)
                      : { intent: 'unverified' }
                    : undefined,
                },
              ),
            ),
          ),
        )
      : [];
  }
  return plan.activations.flatMap(activation =>
    ordinaryPropertyGroups(plan).map(group =>
      makeEffect(plan, activation, group.properties, group.signature, { display: group.display }),
    ),
  );
}

function sourceAuthorities(
  plans: readonly SemanticCompositionPlan[],
  catalog: BreakpointCatalog,
  evidence: SourcePropertyEvidence,
): readonly SourceAuthority[] {
  const authorities: SourceAuthority[] = [];
  for (const plan of plans) {
    const input = plan.input;
    const family = extendedClassDirectives.has(input.directive)
      ? 'extended-class'
      : extendedStyleDirectives.has(input.directive)
        ? 'extended-style'
        : undefined;
    if (family === undefined) continue;
    const classification = input.breakpoint === undefined ? undefined : catalog.classify(input.breakpoint);
    const range = classification?.kind === 'verified' ? classification.definition.range : {};
    if (input.binding !== 'literal') {
      authorities.push({ input, family, range, properties: undefined, mayControlDisplay: true });
      continue;
    }
    if (family === 'extended-class') {
      const tokens = input.value.split(/[\t\n\f\r ]+/u).filter(Boolean);
      const classifications = tokens.map(token => evidence.classifyClassToken(token));
      const properties = classifications.some(item => item.status === 'unverified')
        ? undefined
        : classifications.flatMap(item => (item.status === 'verified' ? item.evidence.properties : []));
      authorities.push({
        input,
        family,
        range,
        properties,
        mayControlDisplay:
          properties === undefined || properties.some(property => cssPropertiesOverlap(property, 'display')),
      });
      continue;
    }
    const parsed = parseLiteralStyleDeclarations(input.value);
    const properties = parsed.status === 'parsed' ? parsed.declarations.map(declaration => declaration.property) : undefined;
    authorities.push({
      input,
      family,
      range,
      properties,
      mayControlDisplay:
        properties === undefined || properties.some(property => cssPropertiesOverlap(property, 'display')),
    });
  }
  return authorities;
}

function isSuppressed(effect: PropertyEffect, plansById: ReadonlyMap<string, SemanticCompositionPlan>): boolean {
  const plan = plansById.get(effect.planId);
  if (plan?.status !== 'converted') return true;
  return (plan.suppressedEffects ?? []).some(
    suppression =>
      suppression.important === effect.important &&
      sameActivation(suppression.activation, effect.activation) &&
      propertiesEqual(suppression.properties, effect.properties),
  );
}

function addSuppression(plan: ResolvedSemanticPlan, effect: PropertyEffect): ResolvedSemanticPlan {
  const suppression: SuppressedSemanticEffect = {
    activation: effect.activation,
    properties: effect.properties,
    important: effect.important,
  };
  const existing = plan.suppressedEffects ?? [];
  return existing.some(
    item =>
      item.important === suppression.important &&
      sameActivation(item.activation, suppression.activation) &&
      propertiesEqual(item.properties, suppression.properties),
  )
    ? plan
    : { ...plan, suppressedEffects: [...existing, suppression] };
}

function updatePlans(
  plans: readonly SemanticCompositionPlan[],
  unsafeFamilies: ReadonlySet<DirectiveFamily>,
  diagnostic: (input: LocatedFlexLayoutInput) => UnresolvedConversion,
  suppressed: readonly PropertyEffect[] = [],
): readonly SemanticCompositionPlan[] {
  const suppressedByPlan = new Map<string, PropertyEffect[]>();
  for (const effect of suppressed) {
    const items = suppressedByPlan.get(effect.planId) ?? [];
    items.push(effect);
    suppressedByPlan.set(effect.planId, items);
  }
  return plans.map(plan => {
    if (plan.status !== 'converted') return plan;
    if (unsafeFamilies.has(plan.family)) return diagnostic(plan.input);
    return (suppressedByPlan.get(plan.input.id) ?? []).reduce(addSuppression, plan);
  });
}

function attributeControlsDisplay(attribute: SemanticConversionContext['attributeEvidence'][number]): boolean {
  const keys = templateAttributeKeys(attribute);
  if (attribute.binding === 'literal') return keys.has('style') && literalStyleMayControlDisplay(attribute.value);
  return [...keys].some(
    key => key === 'style' || key === 'ngstyle' || key === 'style.display' || key.startsWith('style.display.'),
  );
}

function plainBaseDisplay(descriptor: SourceClassTokenEvidence): boolean {
  return descriptor.activation.kind === 'base' && !descriptor.important && descriptor.display === descriptor.source;
}

/** Resolves cross-family CSS ownership while values are still target-free semantic plans. */
export class SemanticFamilyCompositionPlanner {
  constructor(
    private readonly catalog: BreakpointCatalog,
    private readonly evidence: SourcePropertyEvidence,
  ) {}

  compose(
    inputPlans: readonly SemanticCompositionPlan[],
    context: SemanticConversionContext,
  ): readonly SemanticCompositionPlan[] {
    const allEffects = inputPlans.flatMap(plan =>
      plan.status === 'converted' ? semanticEffects(plan) : [],
    );
    const sources = sourceAuthorities(inputPlans, this.catalog, this.evidence);
    let plans = this.composeGeneratedProperties(inputPlans, allEffects, sources);
    plans = this.composeExtendedDisplayWithLayout(plans, allEffects, sources);
    return this.composeVisibility(plans, allEffects, sources, context);
  }

  private activeEffects(
    plans: readonly SemanticCompositionPlan[],
    allEffects: readonly PropertyEffect[],
  ): readonly PropertyEffect[] {
    const plansById = new Map(plans.map(plan => [plan.input.id, plan]));
    return allEffects.filter(effect => !isSuppressed(effect, plansById));
  }

  private composeGeneratedProperties(
    plans: readonly SemanticCompositionPlan[],
    allEffects: readonly PropertyEffect[],
    sources: readonly SourceAuthority[],
  ): readonly SemanticCompositionPlan[] {
    const candidates = this.activeEffects(plans, allEffects).filter(effect => effect.family !== 'visibility');
    const unsafe = new Set<DirectiveFamily>();
    const suppressed: PropertyEffect[] = [];

    for (const source of sources) {
      const current = plans.find(plan => plan.input.id === source.input.id);
      if (current?.status === 'converted') continue;
      for (const candidate of candidates) {
        if (
          mediaRangesIntersect(source.range, activationRange(candidate.activation)) &&
          (source.properties === undefined || propertySetsOverlap(source.properties, candidate.properties))
        ) {
          unsafe.add(candidate.family);
        }
      }
    }

    for (const candidate of candidates.filter(effect => effect.authority === 'source-class')) {
      const writers = candidates.filter(
        writer =>
          writer.authority !== 'source-class' &&
          writer.family !== candidate.family &&
          mediaRangesIntersect(activationRange(writer.activation), activationRange(candidate.activation)) &&
          propertySetsOverlap(writer.properties, candidate.properties),
      );
      if (!writers.length) continue;
      if (writers.some(writer => writer.authority === 'semantic-replacement')) {
        unsafe.add(candidate.family);
        for (const writer of writers) unsafe.add(writer.family);
        continue;
      }
      const ownerFamilies = new Set(writers.map(writer => writer.family));
      const ownershipIsProven =
        !candidate.important &&
        ownerFamilies.size === 1 &&
        candidate.properties.every(property =>
          rangesCover(
            activationRange(candidate.activation),
            writers
              .filter(writer =>
                writer.properties.some(ownerProperty => cssPropertyOwnershipCovers(ownerProperty, property)),
              )
              .map(writer => activationRange(writer.activation)),
          ),
        );
      if (ownershipIsProven && candidate.suppressible) {
        suppressed.push(candidate);
        continue;
      }
      unsafe.add(candidate.family);
      for (const writer of writers) unsafe.add(writer.family);
    }

    const writers = candidates.filter(candidate => candidate.authority !== 'source-class');
    for (let leftIndex = 0; leftIndex < writers.length; leftIndex += 1) {
      const left = writers[leftIndex];
      if (left === undefined) continue;
      for (const right of writers.slice(leftIndex + 1)) {
        if (
          left.family === right.family ||
          (!left.family.startsWith('extended-') && !right.family.startsWith('extended-')) ||
          !mediaRangesIntersect(activationRange(left.activation), activationRange(right.activation)) ||
          !propertySetsOverlap(left.properties, right.properties) ||
          (left.authority === 'source-inline' &&
            right.authority === 'source-inline' &&
            left.signature === right.signature)
        ) {
          continue;
        }
        unsafe.add(left.family);
        unsafe.add(right.family);
      }
    }

    return updatePlans(plans, unsafe, generatedOwnershipUnverified, suppressed);
  }

  private composeExtendedDisplayWithLayout(
    inputPlans: readonly SemanticCompositionPlan[],
    allEffects: readonly PropertyEffect[],
    sources: readonly SourceAuthority[],
  ): readonly SemanticCompositionPlan[] {
    let plans = inputPlans;
    let effects = this.activeEffects(plans, allEffects);
    const classRanges = effects
      .filter(effect => effect.family === 'extended-class' && effect.display !== undefined)
      .map(effect => activationRange(effect.activation));
    const styleRanges = effects
      .filter(effect => effect.family === 'extended-style' && effect.display !== undefined)
      .map(effect => activationRange(effect.activation));
    const importantClassRanges = effects
      .filter(effect => effect.family === 'extended-class' && effect.display !== undefined && effect.important)
      .map(effect => activationRange(effect.activation));
    const unresolvedRange = (family: SourceAuthority['family']): readonly MediaRange[] =>
      sources.flatMap(source => {
        const current = plans.find(plan => plan.input.id === source.input.id);
        return source.family === family && current?.status !== 'converted' && source.mayControlDisplay
          ? [source.range]
          : [];
      });
    const unresolvedClassRanges = unresolvedRange('extended-class');
    const unresolvedStyleRanges = unresolvedRange('extended-style');
    const affected = new Set<DirectiveFamily>();
    if (
      classRanges.some(
        target => styleRanges.some(range => mediaRangesIntersect(target, range)) && !rangesCover(target, styleRanges),
      ) ||
      importantClassRanges.some(target => styleRanges.some(range => mediaRangesIntersect(target, range)))
    ) {
      affected.add('extended-class');
      affected.add('extended-style');
    }
    if (styleRanges.some(target => unresolvedClassRanges.some(range => mediaRangesIntersect(target, range)))) {
      affected.add('extended-style');
    }
    if (classRanges.some(target => unresolvedStyleRanges.some(range => mediaRangesIntersect(target, range)))) {
      affected.add('extended-class');
    }
    const classSuppressed = effects.filter(
      effect =>
        effect.family === 'extended-class' &&
        effect.display !== undefined &&
        !effect.important &&
        rangesCover(activationRange(effect.activation), styleRanges),
    );
    plans = updatePlans(
      plans,
      affected,
      input =>
        contextUnverified(
          input,
          'Responsive class and style display ownership cannot be proven for every overlapping activation range.',
        ),
      classSuppressed,
    );

    effects = this.activeEffects(plans, allEffects);
    const layoutRanges = effects
      .filter(effect => effect.family === 'layout' && effect.display?.value !== undefined && !effect.important)
      .map(effect => activationRange(effect.activation));
    const unresolvedLayout = plans.some(
      plan => directiveFamily(plan.input.directive) === 'layout' && plan.status !== 'converted',
    );
    const unresolvedExtendedDisplay = sources.some(source => {
      const current = plans.find(plan => plan.input.id === source.input.id);
      return current?.status !== 'converted' && source.mayControlDisplay;
    });
    const layoutAffected = new Set<DirectiveFamily>();
    const displaySuppressed: PropertyEffect[] = [];
    let layoutOverlapIsUnsafe = false;
    for (const effect of effects.filter(
      candidate => candidate.family === 'extended-class' || candidate.family === 'extended-style',
    )) {
      if (effect.display === undefined) continue;
      const target = activationRange(effect.activation);
      const overlaps = layoutRanges.some(range => mediaRangesIntersect(target, range));
      if (unresolvedLayout) layoutAffected.add(effect.family);
      if ((effect.properties.length !== 1 || effect.properties[0]?.toLowerCase() !== 'display') && overlaps) {
        layoutOverlapIsUnsafe = true;
        layoutAffected.add(effect.family);
        continue;
      }
      if ((effect.family === 'extended-style' || effect.important) && overlaps) {
        layoutOverlapIsUnsafe = true;
        layoutAffected.add(effect.family);
        continue;
      }
      if (rangesCover(target, layoutRanges)) {
        displaySuppressed.push(effect);
      } else if (overlaps) {
        layoutOverlapIsUnsafe = true;
        layoutAffected.add(effect.family);
      }
    }
    if (unresolvedExtendedDisplay || layoutOverlapIsUnsafe) layoutAffected.add('layout');
    return updatePlans(
      plans,
      layoutAffected,
      input =>
        input.directive === 'fxLayout'
          ? contextUnverified(
              input,
              'An unresolved or partially overlapping responsive class/style family may control display.',
            )
          : contextUnverified(
              input,
              'The responsive layout and extended display ranges do not have one provable ownership order.',
            ),
      displaySuppressed,
    );
  }

  private composeVisibility(
    inputPlans: readonly SemanticCompositionPlan[],
    allEffects: readonly PropertyEffect[],
    sources: readonly SourceAuthority[],
    context: SemanticConversionContext,
  ): readonly SemanticCompositionPlan[] {
    let plans = inputPlans;
    const visibilityPlans = plans.filter(plan => directiveFamily(plan.input.directive) === 'visibility');
    if (!visibilityPlans.length) return plans;
    const visibilityResolved = visibilityPlans.every(plan => plan.status === 'converted');
    let effects = this.activeEffects(plans, allEffects);
    const extendedDisplayFamilies = new Set(
      effects
        .filter(effect =>
          (effect.family === 'extended-class' || effect.family === 'extended-style') && effect.display !== undefined,
        )
        .map(effect => effect.family),
    );
    if (!visibilityResolved) {
      return updatePlans(
        plans,
        extendedDisplayFamilies,
        input => contextUnverified(input, 'The visibility family is unresolved and may override display.'),
      );
    }

    const visibility = (visibilityPlans[0] as ResolvedSemanticPlan).value as VisibilitySemantics;
    const states = visibility.states;
    const baseIsHidden = states.some(state => state.activation.kind === 'base' && state.intent === 'hidden');
    const hiddenRanges = states.flatMap(state =>
      state.intent === 'hidden' && state.activation.kind === 'media' ? [state.activation.definition.range] : [],
    );
    const shownRanges = states
      .filter(state => state.intent === 'shown')
      .map(state => activationRange(state.activation));
    const visibilityRanges = states.map(state => activationRange(state.activation));
    const unsafe = new Set<DirectiveFamily>();
    const suppressed: PropertyEffect[] = [];
    const visibilityOwnsHiddenRange = (target: MediaRange): boolean =>
      baseIsHidden
        ? !states.some(
            state =>
              state.intent === 'shown' &&
              state.activation.kind === 'media' &&
              mediaRangesIntersect(target, state.activation.definition.range),
          )
        : rangesCover(target, hiddenRanges);

    for (const effect of effects.filter(
      candidate => candidate.family === 'extended-class' || candidate.family === 'extended-style',
    )) {
      if (effect.display === undefined) continue;
      const target = activationRange(effect.activation);
      if (effect.retained && visibilityRanges.some(range => mediaRangesIntersect(target, range))) {
        unsafe.add(effect.family);
        continue;
      }
      const overlapsVisibility = visibilityRanges.some(range => mediaRangesIntersect(target, range));
      if (effect.family === 'extended-style' && overlapsVisibility) {
        unsafe.add(effect.family);
        continue;
      }
      if (effect.properties.length !== 1 || effect.properties[0]?.toLowerCase() !== 'display') {
        if (overlapsVisibility) unsafe.add(effect.family);
        continue;
      }
      if (effect.important && overlapsVisibility) {
        unsafe.add(effect.family);
        continue;
      }
      if (visibilityOwnsHiddenRange(target)) {
        suppressed.push(effect);
        continue;
      }
      const partiallyHidden =
        !baseIsHidden &&
        hiddenRanges.some(range => mediaRangesIntersect(target, range)) &&
        !rangesCover(target, hiddenRanges);
      const shownOverridesHidden =
        effect.display.intent !== 'shown' && shownRanges.some(range => mediaRangesIntersect(target, range));
      if (partiallyHidden || shownOverridesHidden) unsafe.add(effect.family);
    }
    if (unsafe.size > 0) unsafe.add('visibility');
    plans = updatePlans(
      plans,
      unsafe,
      input =>
        contextUnverified(
          input,
          'The responsive class/style display range and visibility range only partially agree on ownership.',
        ),
      suppressed,
    );
    if (unsafe.size > 0) return plans;

    effects = this.activeEffects(plans, allEffects);
    const existingDisplays = context.existingClassNames
      .map(className => this.evidence.classifyClassToken(className))
      .flatMap(item => item.status === 'verified' && item.evidence.display !== undefined ? [item.evidence] : []);
    const responsiveStyleIsUnresolved = sources.some(source => {
      const current = plans.find(plan => plan.input.id === source.input.id);
      return source.family === 'extended-style' && current?.status !== 'converted' && source.mayControlDisplay;
    });
    const hasEffectiveShownRange = !baseIsHidden || states.some(state => state.intent === 'shown');
    let displayReason =
      responsiveStyleIsUnresolved || context.attributeEvidence.some(attributeControlsDisplay)
        ? 'A literal or bound style may control the element display value.'
        : existingDisplays.some(item => item.display === 'hidden') && hasEffectiveShownRange
          ? 'The visible display value cannot be proven from one unambiguous source.'
          : undefined;

    const relevantExtended = effects.filter(
      effect =>
        (effect.family === 'extended-class' || effect.family === 'extended-style') &&
        effect.display !== undefined &&
        (effect.family === 'extended-style' || effect.important || !visibilityOwnsHiddenRange(activationRange(effect.activation))),
    );
    const effectiveShownRanges = states.some(state => state.activation.kind === 'base') ? shownRanges : [{}, ...shownRanges];
    if (
      displayReason === undefined &&
      relevantExtended.some(
        effect =>
          effect.display?.intent !== 'shown' &&
          effectiveShownRanges.some(range => mediaRangesIntersect(activationRange(effect.activation), range)),
      )
    ) {
      displayReason = 'A responsive class/style hidden utility overlaps a visibility state that must be shown.';
    }
    if (
      displayReason === undefined &&
      relevantExtended.some(effect =>
        effectiveShownRanges.some(range => mediaRangesIntersect(activationRange(effect.activation), range)),
      )
    ) {
      displayReason =
        'Flex-Layout captures the original display during initialization, before responsive ownership is stable.';
    }
    if (displayReason !== undefined) {
      const visibilityIds = new Set(visibilityPlans.map(plan => plan.input.id));
      return plans.map(plan =>
        plan.status === 'converted' && visibilityIds.has(plan.input.id)
          ? displayRestorationUnverified(plan.input, displayReason)
          : plan,
      );
    }

    const layoutPlans = plans.filter(
      (plan): plan is ResolvedSemanticPlan => plan.status === 'converted' && plan.family === 'layout',
    );
    const layoutDisplays = layoutPlans.flatMap(plan => {
      const layout = plan.value as LayoutSemantics;
      return plan.activations.map(activation => ({ activation, display: layout.display }));
    });
    const existingRestoration = (() => {
      const descriptor = existingDisplays.length === 1 ? existingDisplays[0] : undefined;
      return descriptor !== undefined && plainBaseDisplay(descriptor) && descriptor.display !== undefined && restorationDisplays.has(descriptor.display)
        ? descriptor.display
        : undefined;
    })();
    const shownOverrides = baseIsHidden
      ? states.filter(state => state.activation.kind === 'media' && state.intent === 'shown')
      : [];
    let restorationDisplay: string | undefined;
    if (shownOverrides.length > 0) {
      const utilities = shownOverrides.map(state => {
        const stateRange = activationRange(state.activation);
        const overlapping = layoutDisplays.some(
          display =>
            display.activation.kind === 'media' &&
            !sameActivation(display.activation, state.activation) &&
            mediaRangesIntersect(display.activation.definition.range, stateRange),
        );
        if (overlapping) return null;
        const exact = layoutDisplays.filter(display => sameActivation(display.activation, state.activation));
        const applicable = exact.length > 0 ? exact : layoutDisplays.filter(display => display.activation.kind === 'base');
        const displays = [...new Set(applicable.map(display => display.display))];
        return displays.length === 0 ? existingRestoration : displays.length === 1 ? displays[0] : null;
      });
      const distinct = [...new Set(utilities)];
      if (distinct.length !== 1 || typeof distinct[0] !== 'string') {
        const visibilityIds = new Set(visibilityPlans.map(plan => plan.input.id));
        return plans.map(plan =>
          plan.status === 'converted' && visibilityIds.has(plan.input.id)
            ? displayRestorationUnverified(
                plan.input,
                'The visible display value cannot be proven from one unambiguous source.',
              )
            : plan,
        );
      }
      restorationDisplay = distinct[0];
    }

    const unsafePartial =
      !baseIsHidden &&
      layoutDisplays.some(display => {
        if (display.activation.kind !== 'media') return false;
        const range = display.activation.definition.range;
        return hiddenRanges.some(hidden => mediaRangesIntersect(range, hidden)) && !rangesCover(range, hiddenRanges);
      });
    if (unsafePartial) {
      const ids = new Set([...visibilityPlans, ...layoutPlans].map(plan => plan.input.id));
      return plans.map(plan =>
        plan.status === 'converted' && ids.has(plan.input.id) ? partialDisplayContextUnverified(plan.input) : plan,
      );
    }

    const layoutSuppressions = effects.filter(effect => {
      if (effect.family !== 'layout' || effect.display === undefined) return false;
      const target = activationRange(effect.activation);
      return baseIsHidden
        ? !states.some(
            state =>
              state.intent === 'shown' &&
              state.activation.kind === 'media' &&
              mediaRangesIntersect(target, state.activation.definition.range),
          )
        : rangesCover(target, hiddenRanges);
    });
    const visibilityIds = new Set(visibilityPlans.map(plan => plan.input.id));
    plans = plans.map(plan => {
      if (plan.status !== 'converted') return plan;
      if (visibilityIds.has(plan.input.id)) {
        return {
          ...plan,
          value: {
            ...(plan.value as VisibilitySemantics),
            ...(restorationDisplay === undefined ? {} : { restorationDisplay }),
          },
        };
      }
      return layoutSuppressions
        .filter(effect => effect.planId === plan.input.id)
        .reduce(addSuppression, plan);
    });
    return plans;
  }
}
