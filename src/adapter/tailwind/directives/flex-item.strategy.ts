import type { TailwindStrategyResult } from '../tailwind-semantic.model';
import { planFlexItemSemantics, type FlexItemInput, type FlexItemSemantics } from '../../../flex/flex-item.semantic';

export type { FlexItemInput } from '../../../flex/flex-item.semantic';

const property = (name: string, value: string) => `[${name}:${value.replaceAll(/\s+/g, '_')}]`;

export function renderFlexItem(value: FlexItemSemantics): readonly string[] {
  const flexClasses = value.splitProperties
    ? [property('flex-grow', value.grow), property('flex-shrink', value.shrink), property('flex-basis', value.basis)]
    : [property('flex', `${value.grow} ${value.shrink} ${value.basis}`)];
  return [
    ...flexClasses,
    ...(value.min ? [property(`min-${value.axis}`, value.min)] : []),
    ...(value.max ? [property(`max-${value.axis}`, value.max)] : []),
    'box-border',
  ];
}

export function planFlexItem(input: FlexItemInput): TailwindStrategyResult {
  const planned = planFlexItemSemantics(input);
  return planned.status === 'planned' ? { status: 'converted', classNames: renderFlexItem(planned.value) } : planned;
}
