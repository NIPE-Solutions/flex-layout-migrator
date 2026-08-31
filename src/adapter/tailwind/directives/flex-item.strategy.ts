import type { TailwindStrategyResult } from '../tailwind-semantic.model';
import { parseCssLength } from '../tailwind-value.parser';
import { parseLayout } from './layout.strategy';

export interface FlexItemInput {
  readonly basis: string;
  readonly grow?: string;
  readonly shrink?: string;
  readonly layout: string | undefined;
}

const FACTOR = /^\d+(?:\.\d+)?$/;
function property(name: string, value: string): string {
  return `[${name}:${value.replaceAll(' ', '_')}]`;
}

export function planFlexItem(input: FlexItemInput): TailwindStrategyResult {
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

  const direction = layout.value.direction.startsWith('column') ? 'height' : 'width';
  let isValue = false;
  let usingCalc = false;

  if (!basis) {
    basis = direction === 'width' ? '0%' : '0.000000001px';
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
  }

  const fixed = grow === '0' && shrink === '0';
  const min =
    !['0%', '0px', '0.000000001px', 'auto'].includes(basis) && (fixed || (isValue && grow !== '0')) ? basis : undefined;
  const max =
    !['0%', '0px', '0.000000001px', 'auto'].includes(basis) && (fixed || (!usingCalc && shrink !== '0'))
      ? basis
      : undefined;

  const effectiveBasis =
    min || max ? (layout.value.wrap !== 'nowrap' ? (max ?? min ?? basis) : isValue ? basis : '100%') : basis;
  const flexClasses = usingCalc
    ? [property('flex-grow', grow), property('flex-shrink', shrink), property('flex-basis', effectiveBasis)]
    : [property('flex', `${grow} ${shrink} ${effectiveBasis}`)];
  return {
    status: 'converted',
    classNames: [
      ...flexClasses,
      ...(min ? [property(`min-${direction}`, min)] : []),
      ...(max ? [property(`max-${direction}`, max)] : []),
      'box-border',
    ],
  };
}
