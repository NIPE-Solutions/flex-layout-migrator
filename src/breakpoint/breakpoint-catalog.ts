import { ORIENTATION_BREAKPOINTS, type DefaultBreakpoint } from '../analyzer/flex-layout.catalog';

export interface MediaRange {
  readonly min?: number;
  readonly max?: number;
}

export interface BreakpointDefinition {
  readonly alias: DefaultBreakpoint;
  readonly range: MediaRange;
  readonly priority: number;
}

export type BreakpointClassification =
  | { readonly kind: 'verified'; readonly definition: BreakpointDefinition }
  | { readonly kind: 'optional'; readonly alias: string }
  | { readonly kind: 'print'; readonly alias: 'print' }
  | { readonly kind: 'custom'; readonly alias: string };

function freezeDefinition(definition: BreakpointDefinition): BreakpointDefinition {
  return Object.freeze({
    ...definition,
    range: Object.freeze({ ...definition.range }),
  });
}

const breakpointDefinitions: readonly BreakpointDefinition[] = [
  { alias: 'xs', range: { min: 0, max: 599.98 }, priority: 1000 },
  { alias: 'sm', range: { min: 600, max: 959.98 }, priority: 900 },
  { alias: 'md', range: { min: 960, max: 1279.98 }, priority: 800 },
  { alias: 'lg', range: { min: 1280, max: 1919.98 }, priority: 700 },
  { alias: 'xl', range: { min: 1920, max: 4999.98 }, priority: 600 },
  { alias: 'lt-sm', range: { min: undefined, max: 599.98 }, priority: 950 },
  { alias: 'lt-md', range: { min: undefined, max: 959.98 }, priority: 850 },
  { alias: 'lt-lg', range: { min: undefined, max: 1279.98 }, priority: 750 },
  { alias: 'lt-xl', range: { min: undefined, max: 1919.98 }, priority: 650 },
  { alias: 'gt-xs', range: { min: 600, max: undefined }, priority: -950 },
  { alias: 'gt-sm', range: { min: 960, max: undefined }, priority: -850 },
  { alias: 'gt-md', range: { min: 1280, max: undefined }, priority: -750 },
  { alias: 'gt-lg', range: { min: 1920, max: undefined }, priority: -650 },
];

const definitions = Object.freeze(breakpointDefinitions.map(freezeDefinition));

const definitionsByAlias = new Map(definitions.map(definition => [definition.alias, definition]));
const optionalAliases = new Set<string>(ORIENTATION_BREAKPOINTS);

export class BreakpointCatalog {
  classify(alias: string): BreakpointClassification {
    const definition = definitionsByAlias.get(alias as DefaultBreakpoint);

    if (definition) {
      return { kind: 'verified', definition };
    }

    if (optionalAliases.has(alias)) {
      return { kind: 'optional', alias };
    }

    if (alias === 'print') {
      return { kind: 'print', alias };
    }

    return { kind: 'custom', alias };
  }
}

export function mediaRangesIntersect(left: MediaRange, right: MediaRange): boolean {
  const leftMin = left.min ?? Number.NEGATIVE_INFINITY;
  const leftMax = left.max ?? Number.POSITIVE_INFINITY;
  const rightMin = right.min ?? Number.NEGATIVE_INFINITY;
  const rightMax = right.max ?? Number.POSITIVE_INFINITY;

  return leftMin <= rightMax && rightMin <= leftMax;
}
