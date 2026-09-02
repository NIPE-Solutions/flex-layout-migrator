import type { TailwindStrategyResult } from '../tailwind-semantic.model';
import { planLayoutGapSemantics, type LayoutGapSemantics } from '../../../flex/layout-gap.semantic';
import { arbitraryValue } from '../tailwind-value.parser';

export function renderLayoutGap(gap: LayoutGapSemantics): TailwindStrategyResult {
  return { status: 'converted', classNames: [`gap-${arbitraryValue(gap.length)}`] };
}

export function planLayoutGap(value: string, layoutValue: string | undefined): TailwindStrategyResult {
  const planned = planLayoutGapSemantics(value, layoutValue);
  return planned.status === 'planned' ? renderLayoutGap(planned.value) : planned;
}
