import type { BreakpointDefinition, MediaRange } from '../../breakpoint/breakpoint-catalog';
import { describeTailwindUtility } from './tailwind-class-conflict';

export class ResponsiveVariantEmitter {
  emit(definition: BreakpointDefinition, utility: string): string {
    if (this.hasVariant(utility)) {
      throw new Error('Cannot decorate an already-variant utility');
    }

    return `[${this.mediaQuery(definition.range)}]:${utility}`;
  }

  emitCandidate(definition: BreakpointDefinition, candidate: string): string {
    const descriptor = describeTailwindUtility(candidate);
    if (descriptor === undefined) {
      throw new Error('Cannot decorate a malformed Tailwind candidate');
    }
    if (descriptor.activation.kind === 'media') {
      throw new Error('Cannot decorate a candidate containing a generated media variant');
    }

    return `[${this.mediaQuery(definition.range)}]:${candidate}`;
  }

  private mediaQuery(range: MediaRange): string {
    const conditions = [
      range.min === undefined ? undefined : `(min-width:_${range.min}px)`,
      range.max === undefined ? undefined : `(max-width:_${range.max}px)`,
    ].filter((condition): condition is string => condition !== undefined);

    return `@media_screen_and_${conditions.join('_and_')}`;
  }

  private hasVariant(utility: string): boolean {
    let bracketDepth = 0;

    for (const character of utility) {
      if (character === '[') {
        bracketDepth += 1;
      } else if (character === ']') {
        bracketDepth -= 1;
      } else if (character === ':' && bracketDepth === 0) {
        return true;
      }
    }

    return false;
  }
}
