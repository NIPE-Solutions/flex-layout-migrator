import { BreakPoint } from '../converter.type';

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
