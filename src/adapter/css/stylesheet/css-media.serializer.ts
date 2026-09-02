import type { MediaDefinition, MediaRange } from '../../../breakpoint/breakpoint-catalog';

function serializeClause(type: MediaDefinition['type'], clause: MediaRange): string {
  const features: string[] = [];
  if (clause.min !== undefined) features.push(`(min-width: ${String(clause.min)}px)`);
  if (clause.max !== undefined) features.push(`(max-width: ${String(clause.max)}px)`);
  if (clause.orientation !== undefined) features.push(`(orientation: ${clause.orientation})`);

  return [type, ...features].join(' and ');
}

export function serializeCssMedia(media: MediaDefinition): string {
  return media.clauses.map(clause => serializeClause(media.type, clause)).join(', ');
}
