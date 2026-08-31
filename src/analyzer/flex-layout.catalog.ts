export const FLEX_LAYOUT_DIRECTIVES = [
  'fxLayout',
  'fxLayoutAlign',
  'fxLayoutGap',
  'fxFlex',
  'fxGrow',
  'fxShrink',
  'fxFlexAlign',
  'fxFlexFill',
  'fxFill',
  'fxFlexOffset',
  'fxFlexOrder',
  'fxShow',
  'fxHide',
  'gdAlignColumns',
  'gdAlignRows',
  'gdArea',
  'gdAreas',
  'gdAuto',
  'gdColumn',
  'gdColumns',
  'gdGap',
  'gdGridAlign',
  'gdRow',
  'gdRows',
  'class',
  'ngClass',
  'style',
  'ngStyle',
  'imgSrc',
] as const;

export type FlexLayoutDirective = (typeof FLEX_LAYOUT_DIRECTIVES)[number];

export const DEFAULT_BREAKPOINTS = [
  'xs',
  'sm',
  'md',
  'lg',
  'xl',
  'lt-sm',
  'lt-md',
  'lt-lg',
  'lt-xl',
  'gt-xs',
  'gt-sm',
  'gt-md',
  'gt-lg',
] as const;

export type DefaultBreakpoint = (typeof DEFAULT_BREAKPOINTS)[number];

export const ORIENTATION_BREAKPOINTS = [
  'handset',
  'handset.portrait',
  'handset.landscape',
  'tablet',
  'tablet.portrait',
  'tablet.landscape',
  'web',
  'web.portrait',
  'web.landscape',
] as const;

export const SPECIAL_BREAKPOINTS = ['print'] as const;

export type KnownBreakpoint =
  DefaultBreakpoint | (typeof ORIENTATION_BREAKPOINTS)[number] | (typeof SPECIAL_BREAKPOINTS)[number];

const directiveNames = new Set<string>(FLEX_LAYOUT_DIRECTIVES);
const breakpointNames = new Set<string>([...DEFAULT_BREAKPOINTS, ...ORIENTATION_BREAKPOINTS, ...SPECIAL_BREAKPOINTS]);

export function isFlexLayoutDirective(value: string): value is FlexLayoutDirective {
  return directiveNames.has(value);
}

export function isKnownBreakpoint(value: string): value is KnownBreakpoint {
  return breakpointNames.has(value);
}
