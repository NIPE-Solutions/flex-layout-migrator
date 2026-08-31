import type { TailwindStrategyResult } from '../tailwind-semantic.model';

export function planFlexOrder(value: string): TailwindStrategyResult {
  const order = Number.parseInt(value.trim(), 10);
  return {
    status: 'converted',
    classNames: order ? [`[order:${order}]`] : [],
  };
}
