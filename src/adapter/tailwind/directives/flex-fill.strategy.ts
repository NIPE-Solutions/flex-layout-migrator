import type { TailwindStrategyResult } from '../tailwind-semantic.model';

export function planFlexFill(): TailwindStrategyResult {
  return {
    status: 'converted',
    classNames: ['m-0', 'w-full', 'h-full', 'min-w-full', 'min-h-full'],
  };
}
