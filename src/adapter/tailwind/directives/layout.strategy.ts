import { parseLayout, type LayoutSemantics } from '../../../flex/layout.semantic';
import type { ParsedValue } from '../../../flex/css-length';

export interface TailwindClassPlan {
  readonly classNames: readonly string[];
}

export function renderLayout(layout: LayoutSemantics): readonly string[] {
  const display = { flex: 'flex', 'inline-flex': 'inline-flex' }[layout.display];
  const direction = {
    row: 'flex-row',
    'row-reverse': 'flex-row-reverse',
    column: 'flex-col',
    'column-reverse': 'flex-col-reverse',
  }[layout.direction];
  const wrap = layout.explicitWrap ? [`flex-${layout.wrap}`] : [];
  const boxSizing = { 'border-box': 'box-border' }[layout.boxSizing];
  return [display, direction, ...wrap, boxSizing];
}

export function planLayout(value: string): ParsedValue<TailwindClassPlan> {
  const parsed = parseLayout(value);
  return parsed.ok ? { ok: true, value: { classNames: renderLayout(parsed.value) } } : parsed;
}
