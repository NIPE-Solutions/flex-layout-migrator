import type { ParsedValue } from '../tailwind-semantic.model';
import { layoutClassNames, parseLayout, type TailwindClassPlan } from './layout.strategy';

const mainAxis = {
  start: 'start',
  'flex-start': 'start',
  center: 'center',
  end: 'end',
  'flex-end': 'end',
  'space-around': 'around',
  'space-between': 'between',
  'space-evenly': 'evenly',
} as const;

const crossAxis = {
  start: ['start', 'start'],
  'flex-start': ['start', 'start'],
  center: ['center', 'center'],
  end: ['end', 'end'],
  'flex-end': ['end', 'end'],
  'space-between': ['stretch', 'between'],
  'space-around': ['stretch', 'around'],
  baseline: ['baseline', 'stretch'],
  stretch: ['stretch', 'stretch'],
} as const;

export function planLayoutAlign(value: string, layoutValue: string): ParsedValue<TailwindClassPlan> {
  const values = value.split(/\s+/).filter(Boolean);
  if (values.length > 2) return { ok: false };
  const main = mainAxis[(values[0] ?? 'start') as keyof typeof mainAxis];
  const crossKey = (values[1] ?? 'stretch') as keyof typeof crossAxis;
  const cross = crossAxis[crossKey];
  const layout = parseLayout(layoutValue);
  if (!main || !cross || !layout.ok) return { ok: false };

  const sizing =
    crossKey !== 'stretch' ? [] : layout.value.direction.startsWith('row') ? ['max-h-full'] : ['max-w-full'];
  return {
    ok: true,
    value: {
      classNames: [
        `justify-${main}`,
        `items-${cross[0]}`,
        `content-${cross[1]}`,
        ...layoutClassNames(layout.value),
        ...sizing,
      ],
    },
  };
}
