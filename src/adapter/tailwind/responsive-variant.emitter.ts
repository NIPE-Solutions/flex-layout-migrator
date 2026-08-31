import type { BreakpointDefinition, MediaRange } from '../../breakpoint/breakpoint-catalog';

export class ResponsiveVariantEmitter {
  emit(definition: BreakpointDefinition, utility: string): string {
    if (this.hasVariant(utility)) {
      throw new Error('Cannot decorate an already-variant utility');
    }

    return `[${this.mediaQuery(definition.range)}]:${utility}`;
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
