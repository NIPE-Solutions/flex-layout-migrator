import { mediaRangesIntersect, type MediaRange } from '../../breakpoint/breakpoint-catalog';
import { analyzeTailwindArbitrarySyntax } from './tailwind-arbitrary-syntax';
import { cssPropertiesOverlap } from './extended/css-property-ownership';
import {
  isPinnedTailwindColorToken,
  tailwindArbitraryBackgroundKind,
  tailwindArbitraryBorderKind,
  tailwindArbitraryShadowKind,
  tailwindArbitraryTextKind,
} from './extended/tailwind-arbitrary-value-ownership';

export type TailwindActivation = { readonly kind: 'base' } | { readonly kind: 'media'; readonly range: MediaRange };

export interface TailwindDisplayUtility {
  readonly token: string;
  readonly utility: string;
  readonly activation: TailwindActivation;
  readonly important: boolean;
}

export interface TailwindUtilityDescriptor {
  readonly token: string;
  readonly variants: readonly string[];
  readonly utility: string;
  readonly cssProperties: readonly string[];
  readonly hasUnknownCssAuthority?: true;
  readonly activation: TailwindActivation;
  readonly hasGeneratedMediaVariant: boolean;
  readonly important: boolean;
}

const displayUtilities = new Set([
  'inline',
  'block',
  'inline-block',
  'flow-root',
  'flex',
  'inline-flex',
  'grid',
  'inline-grid',
  'contents',
  'table',
  'inline-table',
  'table-caption',
  'table-cell',
  'table-column',
  'table-column-group',
  'table-footer-group',
  'table-header-group',
  'table-row-group',
  'table-row',
  'list-item',
  'hidden',
]);

const generatedMediaVariant =
  /^\[@media_screen_and_(?:(?:\(min-width:_(\d+(?:\.\d+)?)px\))(?:_and_\(max-width:_(\d+(?:\.\d+)?)px\))?|\(max-width:_(\d+(?:\.\d+)?)px\))\]$/u;

function splitVariants(
  className: string,
): { readonly variants: readonly string[]; readonly utility: string } | undefined {
  let bracketDepth = 0;
  let escaped = false;
  let segmentStart = 0;
  const segments: string[] = [];

  for (let index = 0; index < className.length; index += 1) {
    const character = className[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
    } else if (character === '[') {
      bracketDepth += 1;
    } else if (character === ']') {
      if (bracketDepth === 0) return undefined;
      bracketDepth -= 1;
    } else if (character === ':' && bracketDepth === 0) {
      const segment = className.slice(segmentStart, index);
      if (segment.length === 0) return undefined;
      segments.push(segment);
      segmentStart = index + 1;
    }
  }

  if (escaped || bracketDepth !== 0) return undefined;

  const utility = className.slice(segmentStart);
  if (utility.length === 0) return undefined;
  return { variants: Object.freeze(segments), utility };
}

function activation(variants: readonly string[]): TailwindActivation {
  for (const variant of variants) {
    const match = variant.match(generatedMediaVariant);
    if (!match) continue;
    const min = match[1] === undefined ? undefined : Number(match[1]);
    const maxValue = match[2] ?? match[3];
    const max = maxValue === undefined ? undefined : Number(maxValue);
    if (min !== undefined && max !== undefined && min > max) continue;
    return { kind: 'media', range: { min, max } };
  }

  return { kind: 'base' };
}

function hasGeneratedMediaVariant(variants: readonly string[]): boolean {
  return variants.some(variant => variant.startsWith('[@media_screen_and_'));
}

function hasInternalDeclarationImportance(utility: string): boolean {
  const arbitraryStart = utility.indexOf('[');
  if (arbitraryStart < 0) return false;
  return analyzeTailwindArbitrarySyntax(utility.slice(arbitraryStart))?.important ?? false;
}

type CssAuthority = readonly string[] | 'unknown';

const textSizes = new Set(['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl']);
const shadowGeometryNames = new Set(['2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', 'none']);
const insetShadowGeometryNames = new Set(['2xs', 'xs', 'sm', 'none']);

interface BorderFamilyOwnership {
  readonly namespace: string;
  readonly width: readonly string[];
  readonly color: readonly string[];
}

const borderFamilies: readonly BorderFamilyOwnership[] = [
  {
    namespace: 'border-bs',
    width: ['border-block-start-style', 'border-block-start-width'],
    color: ['border-block-start-color'],
  },
  {
    namespace: 'border-be',
    width: ['border-block-end-style', 'border-block-end-width'],
    color: ['border-block-end-color'],
  },
  {
    namespace: 'border-x',
    width: ['border-inline-style', 'border-inline-width'],
    color: ['border-inline-color'],
  },
  {
    namespace: 'border-y',
    width: ['border-block-style', 'border-block-width'],
    color: ['border-block-color'],
  },
  {
    namespace: 'border-s',
    width: ['border-inline-start-style', 'border-inline-start-width'],
    color: ['border-inline-start-color'],
  },
  {
    namespace: 'border-e',
    width: ['border-inline-end-style', 'border-inline-end-width'],
    color: ['border-inline-end-color'],
  },
  { namespace: 'border-t', width: ['border-top-style', 'border-top-width'], color: ['border-top-color'] },
  { namespace: 'border-r', width: ['border-right-style', 'border-right-width'], color: ['border-right-color'] },
  { namespace: 'border-b', width: ['border-bottom-style', 'border-bottom-width'], color: ['border-bottom-color'] },
  { namespace: 'border-l', width: ['border-left-style', 'border-left-width'], color: ['border-left-color'] },
  { namespace: 'border', width: ['border-style', 'border-width'], color: ['border-color'] },
];

const recognizedTailwindAuthorityNamespaces = [
  '@container',
  'accent',
  'align',
  'animate',
  'appearance',
  'aspect',
  'auto-cols',
  'auto-rows',
  'backdrop',
  'backface',
  'basis',
  'bg',
  'block',
  'blur',
  'border',
  'box-decoration',
  'break',
  'brightness',
  'caption',
  'caret',
  'clear',
  'col',
  'columns',
  'contain',
  'content',
  'contrast',
  'decoration',
  'delay',
  'divide',
  'drop-shadow',
  'duration',
  'ease',
  'end',
  'field-sizing',
  'fill',
  'filter',
  'float',
  'font',
  'forced-color-adjust',
  'from',
  'gradient',
  'grid',
  'grid-flow',
  'grayscale',
  'hue-rotate',
  'hyphens',
  'indent',
  'inline',
  'inset-ring',
  'inset-shadow',
  'invert',
  'isolate',
  'isolation',
  'justify-items',
  'justify-self',
  'leading',
  'line-clamp',
  'list',
  'list-image',
  'mask',
  'max-block',
  'max-inline',
  'mbe',
  'mbs',
  'min-block',
  'min-inline',
  'mix-blend',
  'object',
  'opacity',
  'order',
  'origin',
  'outline',
  'overflow',
  'overscroll',
  'place-content',
  'place-items',
  'place-self',
  'placeholder',
  'pbe',
  'pbs',
  'perspective',
  'perspective-origin',
  'resize',
  'ring',
  'rotate',
  'rounded',
  'row',
  'saturate',
  'scale',
  'scheme',
  'scroll',
  'scrollbar',
  'select',
  'sepia',
  'shadow',
  'skew',
  'snap',
  'space',
  'start',
  'stroke',
  'tab',
  'table',
  'text',
  'to',
  'touch',
  'tracking',
  'transform',
  'transition',
  'translate',
  'underline-offset',
  'via',
  'whitespace',
  'will-change',
  'wrap',
  'z',
  'zoom',
] as const;

const recognizedTailwindAuthorityTokens = new Set([
  'antialiased',
  'border-collapse',
  'border-separate',
  'capitalize',
  'container',
  'diagonal-fractions',
  'italic',
  'line-through',
  'lining-nums',
  'lowercase',
  'no-underline',
  'normal-case',
  'normal-nums',
  'not-italic',
  'oldstyle-nums',
  'ordinal',
  'outline',
  'overline',
  'proportional-nums',
  'slashed-zero',
  'stacked-fractions',
  'subpixel-antialiased',
  'tabular-nums',
  'truncate',
  'underline',
  'uppercase',
]);

function isCanonicalInteger(value: string): boolean {
  return /^(?:0|[1-9]\d*)$/u.test(value);
}

function isCssVariableShorthand(value: string): boolean {
  return /^\(--[A-Za-z_][A-Za-z0-9_-]*\)$/u.test(value);
}

function borderCssAuthority(utility: string): CssAuthority | undefined {
  const family = borderFamilies.find(
    current => utility === current.namespace || utility.startsWith(`${current.namespace}-`),
  );
  if (family === undefined) return undefined;
  const suffix = utility === family.namespace ? '' : utility.slice(family.namespace.length + 1);
  if (suffix.length === 0 || isCanonicalInteger(suffix)) return family.width;
  if (family.namespace === 'border' && ['solid', 'dashed', 'dotted', 'double', 'hidden', 'none'].includes(suffix)) {
    return ['--tw-border-style', 'border-style'];
  }
  if (suffix.startsWith('[') && suffix.endsWith(']')) {
    const kind = tailwindArbitraryBorderKind(suffix);
    if (kind === 'border-width') return family.width;
    if (kind === 'border-color') return family.color;
    return 'unknown';
  }
  if (isCssVariableShorthand(suffix) || isPinnedTailwindColorToken(suffix)) return family.color;
  return 'unknown';
}

function shadowCssAuthority(utility: string): CssAuthority | undefined {
  if (utility === 'shadow') return ['--tw-shadow', 'box-shadow'];
  if (!utility.startsWith('shadow-')) return undefined;
  const suffix = utility.slice('shadow-'.length);
  if (suffix.startsWith('[') && suffix.endsWith(']')) {
    const kind = tailwindArbitraryShadowKind(suffix);
    if (kind === 'shadow-color') return ['--tw-shadow-color'];
    if (kind === 'shadow-geometry') return ['--tw-shadow', 'box-shadow'];
    return 'unknown';
  }
  if (isCssVariableShorthand(suffix) || shadowGeometryNames.has(suffix)) return ['--tw-shadow', 'box-shadow'];
  if (isPinnedTailwindColorToken(suffix)) return ['--tw-shadow-color'];
  return 'unknown';
}

function ringCssAuthority(utility: string): CssAuthority | undefined {
  if (utility === 'ring') return ['--tw-ring-shadow', 'box-shadow'];
  if (utility === 'ring-inset') return ['--tw-ring-inset'];
  if (!utility.startsWith('ring-')) return undefined;
  const suffix = utility.slice('ring-'.length);
  if (isCanonicalInteger(suffix)) return ['--tw-ring-shadow', 'box-shadow'];
  if (isPinnedTailwindColorToken(suffix)) return ['--tw-ring-color'];
  return 'unknown';
}

function insetShadowCssAuthority(utility: string): CssAuthority | undefined {
  if (utility === 'inset-shadow') return 'unknown';
  if (!utility.startsWith('inset-shadow-')) return undefined;
  const suffix = utility.slice('inset-shadow-'.length);
  if (insetShadowGeometryNames.has(suffix)) return ['--tw-inset-shadow', 'box-shadow'];
  if (suffix === 'initial' || isPinnedTailwindColorToken(suffix)) return ['--tw-inset-shadow-color'];
  return 'unknown';
}

function insetRingCssAuthority(utility: string): CssAuthority | undefined {
  if (utility === 'inset-ring') return ['--tw-inset-ring-shadow', 'box-shadow'];
  if (!utility.startsWith('inset-ring-')) return undefined;
  const suffix = utility.slice('inset-ring-'.length);
  if (isCanonicalInteger(suffix)) return ['--tw-inset-ring-shadow', 'box-shadow'];
  if (isPinnedTailwindColorToken(suffix)) return ['--tw-inset-ring-color'];
  return 'unknown';
}

function arbitraryBackgroundCssAuthority(value: string): CssAuthority {
  const arbitrary = value.match(/^\[([\s\S]+)\](?:\/[\s\S]+)?$/u)?.[1];
  if (arbitrary === undefined) return 'unknown';
  const property = tailwindArbitraryBackgroundKind(`[${arbitrary}]`);
  return property === 'unknown' ? property : [property];
}

function isRecognizedTailwindAuthority(utility: string): boolean {
  const normalized = utility.startsWith('-') ? utility.slice(1) : utility;
  return (
    recognizedTailwindAuthorityTokens.has(normalized) ||
    recognizedTailwindAuthorityNamespaces.some(
      namespace => normalized === namespace || normalized.startsWith(`${namespace}-`),
    )
  );
}

function cssProperties(utility: string): CssAuthority | undefined {
  const arbitraryProperty = utility.match(/^\[([^:]+):/u)?.[1];
  if (arbitraryProperty) return [arbitraryProperty];
  if (displayUtilities.has(utility)) return ['display'];
  if (/^flex-(?:row|row-reverse|col|col-reverse)$/u.test(utility)) return ['flex-direction'];
  if (/^flex-(?:wrap|wrap-reverse|nowrap)$/u.test(utility)) return ['flex-wrap'];
  if (/^flex-.+$/u.test(utility)) return ['flex'];
  if (/^grow(?:-.+)?$/u.test(utility)) return ['flex-grow'];
  if (/^shrink(?:-.+)?$/u.test(utility)) return ['flex-shrink'];
  if (/^basis-.+$/u.test(utility)) return ['flex-basis'];
  if (/^box-(?:border|content)$/u.test(utility)) return ['box-sizing'];
  if (/^justify-items-/u.test(utility)) return ['justify-items'];
  if (/^justify-self-/u.test(utility)) return ['justify-self'];
  if (/^justify-/u.test(utility)) return ['justify-content'];
  if (/^items-/u.test(utility)) return ['align-items'];
  if (utility === 'content-none') return ['--tw-content', 'content'];
  if (/^content-\[/u.test(utility)) return ['--tw-content', 'content'];
  if (/^content-/u.test(utility)) return ['align-content'];
  if (/^self-/u.test(utility)) return ['align-self'];
  if (/^gap-x-/u.test(utility)) return ['column-gap'];
  if (/^gap-y-/u.test(utility)) return ['row-gap'];
  if (/^gap-/u.test(utility)) return ['gap'];
  if (/^order-/u.test(utility)) return ['order'];
  if (/^-?m-/u.test(utility)) return ['margin'];
  if (/^-?mx-/u.test(utility)) return ['margin-inline'];
  if (/^-?my-/u.test(utility)) return ['margin-block'];
  if (/^-?mt-/u.test(utility)) return ['margin-top'];
  if (/^-?mr-/u.test(utility)) return ['margin-right'];
  if (/^-?mb-/u.test(utility)) return ['margin-bottom'];
  if (/^-?ml-/u.test(utility)) return ['margin-left'];
  if (/^-?ms-/u.test(utility)) return ['margin-inline-start'];
  if (/^-?me-/u.test(utility)) return ['margin-inline-end'];
  if (/^p-/u.test(utility)) return ['padding'];
  if (/^px-/u.test(utility)) return ['padding-inline'];
  if (/^py-/u.test(utility)) return ['padding-block'];
  if (/^pt-/u.test(utility)) return ['padding-top'];
  if (/^pr-/u.test(utility)) return ['padding-right'];
  if (/^pb-/u.test(utility)) return ['padding-bottom'];
  if (/^pl-/u.test(utility)) return ['padding-left'];
  if (/^ps-/u.test(utility)) return ['padding-inline-start'];
  if (/^pe-/u.test(utility)) return ['padding-inline-end'];
  if (/^size-/u.test(utility)) return ['width', 'height'];
  if (/^w-/u.test(utility)) return ['width'];
  if (/^h-/u.test(utility)) return ['height'];
  if (/^min-w-/u.test(utility)) return ['min-width'];
  if (/^min-h-/u.test(utility)) return ['min-height'];
  if (/^max-w-/u.test(utility)) return ['max-width'];
  if (/^max-h-/u.test(utility)) return ['max-height'];
  const textValue = utility.match(/^text-([\s\S]+)$/u)?.[1];
  const [textBaseValue] = textValue?.split('/') ?? [];
  if (textBaseValue !== undefined && textSizes.has(textBaseValue)) return ['font-size', 'line-height'];
  const arbitraryText = utility.match(/^text-(\[[\s\S]+\])(?:\/[^\s]+)?$/u)?.[1];
  if (arbitraryText !== undefined) {
    const kind = tailwindArbitraryTextKind(arbitraryText);
    if (kind === 'color') return ['color'];
    if (kind === 'font-size') return utility.includes(']/') ? ['font-size', 'line-height'] : ['font-size'];
    return 'unknown';
  }
  if (/^text-(?:left|right|center|justify|start|end)$/u.test(utility)) return ['text-align'];
  if (/^text-(?:wrap|nowrap|balance|pretty)$/u.test(utility)) return ['text-wrap'];
  if (/^text-(?:ellipsis|clip)$/u.test(utility)) return ['text-overflow'];
  if (textValue !== undefined && isPinnedTailwindColorToken(textValue)) return ['color'];
  if (/^text-/u.test(utility)) return 'unknown';
  if (/^bg-(?:auto|cover|contain)$/u.test(utility)) return ['background-size'];
  if (/^bg-(?:fixed|local|scroll)$/u.test(utility)) return ['background-attachment'];
  if (/^bg-clip-/u.test(utility)) return ['background-clip'];
  if (/^bg-origin-/u.test(utility)) return ['background-origin'];
  if (/^bg-(?:bottom|center|left|left-bottom|left-top|right|right-bottom|right-top|top)$/u.test(utility)) {
    return ['background-position'];
  }
  if (/^bg-(?:repeat|no-repeat|repeat-x|repeat-y|repeat-round|repeat-space)$/u.test(utility)) {
    return ['background-repeat'];
  }
  if (/^bg-blend-/u.test(utility)) return ['background-blend-mode'];
  if (utility === 'bg-none') return ['background-image'];
  const backgroundValue = utility.match(/^bg-([\s\S]+)$/u)?.[1];
  if (backgroundValue?.startsWith('[')) return arbitraryBackgroundCssAuthority(backgroundValue);
  if (isCssVariableShorthand(backgroundValue ?? '')) return 'unknown';
  if (backgroundValue !== undefined && isPinnedTailwindColorToken(backgroundValue)) return ['background-color'];
  if (/^bg-/u.test(utility)) return 'unknown';
  const borderAuthority = borderCssAuthority(utility);
  if (borderAuthority !== undefined) return borderAuthority;
  if (/^rounded(?:-|$)/u.test(utility)) return ['border-radius'];
  const shadowAuthority = shadowCssAuthority(utility);
  if (shadowAuthority !== undefined) return shadowAuthority;
  const ringAuthority = ringCssAuthority(utility);
  if (ringAuthority !== undefined) return ringAuthority;
  const insetShadowAuthority = insetShadowCssAuthority(utility);
  if (insetShadowAuthority !== undefined) return insetShadowAuthority;
  const insetRingAuthority = insetRingCssAuthority(utility);
  if (insetRingAuthority !== undefined) return insetRingAuthority;
  if (utility === 'truncate') return ['overflow', 'text-overflow', 'white-space'];
  if (/^opacity-/u.test(utility)) return ['opacity'];
  if (/^overflow(?:-|$)/u.test(utility)) return ['overflow'];
  if (['static', 'fixed', 'absolute', 'relative', 'sticky'].includes(utility)) return ['position'];
  if (/^-?inset-x-/u.test(utility)) return ['inset-inline'];
  if (/^-?inset-y-/u.test(utility)) return ['inset-block'];
  if (/^-?inset-/u.test(utility)) return ['inset'];
  if (/^-?top-/u.test(utility)) return ['top'];
  if (/^-?right-/u.test(utility)) return ['right'];
  if (/^-?bottom-/u.test(utility)) return ['bottom'];
  if (/^-?left-/u.test(utility)) return ['left'];
  if (/^-?rotate-z-/u.test(utility)) return ['--tw-rotate-z', 'transform'];
  if (/^-?rotate-(?:x|y)-/u.test(utility)) return 'unknown';
  if (/^-?rotate-/u.test(utility)) return ['rotate'];
  if (/^scale-(?:x|y|z)-/u.test(utility)) return 'unknown';
  if (/^scale-(?:\[|\()/u.test(utility)) return ['scale'];
  if (/^scale-/u.test(utility)) return ['--tw-scale-x', '--tw-scale-y', '--tw-scale-z', 'scale'];
  if (/^-?translate-z-/u.test(utility)) return 'unknown';
  if (/^-?translate-x-/u.test(utility)) return ['--tw-translate-x', 'translate'];
  if (/^-?translate-y-/u.test(utility)) return ['--tw-translate-y', 'translate'];
  if (/^-?translate-/u.test(utility)) return ['--tw-translate-x', '--tw-translate-y', 'translate'];
  if (utility === 'transition-none') return ['transition-property'];
  if (utility === 'transition-discrete' || utility === 'transition-normal') return ['transition-behavior'];
  if (/^transition(?:-|$)/u.test(utility)) {
    return ['transition-property', 'transition-timing-function', 'transition-duration'];
  }
  if (/^duration-/u.test(utility)) return ['--tw-duration', 'transition-duration'];
  if (/^delay-/u.test(utility)) return ['transition-delay'];
  if (/^ease-/u.test(utility)) return ['--tw-ease', 'transition-timing-function'];
  if (/^grid-cols(?:-|$)/u.test(utility)) return ['grid-template-columns'];
  if (/^auto-cols(?:-|$)/u.test(utility)) return ['grid-auto-columns'];
  if (/^grid-rows(?:-|$)/u.test(utility)) return ['grid-template-rows'];
  if (/^auto-rows(?:-|$)/u.test(utility)) return ['grid-auto-rows'];
  if (/^col-(?:span-|auto$)/u.test(utility)) return ['grid-column'];
  if (/^col-start-/u.test(utility)) return ['grid-column-start'];
  if (/^col-end-/u.test(utility)) return ['grid-column-end'];
  if (/^row-(?:span-|auto$)/u.test(utility)) return ['grid-row'];
  if (/^row-start-/u.test(utility)) return ['grid-row-start'];
  if (/^row-end-/u.test(utility)) return ['grid-row-end'];
  if (/^table-(?:auto|fixed)$/u.test(utility)) return ['table-layout'];
  if (/^list-(?:disc|decimal|none)$/u.test(utility)) return ['list-style-type'];
  if (/^list-(?:inside|outside)$/u.test(utility)) return ['list-style-position'];
  if (/^object-(?:contain|cover|fill|none|scale-down)$/u.test(utility)) return ['object-fit'];
  if (/^object-/u.test(utility)) return ['object-position'];
  if (/^cursor-/u.test(utility)) return ['cursor'];
  if (/^pointer-events-/u.test(utility)) return ['pointer-events'];
  if (['visible', 'invisible', 'collapse'].includes(utility)) return ['visibility'];
  if (utility === 'sr-only') {
    return ['position', 'width', 'height', 'padding', 'margin', 'overflow', 'clip-path', 'white-space', 'border-width'];
  }
  if (utility === 'not-sr-only') {
    return ['position', 'width', 'height', 'padding', 'margin', 'overflow', 'clip-path', 'white-space'];
  }
  return isRecognizedTailwindAuthority(utility) ? 'unknown' : undefined;
}

export function describeTailwindUtility(token: string): TailwindUtilityDescriptor | undefined {
  const split = splitVariants(token);
  if (split === undefined) return undefined;
  const { variants, utility: modifiedUtility } = split;
  const leadingImportant = modifiedUtility.startsWith('!');
  const trailingImportant = modifiedUtility.endsWith('!');
  if (leadingImportant && trailingImportant) return undefined;
  const utility = modifiedUtility.replace(/^!/u, '').replace(/!$/u, '');
  if (utility.length === 0) return undefined;
  const important = leadingImportant || trailingImportant || hasInternalDeclarationImportance(utility);
  const authority = cssProperties(utility);
  return {
    token,
    variants,
    utility,
    cssProperties: authority === undefined || authority === 'unknown' ? [] : authority,
    ...(authority === 'unknown' ? { hasUnknownCssAuthority: true } : {}),
    activation: activation(variants),
    hasGeneratedMediaVariant: hasGeneratedMediaVariant(variants),
    important,
  };
}

export function describeTailwindDisplay(token: string): TailwindDisplayUtility | undefined {
  const descriptor = describeTailwindUtility(token);
  if (descriptor === undefined) return undefined;
  if (!descriptor.cssProperties.includes('display')) return undefined;
  return {
    token: descriptor.token,
    utility: descriptor.utility,
    activation: descriptor.activation,
    important: descriptor.important,
  };
}

function activationsIntersect(left: TailwindActivation, right: TailwindActivation): boolean {
  return left.kind === 'base' || right.kind === 'base' || mediaRangesIntersect(left.range, right.range);
}

export function findTailwindClassConflicts(
  existingClassNames: readonly string[],
  generatedClassNames: readonly string[],
): ReadonlySet<string> {
  const generatedTokens = new Set(generatedClassNames);
  const existing = existingClassNames
    .filter(token => !generatedTokens.has(token))
    .map(describeTailwindUtility)
    .filter(descriptor => descriptor !== undefined);
  const conflicts = new Set<string>();

  for (const generated of generatedClassNames
    .map(describeTailwindUtility)
    .filter(descriptor => descriptor !== undefined)) {
    const generatedProperties = generated.cssProperties;
    if (generatedProperties.length === 0) continue;
    if (
      existing.some(
        current =>
          activationsIntersect(current.activation, generated.activation) &&
          (current.hasUnknownCssAuthority === true ||
            generated.hasUnknownCssAuthority === true ||
            current.cssProperties.some(currentProperty =>
              generatedProperties.some(generatedProperty => cssPropertiesOverlap(currentProperty, generatedProperty)),
            )),
      )
    ) {
      conflicts.add(generated.token);
    }
  }

  return conflicts;
}

export function hasTailwindClassConflict(
  existingClassNames: readonly string[],
  generatedClassNames: readonly string[],
): boolean {
  return findTailwindClassConflicts(existingClassNames, generatedClassNames).size > 0;
}
