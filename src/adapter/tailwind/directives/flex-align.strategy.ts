import type { TailwindStrategyResult } from '../tailwind-semantic.model';

const values = new Set(['auto', 'start', 'end', 'center', 'baseline', 'stretch']);

export function planFlexAlign(value: string): TailwindStrategyResult {
  const normalized = value.trim() || 'stretch';
  if (!values.has(normalized)) return { status: 'invalid', code: 'invalid-value' };
  return { status: 'converted', classNames: [`self-${normalized}`] };
}
