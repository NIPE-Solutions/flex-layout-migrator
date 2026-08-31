import type { TailwindStrategyResult } from '../tailwind-semantic.model';

const INTEGER = /^-?\d+$/;

export function planFlexOrder(value: string): TailwindStrategyResult {
  const normalized = value.trim() || '0';
  if (!INTEGER.test(normalized)) return { status: 'invalid', code: 'invalid-value' };
  return { status: 'converted', classNames: [`[order:${Number.parseInt(normalized, 10)}]`] };
}
