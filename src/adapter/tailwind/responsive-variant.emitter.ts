import type { BreakpointDefinition, MediaClause, MediaDefinition } from '../../breakpoint/breakpoint-catalog';
import { describeTailwindUtility } from './tailwind-class-conflict';

export class ResponsiveVariantEmitter {
  emit(definition: BreakpointDefinition, utility: string): readonly string[] {
    const descriptor = describeTailwindUtility(utility);
    if (descriptor === undefined) {
      throw new Error('Cannot decorate a malformed Tailwind utility');
    }
    if (descriptor.variants.length > 0) {
      throw new Error('Cannot decorate an already-variant utility');
    }

    return definition.media.clauses.map(clause => `[${this.mediaQuery(definition.media, clause)}]:${utility}`);
  }

  emitCandidate(definition: BreakpointDefinition, candidate: string): readonly string[] {
    const descriptor = describeTailwindUtility(candidate);
    if (descriptor === undefined) {
      throw new Error('Cannot decorate a malformed Tailwind candidate');
    }
    if (descriptor.hasGeneratedMediaVariant) {
      throw new Error('Cannot decorate a candidate containing a generated media variant');
    }

    return definition.media.clauses.map(clause => `[${this.mediaQuery(definition.media, clause)}]:${candidate}`);
  }

  private mediaQuery(media: MediaDefinition, clause: MediaClause): string {
    if (media.type === 'print') return '@media_print';

    const conditions = [
      clause.orientation === undefined ? undefined : `(orientation:_${clause.orientation})`,
      clause.min === undefined ? undefined : `(min-width:_${clause.min}px)`,
      clause.max === undefined ? undefined : `(max-width:_${clause.max}px)`,
    ].filter((condition): condition is string => condition !== undefined);

    const medium = clause.orientation === undefined ? 'screen_and_' : '';
    return `@media_${medium}${conditions.join('_and_')}`;
  }
}
