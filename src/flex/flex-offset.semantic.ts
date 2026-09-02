import { parseCssLength, type CssLength } from './css-length';
import type { SemanticResult } from './flex-semantic.model';
import { parseLayout } from './layout.semantic';

export interface FlexOffsetSemantics {
  readonly axis: 'inline-start' | 'block-start';
  readonly length: CssLength;
}

export function planFlexOffsetSemantics(
  value: string,
  layoutValue: string | undefined,
): SemanticResult<FlexOffsetSemantics> {
  const offset = parseCssLength(value.trim() || '0', { fallbackUnit: '%' });
  if (!offset.ok) return { status: 'invalid', code: 'invalid-value' };
  if (layoutValue === undefined) {
    return {
      status: 'review',
      code: 'context-unverified',
      reason: 'The offset margin axis depends on a dynamic parent layout.',
      suggestion: 'Make the parent layout static or migrate the offset manually.',
    };
  }

  const layout = parseLayout(layoutValue);
  if (!layout.ok) return { status: 'invalid', code: 'invalid-value' };
  return {
    status: 'planned',
    value: { axis: layout.value.direction.startsWith('column') ? 'block-start' : 'inline-start', length: offset.value },
  };
}
