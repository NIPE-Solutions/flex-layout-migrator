import { parseCssLength, type CssLength } from './css-length';
import type { SemanticResult } from './flex-semantic.model';
import { parseLayout } from './layout.semantic';

export interface LayoutGapSemantics {
  readonly length: CssLength;
}

export function planLayoutGapSemantics(
  value: string,
  layoutValue: string | undefined,
): SemanticResult<LayoutGapSemantics> {
  const normalized = value.trim();
  if (!normalized) return { status: 'invalid', code: 'invalid-value' };

  if (normalized.endsWith(' grid')) {
    return {
      status: 'review',
      code: 'semantic-unsupported',
      reason: 'The Flex-Layout grid gap mode changes child padding and compensating host margins.',
      suggestion: 'Replace the grid gap manually after reviewing the child padding behavior.',
    };
  }

  const length = parseCssLength(normalized, { fallbackUnit: 'px' });
  if (!length.ok) return { status: 'invalid', code: 'invalid-value' };
  if (length.value.startsWith('-')) {
    return {
      status: 'review',
      code: 'semantic-unsupported',
      reason: 'Flex-Layout accepts a negative margin gap, but CSS gap does not accept negative values.',
      suggestion: 'Preserve the margin-based spacing or migrate the child margins manually.',
    };
  }
  if (length.value.includes('(')) {
    return {
      status: 'review',
      code: 'context-unverified',
      reason: 'The computed gap may resolve to a negative value that CSS gap cannot represent.',
      suggestion: 'Prove the value is nonnegative or migrate the margin-based spacing manually.',
    };
  }
  if (layoutValue === undefined) {
    return {
      status: 'review',
      code: 'context-unverified',
      reason: 'The active flex direction and wrapping behavior depend on a dynamic layout.',
      suggestion: 'Make the layout static or migrate the gap and responsive layout together.',
    };
  }

  const layout = parseLayout(layoutValue);
  if (!layout.ok) return { status: 'invalid', code: 'invalid-value' };
  if (layout.value.wrap !== 'nowrap') {
    return {
      status: 'review',
      code: 'semantic-unsupported',
      reason: 'Flex-Layout margins and CSS gap differ when flex items wrap across lines.',
      suggestion: 'Verify the wrapped layout and migrate its spacing manually.',
    };
  }

  return { status: 'planned', value: { length: length.value } };
}
