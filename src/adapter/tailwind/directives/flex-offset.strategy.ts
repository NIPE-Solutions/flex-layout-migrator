import type { TailwindStrategyResult } from '../tailwind-semantic.model';
import { arbitraryValue, parseCssLength } from '../tailwind-value.parser';
import { parseLayout } from './layout.strategy';

export function planFlexOffset(value: string, layoutValue: string | undefined): TailwindStrategyResult {
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
  const prefix = layout.value.direction.startsWith('column') ? 'mt' : 'ms';
  return { status: 'converted', classNames: [`${prefix}-${arbitraryValue(offset.value)}`] };
}
