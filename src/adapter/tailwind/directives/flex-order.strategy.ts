import type { TailwindStrategyResult } from '../tailwind-semantic.model';
import { planFlexOrderSemantics, type FlexOrderSemantics } from '../../../flex/flex-order.semantic';

export function renderFlexOrder(value: FlexOrderSemantics): TailwindStrategyResult {
  return { status: 'converted', classNames: value.order === undefined ? [] : [`[order:${value.order}]`] };
}

export function planFlexOrder(value: string): TailwindStrategyResult {
  const planned = planFlexOrderSemantics(value);
  return planned.status === 'planned' ? renderFlexOrder(planned.value) : planned;
}
