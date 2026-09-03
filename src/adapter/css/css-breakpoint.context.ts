import type { BreakpointDefinition, MediaDefinition } from '../../breakpoint/breakpoint-catalog';
import type { CssRuleContext } from './css-artifact.model';

function copyMedia(media: MediaDefinition): MediaDefinition {
  return Object.freeze({
    type: media.type,
    clauses: Object.freeze(media.clauses.map(clause => Object.freeze({ ...clause }))),
  });
}

export function cssRuleContext(definition?: BreakpointDefinition): CssRuleContext {
  if (definition === undefined) {
    return Object.freeze({ priority: 0 });
  }

  return Object.freeze({ priority: definition.priority, media: copyMedia(definition.media) });
}
