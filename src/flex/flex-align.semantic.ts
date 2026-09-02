import type { SemanticResult } from './flex-semantic.model';

export type FlexSelfAlignment = 'auto' | 'start' | 'end' | 'center' | 'baseline' | 'stretch';

export interface FlexAlignSemantics {
  readonly alignment: FlexSelfAlignment;
}

const alignments = new Set<FlexSelfAlignment>(['auto', 'start', 'end', 'center', 'baseline', 'stretch']);

export function planFlexAlignSemantics(value: string): SemanticResult<FlexAlignSemantics> {
  const alignment = (value.trim() || 'stretch') as FlexSelfAlignment;
  return alignments.has(alignment)
    ? { status: 'planned', value: { alignment } }
    : { status: 'invalid', code: 'invalid-value' };
}
