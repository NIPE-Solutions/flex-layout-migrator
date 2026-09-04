import { ResponsiveVariantEmitter } from '../responsive-variant.emitter';
import type { VisibilityState } from '../../../semantic/visibility/visibility.model';

export class VisibilityEmitter {
  constructor(private readonly responsiveEmitter = new ResponsiveVariantEmitter()) {}

  emit(state: VisibilityState, restorationUtility: string | undefined): readonly string[] {
    const utility = state.intent === 'hidden' ? 'hidden' : restorationUtility;
    if (utility === undefined) return [];
    if (state.activation.kind === 'base') return [utility];
    return this.responsiveEmitter.emit(state.activation.definition, utility);
  }
}
