import type { SemanticResult } from './flex-semantic.model';

export interface FlexOrderSemantics {
  readonly order: number | undefined;
}

export function planFlexOrderSemantics(value: string): SemanticResult<FlexOrderSemantics> {
  const order = Number.parseInt(value.trim(), 10) || undefined;
  return { status: 'planned', value: { order } };
}
