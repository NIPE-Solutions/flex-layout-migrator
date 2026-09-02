import {
  DEFAULT_BREAKPOINTS,
  FLEX_LAYOUT_DIRECTIVES,
  ORIENTATION_BREAKPOINTS,
  SPECIAL_BREAKPOINTS,
} from './flex-layout.catalog';
import type { FlexLayoutDirective } from './flex-layout.catalog';

export type CompatibilityLevel = 'limited' | 'planned' | 'preserved' | 'not-applicable';

export interface BreakpointCoverage {
  readonly standard: CompatibilityLevel;
  readonly orientation: CompatibilityLevel;
  readonly print: CompatibilityLevel;
  readonly custom: CompatibilityLevel;
}

export interface CompatibilityEntry {
  readonly directive: FlexLayoutDirective;
  readonly family: 'flex' | 'grid' | 'visibility' | 'class-style' | 'image';
  readonly tailwind: CompatibilityLevel;
  readonly css: CompatibilityLevel;
  readonly image: CompatibilityLevel;
  readonly breakpoints: BreakpointCoverage;
  readonly note: string;
}

const breakpointCatalog = {
  standard: DEFAULT_BREAKPOINTS,
  orientation: ORIENTATION_BREAKPOINTS,
  print: SPECIAL_BREAKPOINTS,
} as const;

const standardLimited: BreakpointCoverage = {
  standard: 'limited',
  orientation: 'planned',
  print: 'planned',
  custom: 'preserved',
};

const imageLimited: BreakpointCoverage = {
  standard: 'limited',
  orientation: 'not-applicable',
  print: 'not-applicable',
  custom: 'preserved',
};

const classStylePreserved: BreakpointCoverage = {
  standard: 'preserved',
  orientation: 'preserved',
  print: 'preserved',
  custom: 'preserved',
};

const entries: CompatibilityEntry[] = [
  {
    directive: 'fxLayout',
    family: 'flex',
    tailwind: 'limited',
    css: 'planned',
    image: 'not-applicable',
    breakpoints: standardLimited,
    note: 'Static directions plus wrap and inline modifiers; coupled unresolved gaps preserve the layout.',
  },
  {
    directive: 'fxLayoutAlign',
    family: 'flex',
    tailwind: 'limited',
    css: 'planned',
    image: 'not-applicable',
    breakpoints: standardLimited,
    note: 'Static main/cross axes with layout, content alignment, sizing, and border-box semantics.',
  },
  {
    directive: 'fxLayoutGap',
    family: 'flex',
    tailwind: 'limited',
    css: 'planned',
    image: 'not-applicable',
    breakpoints: standardLimited,
    note: 'Static nonnegative non-wrapping gaps; unitless values remain pixels.',
  },
  {
    directive: 'fxFlex',
    family: 'flex',
    tailwind: 'limited',
    css: 'planned',
    image: 'not-applicable',
    breakpoints: standardLimited,
    note: 'Static basis, keyword, and three-part forms with parent-axis min/max sizing.',
  },
  {
    directive: 'fxGrow',
    family: 'flex',
    tailwind: 'limited',
    css: 'planned',
    image: 'not-applicable',
    breakpoints: standardLimited,
    note: 'Converted atomically with a static fxFlex; standalone use is invalid.',
  },
  {
    directive: 'fxShrink',
    family: 'flex',
    tailwind: 'limited',
    css: 'planned',
    image: 'not-applicable',
    breakpoints: standardLimited,
    note: 'Converted atomically with a static fxFlex; standalone use is invalid.',
  },
  {
    directive: 'fxFlexAlign',
    family: 'flex',
    tailwind: 'limited',
    css: 'planned',
    image: 'not-applicable',
    breakpoints: standardLimited,
    note: 'Static align-self keywords.',
  },
  {
    directive: 'fxFlexFill',
    family: 'flex',
    tailwind: 'limited',
    css: 'planned',
    image: 'not-applicable',
    breakpoints: standardLimited,
    note: 'Static full-size rule including its zero-margin behavior.',
  },
  {
    directive: 'fxFill',
    family: 'flex',
    tailwind: 'limited',
    css: 'planned',
    image: 'not-applicable',
    breakpoints: standardLimited,
    note: 'Non-responsive alias of fxFlexFill.',
  },
  {
    directive: 'fxFlexOffset',
    family: 'flex',
    tailwind: 'limited',
    css: 'planned',
    image: 'not-applicable',
    breakpoints: standardLimited,
    note: 'Static values with a statically known parent axis; unitless values remain percentages.',
  },
  {
    directive: 'fxFlexOrder',
    family: 'flex',
    tailwind: 'limited',
    css: 'planned',
    image: 'not-applicable',
    breakpoints: standardLimited,
    note: 'Static integer values emitted independently of the Tailwind theme.',
  },
  {
    directive: 'fxShow',
    family: 'visibility',
    tailwind: 'limited',
    css: 'planned',
    image: 'not-applicable',
    breakpoints: standardLimited,
    note: 'Literal base and standard viewport states convert when display restoration and the complete visibility family are safe.',
  },
  {
    directive: 'fxHide',
    family: 'visibility',
    tailwind: 'limited',
    css: 'planned',
    image: 'not-applicable',
    breakpoints: standardLimited,
    note: 'Literal base and standard viewport states convert with fxShow; hiding emits exact base or responsive hidden utilities.',
  },
  {
    directive: 'gdAlignColumns',
    family: 'grid',
    tailwind: 'limited',
    css: 'planned',
    image: 'not-applicable',
    breakpoints: standardLimited,
    note: 'Literal values convert when compiler output, display composition, context, and ownership are exact.',
  },
  {
    directive: 'gdAlignRows',
    family: 'grid',
    tailwind: 'limited',
    css: 'planned',
    image: 'not-applicable',
    breakpoints: standardLimited,
    note: 'Literal values convert when compiler output, display composition, context, and ownership are exact.',
  },
  {
    directive: 'gdArea',
    family: 'grid',
    tailwind: 'limited',
    css: 'planned',
    image: 'not-applicable',
    breakpoints: standardLimited,
    note: 'Literal values convert when compiler output, display composition, context, and ownership are exact.',
  },
  {
    directive: 'gdAreas',
    family: 'grid',
    tailwind: 'limited',
    css: 'planned',
    image: 'not-applicable',
    breakpoints: standardLimited,
    note: 'Literal values convert when compiler output, display composition, context, and ownership are exact.',
  },
  {
    directive: 'gdAuto',
    family: 'grid',
    tailwind: 'limited',
    css: 'planned',
    image: 'not-applicable',
    breakpoints: standardLimited,
    note: 'Literal values convert when compiler output, display composition, context, and ownership are exact.',
  },
  {
    directive: 'gdColumn',
    family: 'grid',
    tailwind: 'limited',
    css: 'planned',
    image: 'not-applicable',
    breakpoints: standardLimited,
    note: 'Literal values convert when compiler output, display composition, context, and ownership are exact.',
  },
  {
    directive: 'gdColumns',
    family: 'grid',
    tailwind: 'limited',
    css: 'planned',
    image: 'not-applicable',
    breakpoints: standardLimited,
    note: 'Literal values convert when compiler output, display composition, context, and ownership are exact.',
  },
  {
    directive: 'gdGap',
    family: 'grid',
    tailwind: 'limited',
    css: 'planned',
    image: 'not-applicable',
    breakpoints: standardLimited,
    note: 'Literal values convert when compiler output, display composition, context, and ownership are exact.',
  },
  {
    directive: 'gdGridAlign',
    family: 'grid',
    tailwind: 'limited',
    css: 'planned',
    image: 'not-applicable',
    breakpoints: standardLimited,
    note: 'Literal values convert when compiler output, display composition, context, and ownership are exact.',
  },
  {
    directive: 'gdInline',
    family: 'grid',
    tailwind: 'limited',
    css: 'planned',
    image: 'not-applicable',
    breakpoints: standardLimited,
    note: 'Literal values convert when compiler output, display composition, context, and ownership are exact.',
  },
  {
    directive: 'gdRow',
    family: 'grid',
    tailwind: 'limited',
    css: 'planned',
    image: 'not-applicable',
    breakpoints: standardLimited,
    note: 'Literal values convert when compiler output, display composition, context, and ownership are exact.',
  },
  {
    directive: 'gdRows',
    family: 'grid',
    tailwind: 'limited',
    css: 'planned',
    image: 'not-applicable',
    breakpoints: standardLimited,
    note: 'Literal values convert when compiler output, display composition, context, and ownership are exact.',
  },
  {
    directive: 'class',
    family: 'class-style',
    tailwind: 'preserved',
    css: 'preserved',
    image: 'not-applicable',
    breakpoints: classStylePreserved,
    note: 'Version-dependent replacement and merge behavior is not inferred.',
  },
  {
    directive: 'ngClass',
    family: 'class-style',
    tailwind: 'limited',
    css: 'planned',
    image: 'not-applicable',
    breakpoints: standardLimited,
    note: 'Converts complete families whose class tokens are proven Tailwind CSS v4 candidates.',
  },
  {
    directive: 'style',
    family: 'class-style',
    tailwind: 'preserved',
    css: 'preserved',
    image: 'not-applicable',
    breakpoints: classStylePreserved,
    note: 'Version-dependent replacement and merge behavior is not inferred.',
  },
  {
    directive: 'ngStyle',
    family: 'class-style',
    tailwind: 'limited',
    css: 'planned',
    image: 'not-applicable',
    breakpoints: standardLimited,
    note: 'Converts complete, sanitizer-safe declaration lists with exact CSS ownership.',
  },
  {
    directive: 'imgSrc',
    family: 'image',
    tailwind: 'not-applicable',
    css: 'not-applicable',
    image: 'limited',
    breakpoints: imageLimited,
    note: 'Opt-in literal standard aliases convert to picture markup when URL, fallback, and structural context are safe.',
  },
];

FLEX_LAYOUT_DIRECTIVES satisfies readonly FlexLayoutDirective[];
void breakpointCatalog;

export const COMPATIBILITY_INVENTORY = Object.freeze(entries satisfies readonly CompatibilityEntry[]);
