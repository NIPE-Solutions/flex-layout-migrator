import type { ParsedValue } from './css-length';

export type LayoutDirection = 'row' | 'row-reverse' | 'column' | 'column-reverse';
export type LayoutWrap = 'nowrap' | 'wrap' | 'wrap-reverse';

export interface LayoutSemantics {
  readonly direction: LayoutDirection;
  readonly wrap: LayoutWrap;
  readonly explicitWrap: boolean;
  readonly display: 'flex' | 'inline-flex';
  readonly boxSizing: 'border-box';
}

const directions = new Set<LayoutDirection>(['row', 'row-reverse', 'column', 'column-reverse']);
const wraps = new Set<LayoutWrap>(['nowrap', 'wrap', 'wrap-reverse']);

export function parseLayout(value: string): ParsedValue<LayoutSemantics> {
  const tokens = value.split(/\s+/).filter(Boolean);
  const direction = (tokens.shift() ?? 'row') as LayoutDirection;
  if (!directions.has(direction)) return { ok: false };

  const wrapTokens = tokens.filter(token => wraps.has(token as LayoutWrap));
  if (wrapTokens.length > 1) return { ok: false };

  let wrap: LayoutWrap = 'nowrap';
  let display: LayoutSemantics['display'] = 'flex';
  for (const token of tokens) {
    if (wraps.has(token as LayoutWrap)) {
      wrap = token as LayoutWrap;
    } else if (token === 'inline' && display === 'flex') {
      display = 'inline-flex';
    } else {
      return { ok: false };
    }
  }

  return {
    ok: true,
    value: { direction, wrap, explicitWrap: wrapTokens.length === 1, display, boxSizing: 'border-box' },
  };
}
