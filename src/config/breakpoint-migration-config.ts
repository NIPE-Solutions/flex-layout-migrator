import { DEFAULT_BREAKPOINTS, ORIENTATION_BREAKPOINTS } from '../analyzer/flex-layout.catalog';

export interface BreakpointMigrationConfig {
  readonly orientationBreakpoints: boolean;
  readonly printWithBreakpoints?: readonly string[];
}

const standardAliases = new Set<string>(DEFAULT_BREAKPOINTS);
const orientationAliases = new Set<string>(ORIENTATION_BREAKPOINTS);

export function parsePrintWithBreakpoints(value: string, orientationEnabled: boolean): readonly string[] {
  if (value === 'none') return Object.freeze([]);

  const aliases = value.split(',').map(alias => alias.trim());
  if (aliases.some(alias => alias.length === 0)) {
    throw new Error('Print breakpoint aliases must not be empty');
  }
  if (aliases.includes('none')) {
    throw new Error('The literal none cannot be combined with breakpoint aliases');
  }

  const seen = new Set<string>();
  for (const alias of aliases) {
    if (seen.has(alias)) throw new Error(`Print breakpoint list contains duplicate alias ${alias}`);
    seen.add(alias);

    if (alias === 'print') throw new Error('Print breakpoint list must not contain print');
    if (orientationAliases.has(alias) && !orientationEnabled) {
      throw new Error(`Orientation breakpoint alias ${alias} requires --orientation-breakpoints`);
    }
    if (!standardAliases.has(alias) && !orientationAliases.has(alias)) {
      throw new Error(`Unknown breakpoint alias ${alias}`);
    }
  }

  return Object.freeze(aliases);
}
