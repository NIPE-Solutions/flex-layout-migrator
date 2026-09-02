import type { TailwindStrategyResult } from '../tailwind-semantic.model';
import {
  planFlexAlignSemantics,
  type FlexAlignSemantics,
  type FlexSelfAlignment,
} from '../../../flex/flex-align.semantic';

const selfAlignment: Readonly<Record<FlexSelfAlignment, string>> = {
  auto: 'self-auto',
  start: 'self-start',
  end: 'self-end',
  center: 'self-center',
  baseline: 'self-baseline',
  stretch: 'self-stretch',
};

export function renderFlexAlign(value: FlexAlignSemantics): TailwindStrategyResult {
  return { status: 'converted', classNames: [selfAlignment[value.alignment]] };
}

export function planFlexAlign(value: string): TailwindStrategyResult {
  const planned = planFlexAlignSemantics(value);
  return planned.status === 'planned' ? renderFlexAlign(planned.value) : planned;
}
