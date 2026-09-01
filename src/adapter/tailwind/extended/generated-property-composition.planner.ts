import type { LocatedFlexLayoutInput } from '../../../analyzer/flex-layout-attribute.analyzer';
import { BreakpointCatalog, mediaRangesIntersect, type MediaRange } from '../../../breakpoint/breakpoint-catalog';
import type { PlannedConversion } from '../../conversion-adapter';
import { describeTailwindUtility, type TailwindActivation } from '../tailwind-class-conflict';
import { parseLiteralStyleDeclarations } from '../visibility/literal-style-display';
import { cssPropertiesOverlap, cssPropertyOwnershipCovers } from './css-property-ownership';
import { TailwindCandidateClassifier } from './tailwind-candidate-classifier';

const extendedClassDirectives = new Set<LocatedFlexLayoutInput['directive']>(['class', 'ngClass']);
const extendedStyleDirectives = new Set<LocatedFlexLayoutInput['directive']>(['style', 'ngStyle']);
const extendedDirectives = new Set<LocatedFlexLayoutInput['directive']>([
  ...extendedClassDirectives,
  ...extendedStyleDirectives,
]);
const inlineWriterDirectives = new Set<LocatedFlexLayoutInput['directive']>([
  'style',
  'ngStyle',
  'fxLayout',
  'fxLayoutAlign',
  'fxFlex',
  'fxGrow',
  'fxShrink',
  'fxFlexAlign',
  'fxFlexFill',
  'fxFill',
  'fxFlexOffset',
  'fxFlexOrder',
  'fxShow',
  'fxHide',
]);

export type GeneratedPropertyAuthority = 'source-class' | 'source-inline' | 'semantic-replacement';

export function generatedPropertyAuthority(directive: LocatedFlexLayoutInput['directive']): GeneratedPropertyAuthority {
  if (extendedClassDirectives.has(directive)) return 'source-class';
  return inlineWriterDirectives.has(directive) ? 'source-inline' : 'semantic-replacement';
}

interface NumericRange {
  readonly min: number;
  readonly max: number;
}

interface GeneratedCandidate {
  readonly plan: Extract<PlannedConversion, { readonly status: 'converted' }>;
  readonly token: string;
  readonly properties: readonly string[];
  readonly range: MediaRange;
  readonly important: boolean;
  readonly family: string;
  readonly authority: GeneratedPropertyAuthority;
  readonly suppressible: boolean;
}

function activationRange(activation: TailwindActivation): MediaRange {
  return activation.kind === 'base' ? {} : activation.range;
}

function propertySetsOverlap(left: readonly string[], right: readonly string[]): boolean {
  return left.some(leftProperty => right.some(rightProperty => cssPropertiesOverlap(leftProperty, rightProperty)));
}

function numericRange(range: MediaRange): NumericRange {
  return {
    min: range.min ?? Number.NEGATIVE_INFINITY,
    max: range.max ?? Number.POSITIVE_INFINITY,
  };
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

function contextUnverified(input: LocatedFlexLayoutInput): PlannedConversion {
  return {
    status: 'review',
    input,
    code: 'context-unverified',
    reason: 'Generated responsive families have overlapping CSS ownership without one provable precedence.',
    suggestion: 'Migrate the coupled responsive families together manually.',
  };
}

export class GeneratedPropertyCompositionPlanner {
  constructor(
    private readonly breakpointCatalog = new BreakpointCatalog(),
    private readonly classifier = new TailwindCandidateClassifier(),
  ) {}

  compose(plans: readonly PlannedConversion[]): readonly PlannedConversion[] {
    const candidates = this.generatedCandidates(plans);
    const unsafeFamilies = new Set<string>();
    const suppressedTokensByPlan = new Map<string, Set<string>>();

    this.closeUnresolvedAuthorities(plans, candidates, unsafeFamilies);

    for (const candidate of candidates.filter(candidate => candidate.authority === 'source-class')) {
      const writers = candidates.filter(
        writer =>
          writer.authority !== 'source-class' &&
          writer.family !== candidate.family &&
          mediaRangesIntersect(writer.range, candidate.range) &&
          propertySetsOverlap(writer.properties, candidate.properties),
      );
      if (!writers.length) continue;

      if (writers.some(writer => writer.authority === 'semantic-replacement')) {
        unsafeFamilies.add(candidate.family);
        for (const writer of writers) unsafeFamilies.add(writer.family);
        continue;
      }

      const ownerFamilies = new Set(writers.map(owner => owner.family));
      const ownershipIsProven =
        !candidate.important &&
        ownerFamilies.size === 1 &&
        candidate.properties.every(property =>
          rangesCover(
            candidate.range,
            writers
              .filter(owner =>
                owner.properties.some(ownerProperty => cssPropertyOwnershipCovers(ownerProperty, property)),
              )
              .map(owner => owner.range),
          ),
        );
      if (ownershipIsProven) {
        if (!candidate.suppressible) {
          unsafeFamilies.add(candidate.family);
          for (const owner of writers) unsafeFamilies.add(owner.family);
          continue;
        }
        const suppressed = suppressedTokensByPlan.get(candidate.plan.input.id) ?? new Set<string>();
        suppressed.add(candidate.token);
        suppressedTokensByPlan.set(candidate.plan.input.id, suppressed);
        continue;
      }

      unsafeFamilies.add(candidate.family);
      for (const owner of writers) unsafeFamilies.add(owner.family);
    }

    this.closeCompetingWriters(candidates, unsafeFamilies);

    return plans.map(plan => {
      if (plan.status !== 'converted') return plan;
      if (unsafeFamilies.has(this.planFamily(plan.input.directive))) return contextUnverified(plan.input);
      const suppressed = suppressedTokensByPlan.get(plan.input.id);
      return suppressed?.size ? { ...plan, classNames: plan.classNames.filter(token => !suppressed.has(token)) } : plan;
    });
  }

  private generatedCandidates(plans: readonly PlannedConversion[]): readonly GeneratedCandidate[] {
    return plans
      .filter(
        (plan): plan is Extract<PlannedConversion, { readonly status: 'converted' }> => plan.status === 'converted',
      )
      .flatMap(plan => {
        const family = this.planFamily(plan.input.directive);
        const authority = generatedPropertyAuthority(plan.input.directive);
        const describe = (token: string, suppressible: boolean): readonly GeneratedCandidate[] => {
          const descriptor = describeTailwindUtility(token);
          return descriptor === undefined || descriptor.cssProperties.length === 0
            ? []
            : [
                {
                  plan,
                  token,
                  properties: descriptor.cssProperties,
                  range: activationRange(descriptor.activation),
                  important: descriptor.important,
                  family,
                  authority,
                  suppressible,
                } satisfies GeneratedCandidate,
              ];
        };
        return [
          ...plan.classNames.flatMap(token => describe(token, true)),
          ...(plan.retainedClassNames ?? []).flatMap(token => describe(token, false)),
        ];
      });
  }

  private closeUnresolvedAuthorities(
    plans: readonly PlannedConversion[],
    candidates: readonly GeneratedCandidate[],
    unsafeFamilies: Set<string>,
  ): void {
    for (const unresolved of plans.filter(
      plan => plan.status !== 'converted' && extendedDirectives.has(plan.input.directive),
    )) {
      const properties = this.unresolvedProperties(unresolved.input);
      const range = this.inputRange(unresolved.input);
      for (const candidate of candidates) {
        if (
          mediaRangesIntersect(range, candidate.range) &&
          (properties === undefined || propertySetsOverlap(properties, candidate.properties))
        ) {
          unsafeFamilies.add(candidate.family);
        }
      }
    }
  }

  private closeCompetingWriters(candidates: readonly GeneratedCandidate[], unsafeFamilies: Set<string>): void {
    const writers = candidates.filter(candidate => candidate.authority !== 'source-class');
    for (let leftIndex = 0; leftIndex < writers.length; leftIndex += 1) {
      const left = writers[leftIndex];
      if (left === undefined) continue;
      for (const right of writers.slice(leftIndex + 1)) {
        if (
          left.family === right.family ||
          (!left.family.startsWith('extended-') && !right.family.startsWith('extended-')) ||
          !mediaRangesIntersect(left.range, right.range) ||
          !propertySetsOverlap(left.properties, right.properties) ||
          (left.authority === 'source-inline' && right.authority === 'source-inline' && left.token === right.token)
        ) {
          continue;
        }
        unsafeFamilies.add(left.family);
        unsafeFamilies.add(right.family);
      }
    }
  }

  private planFamily(directive: LocatedFlexLayoutInput['directive']): string {
    if (['fxFlex', 'fxGrow', 'fxShrink'].includes(directive)) return 'flex-item';
    if (directive === 'fxFlexFill' || directive === 'fxFill') return 'flex-fill';
    if (extendedClassDirectives.has(directive)) return 'extended-class';
    if (extendedStyleDirectives.has(directive)) return 'extended-style';
    return directive;
  }

  private inputRange(input: LocatedFlexLayoutInput): MediaRange {
    if (input.breakpoint === undefined) return {};
    const classification = this.breakpointCatalog.classify(input.breakpoint);
    return classification.kind === 'verified' ? classification.definition.range : {};
  }

  private unresolvedProperties(input: LocatedFlexLayoutInput): readonly string[] | undefined {
    if (input.binding !== 'literal') return undefined;
    if (extendedClassDirectives.has(input.directive)) {
      const classifications = input.value
        .split(/[\t\n\f\r ]+/u)
        .filter(Boolean)
        .map(token => this.classifier.classify(token));
      if (classifications.some(classification => classification.status === 'unverified')) return undefined;
      return classifications.flatMap(classification =>
        classification.status === 'verified' ? classification.descriptor.cssProperties : [],
      );
    }
    if (!extendedStyleDirectives.has(input.directive)) return [];
    const parsed = parseLiteralStyleDeclarations(input.value);
    return parsed.status === 'parsed' ? parsed.declarations.map(declaration => declaration.property) : undefined;
  }
}
