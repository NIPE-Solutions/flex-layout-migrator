import type { BreakpointDefinition, MediaClause } from '../breakpoint/breakpoint-catalog';
export interface SourceBreakpoint {
  readonly mediaQuery: string;
  readonly priority: number;
}
export type SourceBreakpoints = Readonly<Record<string, SourceBreakpoint>>;

/** Deliberately bounded media grammar matching the semantic range model. */
export function sourceBreakpointDefinition(alias: string, input: SourceBreakpoint): BreakpointDefinition {
  if (!/^[a-zA-Z][a-zA-Z0-9_.-]*$/.test(alias) || !Number.isSafeInteger(input.priority))
    throw new Error(`Invalid source breakpoint ${alias}; an integer priority is required.`);
  if (typeof input.mediaQuery !== 'string') throw new Error(`Invalid source media query for ${alias}.`);
  const parts = input.mediaQuery.trim().split(/\s+and\s+/);
  if (parts.shift() !== 'screen' || !parts.length)
    throw new Error(`Source breakpoint ${alias} requires screen and explicit px width/orientation conditions.`);
  const range: { min?: number; max?: number; orientation?: 'portrait' | 'landscape' } = {};
  for (const part of parts) {
    const width = /^\((min|max)-width:\s*(\d+(?:\.\d+)?)px\)$/.exec(part);
    const orientation = /^\(orientation:\s*(portrait|landscape)\)$/.exec(part);
    if (width) {
      const key = width[1] as 'min' | 'max';
      if (range[key] !== undefined || !Number.isFinite(Number(width[2])))
        throw new Error(`Duplicate or invalid source condition in ${alias}.`);
      range[key] = Number(width[2]);
    } else if (orientation && range.orientation === undefined)
      range.orientation = orientation[1] as 'portrait' | 'landscape';
    else throw new Error(`Unsupported source media condition in ${alias}: ${part}`);
  }
  if ((range.min ?? 0) > (range.max ?? Infinity)) throw new Error(`Inverted source media range in ${alias}.`);
  const clause: MediaClause = Object.freeze(range);
  return Object.freeze({
    alias,
    priority: input.priority,
    range: clause,
    media: Object.freeze({ type: 'screen', clauses: Object.freeze([clause]) }),
  });
}
