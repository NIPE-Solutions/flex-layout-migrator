import type { BreakpointDefinition, MediaRange } from '../../breakpoint/breakpoint-catalog';

export class ResponsiveVariantEmitter {
  emit(definition: BreakpointDefinition, utility: string): string {
    if (utility.includes('[@media')) {
      throw new Error('Cannot nest a responsive media variant');
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
}
