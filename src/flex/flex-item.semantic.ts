import { parseCssLength, type CssLength } from './css-length';
import type { SemanticResult } from './flex-semantic.model';
import { parseLayout, type LayoutSemantics } from './layout.semantic';

export interface FlexItemInput {
  readonly basis: string;
  readonly grow?: string;
  readonly shrink?: string;
  readonly layout?: string;
}

export type FlexBasisSemantics =
  | { readonly kind: 'keyword'; readonly value: 'auto' }
  | { readonly kind: 'literal' | 'computed'; readonly value: CssLength };

export interface FlexItemSemantics {
  readonly grow: string;
  readonly shrink: string;
  readonly basis: FlexBasisSemantics;
  readonly axis: 'width' | 'height';
  readonly min?: CssLength;
  readonly max?: CssLength;
  readonly boxSizing: 'border-box';
}

const FACTOR = /^\d+(?:\.\d+)?$/;
const unconstrainedBases = new Set(['0%', '0px', '0.000000001px', 'auto']);

function sizingAxis(layout: LayoutSemantics): FlexItemSemantics['axis'] {
  return layout.direction.startsWith('column') ? 'height' : 'width';
}

export function planFlexItemSemantics(input: FlexItemInput): SemanticResult<FlexItemSemantics> {
  if (input.layout === undefined) {
    return {
      status: 'review',
      code: 'context-unverified',
      reason: 'Flex sizing depends on a dynamic parent direction or wrapping mode.',
      suggestion: 'Make the parent layout static or migrate this flex item manually.',
    };
  }

  const layout = parseLayout(input.layout);
  if (!layout.ok) return { status: 'invalid', code: 'invalid-value' };

  let grow = input.grow?.trim() || '1';
  let shrink = input.shrink?.trim() || '1';
  let basis = input.basis.trim();
  const shorthand = basis.startsWith('calc(') ? undefined : basis.match(/^(\S+)\s+(\S+)\s+(.+)$/);
  if (shorthand) {
    grow = shorthand[1] ?? grow;
    shrink = shorthand[2] ?? shrink;
    basis = shorthand[3] ?? basis;
  } else if (basis.split(/\s+/).length > 1 && !basis.startsWith('calc(')) {
    return { status: 'invalid', code: 'invalid-value' };
  }
  if (!FACTOR.test(grow) || !FACTOR.test(shrink)) return { status: 'invalid', code: 'invalid-value' };

  const axis = sizingAxis(layout.value);
  let isValue = false;
  let usingCalc = false;

  if (!basis) {
    basis = axis === 'width' ? '0%' : '0.000000001px';
  } else if (basis === 'initial' || basis === 'nogrow') {
    grow = '0';
    basis = 'auto';
  } else if (basis === 'grow') {
    basis = '100%';
  } else if (basis === 'noshrink') {
    shrink = '0';
    basis = 'auto';
  } else if (basis === 'none') {
    grow = '0';
    shrink = '0';
    basis = 'auto';
  } else if (basis !== 'auto') {
    const parsed = parseCssLength(basis, { fallbackUnit: '%' });
    if (!parsed.ok) return { status: 'invalid', code: 'invalid-value' };
    basis = parsed.value;
    usingCalc = basis.startsWith('calc(');
    isValue = usingCalc || !basis.endsWith('%');
    if (basis === '0px') basis = '0%';
  }

  const fixed = grow === '0' && shrink === '0';
  const constrainedBasis = basis as CssLength;
  const min = !unconstrainedBases.has(basis) && (fixed || (isValue && grow !== '0')) ? constrainedBasis : undefined;
  const max =
    !unconstrainedBases.has(basis) && (fixed || (!usingCalc && shrink !== '0')) ? constrainedBasis : undefined;
  const effectiveBasis =
    min || max ? (layout.value.wrap === 'wrap' ? (max ?? min ?? basis) : isValue ? basis : '100%') : basis;
  const semanticBasis: FlexBasisSemantics =
    effectiveBasis === 'auto'
      ? { kind: 'keyword', value: effectiveBasis }
      : { kind: effectiveBasis.startsWith('calc(') ? 'computed' : 'literal', value: effectiveBasis as CssLength };

  return {
    status: 'planned',
    value: { grow, shrink, basis: semanticBasis, axis, min, max, boxSizing: 'border-box' },
  };
}
