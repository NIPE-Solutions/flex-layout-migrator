import { isArbitraryValue } from '../../util/value.util';
import { BreakPoint } from '../breakpoint.type';

/**
 * Provides a mapping from the BreakPoint type to the corresponding TailwindCSS breakpoint.
 */
const BREAKPOINT_MAPPING: { [key in BreakPoint]: string } = {
  xs: 'xs',
  sm: 'sm',
  md: 'md',
  lg: 'lg',
  xl: 'xl',
  'lt-sm': 'xs',
  'lt-md': 'sm',
  'lt-lg': 'md',
  'lt-xl': 'lg',
  'gt-xs': 'sm',
  'gt-sm': 'md',
  'gt-md': 'lg',
  'gt-lg': 'xl',
};

/**
 * Maps the breakpoint to the corresponding TailwindCSS breakpoint. If the breakpoint is unknown, an error is thrown.
 * If no breakpoint is given, an empty string is returned.
 *
 * @param breakPoint The breakpoint to map
 * @returns the mapped breakpoint
 * @throws an error if the breakpoint is unknown
 *
 */
export function mapBreakpoint(breakPoint: BreakPoint | undefined): string {
  if (!breakPoint) {
    return '';
  }

  if (!BREAKPOINT_MAPPING[breakPoint]) {
    throw new Error(`Unknown breakpoint: ${breakPoint}`);
  }

  return BREAKPOINT_MAPPING[breakPoint] || '';
}

/**
 * Adds the breakpoint as prefix to the class name. If no breakpoint is given, the class name is returned.
 * @param breakPoint the breakpoint from flex-layout that is mapped to the TailwindCSS breakpoint and added as prefix
 * @param className the class name
 * @returns the class name with the breakpoint as prefix
 */
export function prefixValueWithBreakpoint(breakPoint: BreakPoint | undefined, className: string): string {
  const mappedBreakpoint = mapBreakpoint(breakPoint);
  return mappedBreakpoint ? `${mappedBreakpoint}:${className}` : className;
}

/**
 * Formats the value based on the given TailwindCSS option. If the value is arbitary, it is wrapped in square brackets. If not, it is not wrapped. If no breakpoint is given, the value is returned.
 * @param value the value to format
 * @param breakPoint the breakpoint from flex-layout that is mapped to the TailwindCSS breakpoint and added as prefix
 */
export function generateTailwindClassName(
  tailwindOpt: string,
  value?: string | undefined,
  breakPoint?: BreakPoint | undefined,
) {
  const isValueDefined = value !== undefined;
  const isArbitary = isValueDefined ? isArbitraryValue(value) : undefined;
  const formattedValue = isValueDefined ? tailwindOpt + (isArbitary ? `-[${value}]` : `-${value}`) : tailwindOpt;
  return prefixValueWithBreakpoint(breakPoint, formattedValue);
}
