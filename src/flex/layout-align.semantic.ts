import type { SemanticResult } from './flex-semantic.model';
import { parseLayout, type LayoutSemantics } from './layout.semantic';

export type LayoutMainAlignment = 'start' | 'center' | 'end' | 'space-around' | 'space-between' | 'space-evenly';
export type LayoutItemsAlignment = 'start' | 'center' | 'end' | 'baseline' | 'stretch';
export type LayoutContentAlignment = 'start' | 'center' | 'end' | 'stretch' | 'space-around' | 'space-between';

export interface LayoutAlignmentSemantics {
  readonly main: LayoutMainAlignment;
  readonly items: LayoutItemsAlignment;
  readonly content: LayoutContentAlignment;
  readonly stretchMaximum?: 'width' | 'height';
  readonly layout: LayoutSemantics;
}

const mainAxis: Readonly<Record<string, LayoutMainAlignment>> = {
  start: 'start',
  'flex-start': 'start',
  center: 'center',
  end: 'end',
  'flex-end': 'end',
  'space-around': 'space-around',
  'space-between': 'space-between',
  'space-evenly': 'space-evenly',
};

const crossAxis: Readonly<Record<string, readonly [LayoutItemsAlignment, LayoutContentAlignment]>> = {
  start: ['start', 'start'],
  'flex-start': ['start', 'start'],
  center: ['center', 'center'],
  end: ['end', 'end'],
  'flex-end': ['end', 'end'],
  'space-between': ['stretch', 'space-between'],
  'space-around': ['stretch', 'space-around'],
  baseline: ['baseline', 'stretch'],
  stretch: ['stretch', 'stretch'],
};

export function planLayoutAlignment(value: string, layoutValue: string): SemanticResult<LayoutAlignmentSemantics> {
  const values = value.split(/\s+/).filter(Boolean);
  if (values.length > 2) return { status: 'invalid', code: 'invalid-value' };

  const main = mainAxis[values[0] ?? 'start'];
  const crossKey = values[1] ?? 'stretch';
  const cross = crossAxis[crossKey];
  const layout = parseLayout(layoutValue);
  if (!main || !cross || !layout.ok) return { status: 'invalid', code: 'invalid-value' };

  const stretchMaximum =
    crossKey === 'stretch'
      ? layout.value.direction === 'row' || layout.value.direction === 'row-reverse'
        ? 'height'
        : 'width'
      : undefined;

  return {
    status: 'planned',
    value: { main, items: cross[0], content: cross[1], stretchMaximum, layout: layout.value },
  };
}
