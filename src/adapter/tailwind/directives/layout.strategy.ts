import type { ParsedValue } from '../tailwind-semantic.model';

export type LayoutDirection = 'row' | 'row-reverse' | 'column' | 'column-reverse';
export type LayoutWrap = 'nowrap' | 'wrap' | 'wrap-reverse';

export interface LayoutValue {
  readonly direction: LayoutDirection;
  readonly wrap: LayoutWrap;
  readonly explicitWrap: boolean;
  readonly inline: boolean;
}

export interface TailwindClassPlan {
  readonly classNames: readonly string[];
}

const directions = new Set<LayoutDirection>(['row', 'row-reverse', 'column', 'column-reverse']);
const wraps = new Set<LayoutWrap>(['nowrap', 'wrap', 'wrap-reverse']);

export function parseLayout(value: string): ParsedValue<LayoutValue> {
  const tokens = value.split(/\s+/).filter(Boolean);
  const direction = (tokens.shift() ?? 'row') as LayoutDirection;
  if (!directions.has(direction)) return { ok: false };

  const wrapTokens = tokens.filter(token => wraps.has(token as LayoutWrap));
  if (wrapTokens.length > 1) return { ok: false };
  let wrap: LayoutWrap = 'nowrap';
  let inline = false;
  for (const token of tokens) {
    if (wraps.has(token as LayoutWrap)) {
      wrap = token as LayoutWrap;
    } else if (token === 'inline' && !inline) {
      inline = true;
    } else {
      return { ok: false };
    }
  }

  return { ok: true, value: { direction, wrap, explicitWrap: wrapTokens.length === 1, inline } };
}

export function layoutClassNames(layout: LayoutValue): readonly string[] {
  const direction = {
    row: 'flex-row',
    'row-reverse': 'flex-row-reverse',
    column: 'flex-col',
    'column-reverse': 'flex-col-reverse',
  }[layout.direction];
  const wrap = layout.explicitWrap ? [`flex-${layout.wrap}`] : [];
  return [layout.inline ? 'inline-flex' : 'flex', direction, ...wrap, 'box-border'];
}

export function planLayout(value: string): ParsedValue<TailwindClassPlan> {
  const parsed = parseLayout(value);
  return parsed.ok ? { ok: true, value: { classNames: layoutClassNames(parsed.value) } } : parsed;
}
