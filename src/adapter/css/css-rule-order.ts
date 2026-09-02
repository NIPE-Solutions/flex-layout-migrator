import type { OwnedCssRule } from './css-artifact.model';
import { compareCodeUnits } from '../../util/compare-code-units';

export function compareOwnedCssRules(left: OwnedCssRule, right: OwnedCssRule): number {
  const baseOrder = Number(left.context.media !== undefined) - Number(right.context.media !== undefined);
  if (baseOrder !== 0) return baseOrder;
  const priorityOrder = right.context.priority - left.context.priority;
  return priorityOrder || compareCodeUnits(left.id, right.id);
}
