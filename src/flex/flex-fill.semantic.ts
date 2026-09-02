import type { SemanticResult } from './flex-semantic.model';

export interface FlexFillSemantics {
  readonly margin: '0';
  readonly width: '100%';
  readonly height: '100%';
  readonly minWidth: '100%';
  readonly minHeight: '100%';
}

const fill: FlexFillSemantics = {
  margin: '0',
  width: '100%',
  height: '100%',
  minWidth: '100%',
  minHeight: '100%',
};

export function planFlexFillSemantics(): SemanticResult<FlexFillSemantics> {
  return { status: 'planned', value: fill };
}
