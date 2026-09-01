import { describeTailwindUtility, type TailwindUtilityDescriptor } from '../tailwind-class-conflict';

export type TailwindCandidateClassification =
  | { readonly status: 'verified'; readonly descriptor: TailwindUtilityDescriptor }
  | { readonly status: 'unverified'; readonly reason: string };

type PropertyGroup = string | ((value: string) => string | undefined);

interface NamespaceRule {
  readonly namespace: string;
  readonly propertyGroup: PropertyGroup;
  readonly negative?: boolean;
  readonly accepts: (value: string) => boolean;
  readonly acceptsNegative?: (value: string) => boolean;
}

const exactTokenRegistry = Object.freeze([
  ['inline', 'display'],
  ['block', 'display'],
  ['inline-block', 'display'],
  ['flow-root', 'display'],
  ['flex', 'display'],
  ['inline-flex', 'display'],
  ['grid', 'display'],
  ['inline-grid', 'display'],
  ['contents', 'display'],
  ['table', 'display'],
  ['inline-table', 'display'],
  ['list-item', 'display'],
  ['hidden', 'display'],
  ['static', 'position'],
  ['fixed', 'position'],
  ['absolute', 'position'],
  ['relative', 'position'],
  ['sticky', 'position'],
  ['border', 'border'],
  ['shadow', 'box-shadow'],
  ['transition', 'transition'],
  ['visible', 'visibility'],
  ['invisible', 'visibility'],
  ['collapse', 'visibility'],
  ['sr-only', 'accessibility'],
  ['not-sr-only', 'accessibility'],
] as const);

const defaultColorNames = Object.freeze([
  'inherit',
  'current',
  'transparent',
  'black',
  'white',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
  'slate',
  'gray',
  'zinc',
  'neutral',
  'stone',
] as const);
const defaultColorShades = Object.freeze(['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']);
const textSizes = Object.freeze([
  'xs',
  'sm',
  'base',
  'lg',
  'xl',
  '2xl',
  '3xl',
  '4xl',
  '5xl',
  '6xl',
  '7xl',
  '8xl',
  '9xl',
]);

function isNumber(value: string): boolean {
  return /^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value);
}

function isInteger(value: string): boolean {
  return /^(?:0|[1-9]\d*)$/u.test(value);
}

function isPercentage(value: string): boolean {
  if (!isNumber(value)) return false;
  const number = Number(value);
  return number >= 0 && number <= 100;
}

function hasValidArbitrarySyntax(value: string): boolean {
  if (!value.startsWith('[') || !value.endsWith(']')) return false;
  const inner = value.slice(1, -1);
  if (inner.trim().length === 0) return false;

  const closingByOpening = new Map([
    ['(', ')'],
    ['[', ']'],
    ['{', '}'],
  ]);
  const stack: string[] = [];
  let quote: '"' | "'" | undefined;
  let escaped = false;
  let typedSeparator = -1;

  for (let index = 0; index < inner.length; index += 1) {
    const character = inner[index];
    if (character === undefined) return false;
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined || codePoint <= 0x1f || codePoint === 0x7f) return false;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (quote !== undefined) {
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    const closing = closingByOpening.get(character);
    if (closing !== undefined) {
      stack.push(closing);
      continue;
    }
    if ([')', ']', '}'].includes(character) && stack.pop() !== character) return false;
    if (character === ';') return false;
    if (character === ':' && stack.length === 0 && typedSeparator < 0) typedSeparator = index;
  }

  if (escaped || quote !== undefined || stack.length !== 0) return false;
  if (typedSeparator >= 0) {
    return inner.slice(0, typedSeparator).trim().length > 0 && inner.slice(typedSeparator + 1).trim().length > 0;
  }
  return true;
}

function isCssVariableValue(value: string): boolean {
  return /^\(--[A-Za-z_][A-Za-z0-9_-]*\)$/u.test(value);
}

function isArbitraryOrVariable(value: string): boolean {
  return hasValidArbitrarySyntax(value) || isCssVariableValue(value);
}

function isFraction(value: string): boolean {
  const [numerator, denominator, remainder] = value.split('/');
  return remainder === undefined && isNumber(numerator ?? '') && /^[1-9]\d*$/u.test(denominator ?? '');
}

function isSpacing(value: string): boolean {
  return isNumber(value) || value === 'px' || isArbitraryOrVariable(value);
}

function isMargin(value: string): boolean {
  return isSpacing(value) || value === 'auto';
}

function isFractionalSpacing(value: string): boolean {
  return isSpacing(value) || isFraction(value) || value === 'full';
}

function isInset(value: string): boolean {
  return isFractionalSpacing(value) || value === 'auto';
}

function isDimension(value: string): boolean {
  return (
    isFractionalSpacing(value) ||
    value === 'auto' ||
    ['screen', 'dvh', 'dvw', 'lvh', 'lvw', 'svh', 'svw', 'min', 'max', 'fit'].includes(value)
  );
}

function isWidth(value: string): boolean {
  return isDimension(value) || /^(?:3xs|2xs|xs|sm|md|lg|xl|[2-7]xl)$/u.test(value);
}

function isArbitraryColor(value: string): boolean {
  if (!hasValidArbitrarySyntax(value)) return false;
  const color = value.slice(1, -1);
  return /^(?:color:|#|(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|light-dark|color-mix|var)\()/u.test(color);
}

function isBackgroundImage(value: string): boolean {
  if (!hasValidArbitrarySyntax(value)) return false;
  const image = value.slice(1, -1);
  return /^(?:image:|url\(|(?:linear|radial|conic)-gradient\()/u.test(image);
}

function isColor(value: string): boolean {
  const [color, opacity, remainder] = value.split('/');
  if (remainder !== undefined) return false;

  const isDefault =
    ['inherit', 'current', 'transparent', 'black', 'white'].includes(color ?? '') ||
    (defaultColorNames.includes((color?.split('-')[0] ?? '') as (typeof defaultColorNames)[number]) &&
      defaultColorShades.includes((color?.split('-')[1] ?? '') as (typeof defaultColorShades)[number]) &&
      color?.split('-').length === 2);
  if (!isDefault && !isArbitraryColor(color ?? '') && !isCssVariableValue(color ?? '')) return false;
  return opacity === undefined || isPercentage(opacity) || isArbitraryOrVariable(opacity);
}

function textPropertyGroup(value: string): string | undefined {
  const [size, lineHeight, remainder] = value.split('/');
  const hasVerifiedLineHeight =
    remainder === undefined && (lineHeight === undefined || isNumber(lineHeight) || isArbitraryOrVariable(lineHeight));
  if (textSizes.includes((size ?? '') as (typeof textSizes)[number])) {
    return hasVerifiedLineHeight ? 'font-size' : undefined;
  }
  if (/^\[(?:length:)?\d/u.test(size ?? '')) return hasVerifiedLineHeight ? 'font-size' : undefined;
  if (/^\[color:/u.test(value)) return 'color';
  if (isColor(value)) return 'color';
  return undefined;
}

function acceptsText(value: string): boolean {
  return textPropertyGroup(value) !== undefined;
}

function oneOf(values: readonly string[]): (value: string) => boolean {
  return value => values.includes(value);
}

const namespaceRegistry: readonly NamespaceRule[] = Object.freeze([
  {
    namespace: 'items',
    propertyGroup: 'align-items',
    accepts: oneOf(['start', 'end', 'center', 'baseline', 'stretch']),
  },
  { namespace: 'gap', propertyGroup: 'gap', accepts: value => isNumber(value) || isArbitraryOrVariable(value) },
  { namespace: 'gap-x', propertyGroup: 'gap', accepts: value => isNumber(value) || isArbitraryOrVariable(value) },
  { namespace: 'gap-y', propertyGroup: 'gap', accepts: value => isNumber(value) || isArbitraryOrVariable(value) },
  { namespace: 'm', propertyGroup: 'margin', negative: true, accepts: isMargin, acceptsNegative: isSpacing },
  { namespace: 'mx', propertyGroup: 'margin', negative: true, accepts: isMargin, acceptsNegative: isSpacing },
  { namespace: 'my', propertyGroup: 'margin', negative: true, accepts: isMargin, acceptsNegative: isSpacing },
  { namespace: 'mt', propertyGroup: 'margin', negative: true, accepts: isMargin, acceptsNegative: isSpacing },
  { namespace: 'mr', propertyGroup: 'margin', negative: true, accepts: isMargin, acceptsNegative: isSpacing },
  { namespace: 'mb', propertyGroup: 'margin', negative: true, accepts: isMargin, acceptsNegative: isSpacing },
  { namespace: 'ml', propertyGroup: 'margin', negative: true, accepts: isMargin, acceptsNegative: isSpacing },
  { namespace: 'ms', propertyGroup: 'margin', negative: true, accepts: isMargin, acceptsNegative: isSpacing },
  { namespace: 'me', propertyGroup: 'margin', negative: true, accepts: isMargin, acceptsNegative: isSpacing },
  {
    namespace: 'p',
    propertyGroup: 'padding',
    accepts: value => isNumber(value) || value === 'px' || isArbitraryOrVariable(value),
  },
  {
    namespace: 'px',
    propertyGroup: 'padding',
    accepts: value => isNumber(value) || value === 'px' || isArbitraryOrVariable(value),
  },
  {
    namespace: 'py',
    propertyGroup: 'padding',
    accepts: value => isNumber(value) || value === 'px' || isArbitraryOrVariable(value),
  },
  {
    namespace: 'pt',
    propertyGroup: 'padding',
    accepts: value => isNumber(value) || value === 'px' || isArbitraryOrVariable(value),
  },
  {
    namespace: 'pr',
    propertyGroup: 'padding',
    accepts: value => isNumber(value) || value === 'px' || isArbitraryOrVariable(value),
  },
  {
    namespace: 'pb',
    propertyGroup: 'padding',
    accepts: value => isNumber(value) || value === 'px' || isArbitraryOrVariable(value),
  },
  {
    namespace: 'pl',
    propertyGroup: 'padding',
    accepts: value => isNumber(value) || value === 'px' || isArbitraryOrVariable(value),
  },
  {
    namespace: 'ps',
    propertyGroup: 'padding',
    accepts: value => isNumber(value) || value === 'px' || isArbitraryOrVariable(value),
  },
  {
    namespace: 'pe',
    propertyGroup: 'padding',
    accepts: value => isNumber(value) || value === 'px' || isArbitraryOrVariable(value),
  },
  { namespace: 'w', propertyGroup: 'width', accepts: isWidth },
  { namespace: 'h', propertyGroup: 'height', accepts: isDimension },
  { namespace: 'min-w', propertyGroup: 'min-width', accepts: isWidth },
  { namespace: 'min-h', propertyGroup: 'min-height', accepts: isDimension },
  { namespace: 'max-w', propertyGroup: 'max-width', accepts: value => value !== 'auto' && isWidth(value) },
  { namespace: 'max-h', propertyGroup: 'max-height', accepts: value => value !== 'auto' && isDimension(value) },
  { namespace: 'text', propertyGroup: textPropertyGroup, accepts: acceptsText },
  { namespace: 'bg', propertyGroup: 'background-color', accepts: isColor },
  { namespace: 'bg', propertyGroup: 'background-image', accepts: isBackgroundImage },
  {
    namespace: 'border',
    propertyGroup: 'border',
    accepts: value =>
      isInteger(value) ||
      isColor(value) ||
      oneOf(['solid', 'dashed', 'dotted', 'double', 'hidden', 'none'])(value) ||
      isArbitraryOrVariable(value),
  },
  {
    namespace: 'rounded',
    propertyGroup: 'border-radius',
    accepts: value =>
      oneOf(['none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', 'full'])(value) || isArbitraryOrVariable(value),
  },
  {
    namespace: 'shadow',
    propertyGroup: 'box-shadow',
    accepts: value =>
      oneOf(['2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', 'none'])(value) || isArbitraryOrVariable(value),
  },
  {
    namespace: 'opacity',
    propertyGroup: 'opacity',
    accepts: value => isPercentage(value) || isArbitraryOrVariable(value),
  },
  { namespace: 'overflow', propertyGroup: 'overflow', accepts: oneOf(['auto', 'hidden', 'clip', 'visible', 'scroll']) },
  {
    namespace: 'inset',
    propertyGroup: 'inset',
    negative: true,
    accepts: isInset,
    acceptsNegative: isFractionalSpacing,
  },
  {
    namespace: 'inset-x',
    propertyGroup: 'inset',
    negative: true,
    accepts: isInset,
    acceptsNegative: isFractionalSpacing,
  },
  {
    namespace: 'inset-y',
    propertyGroup: 'inset',
    negative: true,
    accepts: isInset,
    acceptsNegative: isFractionalSpacing,
  },
  { namespace: 'top', propertyGroup: 'inset', negative: true, accepts: isInset, acceptsNegative: isFractionalSpacing },
  {
    namespace: 'right',
    propertyGroup: 'inset',
    negative: true,
    accepts: isInset,
    acceptsNegative: isFractionalSpacing,
  },
  {
    namespace: 'bottom',
    propertyGroup: 'inset',
    negative: true,
    accepts: isInset,
    acceptsNegative: isFractionalSpacing,
  },
  { namespace: 'left', propertyGroup: 'inset', negative: true, accepts: isInset, acceptsNegative: isFractionalSpacing },
  {
    namespace: 'rotate',
    propertyGroup: 'transform',
    negative: true,
    accepts: value => isInteger(value) || isArbitraryOrVariable(value),
  },
  {
    namespace: 'scale',
    propertyGroup: 'transform',
    accepts: value => isInteger(value) || isArbitraryOrVariable(value),
  },
  { namespace: 'translate', propertyGroup: 'transform', negative: true, accepts: isFractionalSpacing },
  {
    namespace: 'transition',
    propertyGroup: 'transition',
    accepts: oneOf(['all', 'colors', 'opacity', 'shadow', 'transform', 'none']),
  },
  {
    namespace: 'grid-cols',
    propertyGroup: 'grid-template-columns',
    accepts: value => /^[1-9]\d*$/u.test(value) || oneOf(['none', 'subgrid'])(value) || isArbitraryOrVariable(value),
  },
  { namespace: 'table', propertyGroup: 'table-layout', accepts: oneOf(['auto', 'fixed']) },
  {
    namespace: 'list',
    propertyGroup: value => (['disc', 'decimal', 'none'].includes(value) ? 'list-style-type' : 'list-style-position'),
    accepts: oneOf(['disc', 'decimal', 'none', 'inside', 'outside']),
  },
  {
    namespace: 'object',
    propertyGroup: value =>
      ['contain', 'cover', 'fill', 'none', 'scale-down'].includes(value) ? 'object-fit' : 'object-position',
    accepts: oneOf([
      'contain',
      'cover',
      'fill',
      'none',
      'scale-down',
      'bottom',
      'center',
      'left',
      'left-bottom',
      'left-top',
      'right',
      'right-bottom',
      'right-top',
      'top',
    ]),
  },
  {
    namespace: 'cursor',
    propertyGroup: 'cursor',
    accepts: oneOf([
      'auto',
      'default',
      'pointer',
      'wait',
      'text',
      'move',
      'help',
      'not-allowed',
      'none',
      'context-menu',
      'progress',
      'cell',
      'crosshair',
      'vertical-text',
      'alias',
      'copy',
      'no-drop',
      'grab',
      'grabbing',
      'all-scroll',
      'col-resize',
      'row-resize',
      'n-resize',
      'e-resize',
      's-resize',
      'w-resize',
      'ne-resize',
      'nw-resize',
      'se-resize',
      'sw-resize',
      'ew-resize',
      'ns-resize',
      'nesw-resize',
      'nwse-resize',
      'zoom-in',
      'zoom-out',
    ]),
  },
  { namespace: 'pointer-events', propertyGroup: 'pointer-events', accepts: oneOf(['auto', 'none']) },
]);

const exactVariantRegistry = Object.freeze([
  'hover',
  'focus',
  'focus-within',
  'focus-visible',
  'active',
  'visited',
  'target',
  'first',
  'last',
  'only',
  'odd',
  'even',
  'disabled',
  'enabled',
  'checked',
  'indeterminate',
  'required',
  'valid',
  'invalid',
  'before',
  'after',
  'placeholder',
  'selection',
  'dark',
  'motion-safe',
  'motion-reduce',
  'contrast-more',
  'contrast-less',
  'portrait',
  'landscape',
  'print',
  'sm',
  'md',
  'lg',
  'xl',
  '2xl',
] as const);

function variantIsVerified(variant: string): boolean {
  if (exactVariantRegistry.includes(variant as (typeof exactVariantRegistry)[number])) return true;
  return hasValidArbitrarySyntax(variant);
}

function parseArbitraryProperty(utility: string): string | undefined {
  if (!hasValidArbitrarySyntax(utility)) return undefined;
  const inner = utility.slice(1, -1);
  const separator = inner.indexOf(':');
  if (separator <= 0) return undefined;

  const property = inner.slice(0, separator);
  const value = inner.slice(separator + 1);
  if (!/^(?:--[A-Za-z_][A-Za-z0-9_-]*|[A-Za-z][A-Za-z0-9-]*)$/u.test(property)) return undefined;
  if (value.trim().length === 0) return undefined;
  return property;
}

function registryPropertyGroup(utility: string): string | undefined {
  const exact = exactTokenRegistry.find(([token]) => token === utility);
  if (exact !== undefined) return exact[1];

  const negative = utility.startsWith('-');
  const value = negative ? utility.slice(1) : utility;
  for (const rule of namespaceRegistry) {
    const separator = `${rule.namespace}-`;
    if (!value.startsWith(separator)) continue;
    const suffix = value.slice(separator.length);
    if (suffix.length === 0) continue;
    if (negative) {
      if (rule.negative !== true || !(rule.acceptsNegative ?? rule.accepts)(suffix)) continue;
    } else if (!rule.accepts(suffix)) continue;
    return typeof rule.propertyGroup === 'string' ? rule.propertyGroup : rule.propertyGroup(suffix);
  }

  return undefined;
}

export class TailwindCandidateClassifier {
  classify(token: string): TailwindCandidateClassification {
    if (token.includes('\\')) {
      return { status: 'unverified', reason: 'Source escapes make the Tailwind candidate ambiguous.' };
    }

    const descriptor = describeTailwindUtility(token);
    if (descriptor === undefined) {
      return { status: 'unverified', reason: 'The Tailwind candidate has malformed variant or bracket structure.' };
    }
    if (descriptor.hasGeneratedMediaVariant) {
      return {
        status: 'unverified',
        reason: 'Generated exact-media variants cannot be supplied as source candidates.',
      };
    }
    if (!descriptor.variants.every(variantIsVerified)) {
      return { status: 'unverified', reason: 'The Tailwind candidate contains an unverified variant.' };
    }

    const arbitraryProperty = parseArbitraryProperty(descriptor.utility);
    const group =
      arbitraryProperty === undefined ? registryPropertyGroup(descriptor.utility) : descriptor.propertyGroup;
    if (group === undefined || descriptor.propertyGroup !== group) {
      return { status: 'unverified', reason: 'The utility is not in the compiler-proven built-in registry.' };
    }

    return { status: 'verified', descriptor };
  }
}
