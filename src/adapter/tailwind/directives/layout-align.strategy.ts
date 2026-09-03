import type { ParsedValue } from '../../../flex/css-length';
import {
  planLayoutAlignment,
  type LayoutAlignmentSemantics,
  type LayoutContentAlignment,
  type LayoutItemsAlignment,
  type LayoutMainAlignment,
} from '../../../flex/layout-align.semantic';
import { renderLayout, type TailwindClassPlan } from './layout.strategy';

const mainAxis: Readonly<Record<LayoutMainAlignment, string>> = {
  start: 'start',
  center: 'center',
  end: 'end',
  'space-around': 'around',
  'space-between': 'between',
  'space-evenly': 'evenly',
};

const itemsAxis: Readonly<Record<LayoutItemsAlignment, string>> = {
  start: 'start',
  center: 'center',
  end: 'end',
  baseline: 'baseline',
  stretch: 'stretch',
};

const contentAxis: Readonly<Record<LayoutContentAlignment, string>> = {
  start: 'start',
  center: 'center',
  end: 'end',
  stretch: 'stretch',
  'space-around': 'around',
  'space-between': 'between',
};

export function renderLayoutAlignment(alignment: LayoutAlignmentSemantics): TailwindClassPlan {
  const sizing =
    alignment.stretchMaximum === 'height' ? ['max-h-full'] : alignment.stretchMaximum === 'width' ? ['max-w-full'] : [];
  return {
    classNames: [
      `justify-${mainAxis[alignment.main]}`,
      `items-${itemsAxis[alignment.items]}`,
      `content-${contentAxis[alignment.content]}`,
      ...renderLayout(alignment.layout),
      ...sizing,
    ],
  };
}

export function planLayoutAlign(value: string, layoutValue: string): ParsedValue<TailwindClassPlan> {
  const planned = planLayoutAlignment(value, layoutValue);
  return planned.status === 'planned' ? { ok: true, value: renderLayoutAlignment(planned.value) } : { ok: false };
}
