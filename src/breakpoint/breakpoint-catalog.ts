import { ORIENTATION_BREAKPOINTS } from '../analyzer/flex-layout.catalog';
import type { BreakpointMigrationConfig } from '../config/breakpoint-migration-config';

export interface MediaRange {
  readonly min?: number;
  readonly max?: number;
  readonly orientation?: 'portrait' | 'landscape';
}

export type MediaClause = MediaRange;

export interface MediaDefinition {
  readonly type: 'screen' | 'print';
  readonly clauses: readonly MediaClause[];
}

export interface BreakpointDefinition {
  readonly alias: string;
  /** @deprecated Use media clauses; retained while range consumers migrate. */
  readonly range: MediaClause;
  readonly media: MediaDefinition;
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
    media: Object.freeze({
      ...definition.media,
      clauses: Object.freeze(definition.media.clauses.map(clause => Object.freeze({ ...clause }))),
    }),
  });
}

function screen(alias: string, range: MediaClause, priority: number): BreakpointDefinition {
  return { alias, range, media: { type: 'screen', clauses: [range] }, priority };
}

function composite(alias: string, clauses: readonly MediaClause[], priority: number): BreakpointDefinition {
  return { alias, range: clauses[0] ?? {}, media: { type: 'screen', clauses }, priority };
}

const breakpointDefinitions: readonly BreakpointDefinition[] = [
  screen('xs', { min: 0, max: 599.98 }, 1000),
  screen('sm', { min: 600, max: 959.98 }, 900),
  screen('md', { min: 960, max: 1279.98 }, 800),
  screen('lg', { min: 1280, max: 1919.98 }, 700),
  screen('xl', { min: 1920, max: 4999.98 }, 600),
  screen('lt-sm', { min: undefined, max: 599.98 }, 950),
  screen('lt-md', { min: undefined, max: 959.98 }, 850),
  screen('lt-lg', { min: undefined, max: 1279.98 }, 750),
  screen('lt-xl', { min: undefined, max: 1919.98 }, 650),
  screen('gt-xs', { min: 600, max: undefined }, -950),
  screen('gt-sm', { min: 960, max: undefined }, -850),
  screen('gt-md', { min: 1280, max: undefined }, -750),
  screen('gt-lg', { min: 1920, max: undefined }, -650),
];

const orientationDefinitions: readonly BreakpointDefinition[] = [
  screen('handset.portrait', { max: 599.98, orientation: 'portrait' }, 2000),
  screen('handset.landscape', { max: 959.98, orientation: 'landscape' }, 2000),
  composite(
    'handset',
    [
      { max: 599.98, orientation: 'portrait' },
      { max: 959.98, orientation: 'landscape' },
    ],
    2000,
  ),
  screen('tablet.portrait', { min: 600, max: 839.98, orientation: 'portrait' }, 2100),
  screen('tablet.landscape', { min: 960, max: 1279.98, orientation: 'landscape' }, 2100),
  composite(
    'tablet',
    [
      { min: 600, max: 839.98, orientation: 'portrait' },
      { min: 960, max: 1279.98, orientation: 'landscape' },
    ],
    2100,
  ),
  screen('web.portrait', { min: 840, orientation: 'portrait' }, 2200),
  screen('web.landscape', { min: 1280, orientation: 'landscape' }, 2200),
  composite(
    'web',
    [
      { min: 840, orientation: 'portrait' },
      { min: 1280, orientation: 'landscape' },
    ],
    2200,
  ),
];

const printDefinition: BreakpointDefinition = {
  alias: 'print',
  range: {},
  media: { type: 'print', clauses: [{}] },
  priority: 1000,
};

const definitions = Object.freeze(breakpointDefinitions.map(freezeDefinition));
const orientations = Object.freeze(orientationDefinitions.map(freezeDefinition));
const frozenPrintDefinition = freezeDefinition(printDefinition);

const definitionsByAlias = new Map(definitions.map(definition => [definition.alias, definition]));
const optionalAliases = new Set<string>(ORIENTATION_BREAKPOINTS);

export class BreakpointCatalog {
  private readonly configuredDefinitions: ReadonlyMap<string, BreakpointDefinition>;

  constructor(config: BreakpointMigrationConfig = { orientationBreakpoints: false }) {
    this.configuredDefinitions = new Map([
      ...definitionsByAlias,
      ...(config.orientationBreakpoints ? orientations.map(definition => [definition.alias, definition] as const) : []),
      ...(config.printWithBreakpoints === undefined
        ? []
        : ([[frozenPrintDefinition.alias, frozenPrintDefinition]] as const)),
    ]);
  }

  classify(alias: string): BreakpointClassification {
    const definition = this.configuredDefinitions.get(alias);

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
  if (left.orientation !== undefined && right.orientation !== undefined && left.orientation !== right.orientation) {
    return false;
  }
  const leftMin = left.min ?? Number.NEGATIVE_INFINITY;
  const leftMax = left.max ?? Number.POSITIVE_INFINITY;
  const rightMin = right.min ?? Number.NEGATIVE_INFINITY;
  const rightMax = right.max ?? Number.POSITIVE_INFINITY;

  return leftMin <= rightMax && rightMin <= leftMax;
}

export function mediaDefinitionsIntersect(left: MediaDefinition, right: MediaDefinition): boolean {
  if (left.type !== right.type) return false;
  return left.clauses.some(leftClause =>
    right.clauses.some(
      rightClause =>
        (leftClause.orientation === undefined ||
          rightClause.orientation === undefined ||
          leftClause.orientation === rightClause.orientation) &&
        mediaRangesIntersect(leftClause, rightClause),
    ),
  );
}
