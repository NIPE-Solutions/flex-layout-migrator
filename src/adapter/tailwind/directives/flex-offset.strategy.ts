import type { TailwindStrategyResult } from '../tailwind-semantic.model';
import { planFlexOffsetSemantics, type FlexOffsetSemantics } from '../../../flex/flex-offset.semantic';
import { arbitraryValue } from '../tailwind-value.parser';

const marginPrefix: Readonly<Record<FlexOffsetSemantics['axis'], string>> = {
  'inline-start': 'ms',
  'block-start': 'mt',
};

export function renderFlexOffset(value: FlexOffsetSemantics): TailwindStrategyResult {
  return { status: 'converted', classNames: [`${marginPrefix[value.axis]}-${arbitraryValue(value.length)}`] };
}

export function planFlexOffset(value: string, layoutValue: string | undefined): TailwindStrategyResult {
  const planned = planFlexOffsetSemantics(value, layoutValue);
  return planned.status === 'planned' ? renderFlexOffset(planned.value) : planned;
}
