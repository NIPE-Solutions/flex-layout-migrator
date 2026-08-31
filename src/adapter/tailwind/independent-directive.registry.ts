import type { LocatedFlexLayoutInput } from '../../analyzer/flex-layout-attribute.analyzer';
import { planFlexAlign } from './directives/flex-align.strategy';
import { planFlexFill } from './directives/flex-fill.strategy';
import { planFlexOrder } from './directives/flex-order.strategy';
import type { TailwindStrategyResult } from './tailwind-semantic.model';

type IndependentDirective = 'fxFlexAlign' | 'fxFlexFill' | 'fxFill' | 'fxFlexOrder';
type IndependentPlanner = (value: string) => TailwindStrategyResult;

const planners = new Map<IndependentDirective, IndependentPlanner>([
  ['fxFlexAlign', planFlexAlign],
  ['fxFlexFill', planFlexFill],
  ['fxFill', planFlexFill],
  ['fxFlexOrder', planFlexOrder],
]);

export function planIndependentDirective(input: LocatedFlexLayoutInput): TailwindStrategyResult | undefined {
  return planners.get(input.directive as IndependentDirective)?.(input.value);
}
