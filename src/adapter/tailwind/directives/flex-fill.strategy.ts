import type { TailwindStrategyResult } from '../tailwind-semantic.model';
import { planFlexFillSemantics, type FlexFillSemantics } from '../../../flex/flex-fill.semantic';

export function renderFlexFill(_value: FlexFillSemantics): TailwindStrategyResult {
  return {
    status: 'converted',
    classNames: ['m-0', 'w-full', 'h-full', 'min-w-full', 'min-h-full'],
  };
}

export function planFlexFill(): TailwindStrategyResult {
  const planned = planFlexFillSemantics();
  return planned.status === 'planned' ? renderFlexFill(planned.value) : planned;
}
