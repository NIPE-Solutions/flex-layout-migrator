import { describeTailwindUtility, type TailwindUtilityDescriptor } from '../tailwind-class-conflict';
import { hasValidTailwindArbitrarySyntax } from '../tailwind-arbitrary-syntax';
import { isByteExactHtmlClassToken } from '../../../edit/html-attribute-value';
import {
  isConservativelyAdmittedBorderWidth,
  isConservativelyAdmittedTextLength,
} from './tailwind-arbitrary-value-ownership';

export type TailwindCandidateClassification =
  | { readonly status: 'verified'; readonly descriptor: TailwindUtilityDescriptor }
  | { readonly status: 'unverified'; readonly reason: string };

type CssProperties = readonly string[] | ((value: string) => readonly string[] | undefined);

interface NamespaceRule {
  readonly namespace: string;
  readonly cssProperties: CssProperties;
  readonly negative?: boolean;
  readonly accepts: (value: string) => boolean;
  readonly acceptsNegative?: (value: string) => boolean;
}

const exactTokenRegistry = Object.freeze([
  ['inline', ['display']],
  ['block', ['display']],
  ['inline-block', ['display']],
  ['flow-root', ['display']],
  ['flex', ['display']],
  ['inline-flex', ['display']],
  ['grid', ['display']],
  ['inline-grid', ['display']],
  ['contents', ['display']],
  ['table', ['display']],
  ['inline-table', ['display']],
  ['list-item', ['display']],
  ['hidden', ['display']],
  ['flex-row', ['flex-direction']],
  ['flex-row-reverse', ['flex-direction']],
  ['flex-col', ['flex-direction']],
  ['flex-col-reverse', ['flex-direction']],
  ['flex-wrap', ['flex-wrap']],
  ['flex-wrap-reverse', ['flex-wrap']],
  ['flex-nowrap', ['flex-wrap']],
  ['static', ['position']],
  ['fixed', ['position']],
  ['absolute', ['position']],
  ['relative', ['position']],
  ['sticky', ['position']],
  ['border', ['border-style', 'border-width']],
  ['shadow', ['--tw-shadow', 'box-shadow']],
  ['transition', ['transition-property', 'transition-timing-function', 'transition-duration']],
  ['visible', ['visibility']],
  ['invisible', ['visibility']],
  ['collapse', ['visibility']],
  [
    'sr-only',
    ['position', 'width', 'height', 'padding', 'margin', 'overflow', 'clip-path', 'white-space', 'border-width'],
  ],
  ['not-sr-only', ['position', 'width', 'height', 'padding', 'margin', 'overflow', 'clip-path', 'white-space']],
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
  return hasValidTailwindArbitrarySyntax(value);
}

function hasCompilerMeaningfulArbitraryValue(value: string): boolean {
  if (!hasValidArbitrarySyntax(value)) return false;

  const payload = value
    .slice(1, -1)
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/^[a-z][a-z-]*:/iu, '')
    .replace(/[\s_()[\]{}'"`]/gu, '');
  return payload.length > 0;
}

function isCssVariableValue(value: string): boolean {
  return /^\(--[A-Za-z_][A-Za-z0-9_-]*\)$/u.test(value);
}

function isArbitraryOrVariable(value: string): boolean {
  return hasCompilerMeaningfulArbitraryValue(value) || isCssVariableValue(value);
}

function isFraction(value: string): boolean {
  const [numerator, denominator, remainder] = value.split('/');
  return remainder === undefined && isInteger(numerator ?? '') && /^[1-9]\d*$/u.test(denominator ?? '');
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
  if (!hasCompilerMeaningfulArbitraryValue(value)) return false;
  const color = value.slice(1, -1);
  return /^(?:color:|#|(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|light-dark|color-mix|var)\()/u.test(color);
}

function isBackgroundImage(value: string): boolean {
  if (!hasCompilerMeaningfulArbitraryValue(value)) return false;
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

function textCssProperties(value: string): readonly string[] | undefined {
  const [size, lineHeight, remainder] = value.split('/');
  const hasVerifiedLineHeight =
    remainder === undefined && (lineHeight === undefined || isNumber(lineHeight) || isArbitraryOrVariable(lineHeight));
  if (textSizes.includes((size ?? '') as (typeof textSizes)[number])) {
    return hasVerifiedLineHeight ? ['font-size', 'line-height'] : undefined;
  }
  const arbitrarySize = size ?? '';
  const hasUnambiguousArbitrarySize =
    hasCompilerMeaningfulArbitraryValue(arbitrarySize) && isConservativelyAdmittedTextLength(arbitrarySize);
  if (hasUnambiguousArbitrarySize) {
    if (!hasVerifiedLineHeight) return undefined;
    return lineHeight === undefined ? ['font-size'] : ['font-size', 'line-height'];
  }
  if (hasCompilerMeaningfulArbitraryValue(value) && /^\[color:[\s\S]+\]$/u.test(value)) return ['color'];
  if (isColor(value)) return ['color'];
  return undefined;
}

function acceptsText(value: string): boolean {
  return textCssProperties(value) !== undefined;
}

function borderCssProperties(value: string): readonly string[] | undefined {
  if (isInteger(value) || (hasCompilerMeaningfulArbitraryValue(value) && isConservativelyAdmittedBorderWidth(value))) {
    return ['border-style', 'border-width'];
  }
  if (oneOf(['solid', 'dashed', 'dotted', 'double', 'hidden', 'none'])(value)) {
    return ['--tw-border-style', 'border-style'];
  }
  if (isColor(value) || isCssVariableValue(value) || /^\[(?:color:|var\()/u.test(value)) {
    return ['border-color'];
  }
  return undefined;
}

function transitionCssProperties(value: string): readonly string[] {
  return value === 'none'
    ? ['transition-property']
    : ['transition-property', 'transition-timing-function', 'transition-duration'];
}

function scaleCssProperties(value: string): readonly string[] | undefined {
  if (isInteger(value)) return ['--tw-scale-x', '--tw-scale-y', '--tw-scale-z', 'scale'];
  return isArbitraryOrVariable(value) ? ['scale'] : undefined;
}

function oneOf(values: readonly string[]): (value: string) => boolean {
  return value => values.includes(value);
}

const namespaceRegistry: readonly NamespaceRule[] = Object.freeze([
  {
    namespace: 'items',
    cssProperties: ['align-items'],
    accepts: oneOf(['start', 'end', 'center', 'baseline', 'stretch']),
  },
  { namespace: 'gap', cssProperties: ['gap'], accepts: value => isNumber(value) || isArbitraryOrVariable(value) },
  {
    namespace: 'gap-x',
    cssProperties: ['column-gap'],
    accepts: value => isNumber(value) || isArbitraryOrVariable(value),
  },
  { namespace: 'gap-y', cssProperties: ['row-gap'], accepts: value => isNumber(value) || isArbitraryOrVariable(value) },
  { namespace: 'm', cssProperties: ['margin'], negative: true, accepts: isMargin, acceptsNegative: isSpacing },
  { namespace: 'mx', cssProperties: ['margin-inline'], negative: true, accepts: isMargin, acceptsNegative: isSpacing },
  { namespace: 'my', cssProperties: ['margin-block'], negative: true, accepts: isMargin, acceptsNegative: isSpacing },
  { namespace: 'mt', cssProperties: ['margin-top'], negative: true, accepts: isMargin, acceptsNegative: isSpacing },
  { namespace: 'mr', cssProperties: ['margin-right'], negative: true, accepts: isMargin, acceptsNegative: isSpacing },
  { namespace: 'mb', cssProperties: ['margin-bottom'], negative: true, accepts: isMargin, acceptsNegative: isSpacing },
  { namespace: 'ml', cssProperties: ['margin-left'], negative: true, accepts: isMargin, acceptsNegative: isSpacing },
  {
    namespace: 'ms',
    cssProperties: ['margin-inline-start'],
    negative: true,
    accepts: isMargin,
    acceptsNegative: isSpacing,
  },
  {
    namespace: 'me',
    cssProperties: ['margin-inline-end'],
    negative: true,
    accepts: isMargin,
    acceptsNegative: isSpacing,
  },
  {
    namespace: 'p',
    cssProperties: ['padding'],
    accepts: value => isNumber(value) || value === 'px' || isArbitraryOrVariable(value),
  },
  {
    namespace: 'px',
    cssProperties: ['padding-inline'],
    accepts: value => isNumber(value) || value === 'px' || isArbitraryOrVariable(value),
  },
  {
    namespace: 'py',
    cssProperties: ['padding-block'],
    accepts: value => isNumber(value) || value === 'px' || isArbitraryOrVariable(value),
  },
  {
    namespace: 'pt',
    cssProperties: ['padding-top'],
    accepts: value => isNumber(value) || value === 'px' || isArbitraryOrVariable(value),
  },
  {
    namespace: 'pr',
    cssProperties: ['padding-right'],
    accepts: value => isNumber(value) || value === 'px' || isArbitraryOrVariable(value),
  },
  {
    namespace: 'pb',
    cssProperties: ['padding-bottom'],
    accepts: value => isNumber(value) || value === 'px' || isArbitraryOrVariable(value),
  },
  {
    namespace: 'pl',
    cssProperties: ['padding-left'],
    accepts: value => isNumber(value) || value === 'px' || isArbitraryOrVariable(value),
  },
  {
    namespace: 'ps',
    cssProperties: ['padding-inline-start'],
    accepts: value => isNumber(value) || value === 'px' || isArbitraryOrVariable(value),
  },
  {
    namespace: 'pe',
    cssProperties: ['padding-inline-end'],
    accepts: value => isNumber(value) || value === 'px' || isArbitraryOrVariable(value),
  },
  { namespace: 'w', cssProperties: ['width'], accepts: isWidth },
  { namespace: 'h', cssProperties: ['height'], accepts: isDimension },
  { namespace: 'min-w', cssProperties: ['min-width'], accepts: isWidth },
  { namespace: 'min-h', cssProperties: ['min-height'], accepts: isDimension },
  { namespace: 'max-w', cssProperties: ['max-width'], accepts: value => value !== 'auto' && isWidth(value) },
  { namespace: 'max-h', cssProperties: ['max-height'], accepts: value => value !== 'auto' && isDimension(value) },
  { namespace: 'text', cssProperties: textCssProperties, accepts: acceptsText },
  { namespace: 'bg', cssProperties: ['background-color'], accepts: isColor },
  { namespace: 'bg', cssProperties: ['background-image'], accepts: isBackgroundImage },
  {
    namespace: 'border',
    cssProperties: borderCssProperties,
    accepts: value => borderCssProperties(value) !== undefined,
  },
  {
    namespace: 'rounded',
    cssProperties: ['border-radius'],
    accepts: value =>
      oneOf(['none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', 'full'])(value) || isArbitraryOrVariable(value),
  },
  {
    namespace: 'shadow',
    cssProperties: ['--tw-shadow', 'box-shadow'],
    accepts: value => oneOf(['2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', 'none'])(value) || isCssVariableValue(value),
  },
  {
    namespace: 'opacity',
    cssProperties: ['opacity'],
    accepts: value => isPercentage(value) || isArbitraryOrVariable(value),
  },
  {
    namespace: 'overflow',
    cssProperties: ['overflow'],
    accepts: oneOf(['auto', 'hidden', 'clip', 'visible', 'scroll']),
  },
  {
    namespace: 'inset',
    cssProperties: ['inset'],
    negative: true,
    accepts: isInset,
    acceptsNegative: isFractionalSpacing,
  },
  {
    namespace: 'inset-x',
    cssProperties: ['inset-inline'],
    negative: true,
    accepts: isInset,
    acceptsNegative: isFractionalSpacing,
  },
  {
    namespace: 'inset-y',
    cssProperties: ['inset-block'],
    negative: true,
    accepts: isInset,
    acceptsNegative: isFractionalSpacing,
  },
  { namespace: 'top', cssProperties: ['top'], negative: true, accepts: isInset, acceptsNegative: isFractionalSpacing },
  {
    namespace: 'right',
    cssProperties: ['right'],
    negative: true,
    accepts: isInset,
    acceptsNegative: isFractionalSpacing,
  },
  {
    namespace: 'bottom',
    cssProperties: ['bottom'],
    negative: true,
    accepts: isInset,
    acceptsNegative: isFractionalSpacing,
  },
  {
    namespace: 'left',
    cssProperties: ['left'],
    negative: true,
    accepts: isInset,
    acceptsNegative: isFractionalSpacing,
  },
  {
    namespace: 'rotate',
    cssProperties: ['rotate'],
    negative: true,
    accepts: value => isInteger(value) || isArbitraryOrVariable(value),
  },
  {
    namespace: 'scale',
    cssProperties: scaleCssProperties,
    accepts: value => scaleCssProperties(value) !== undefined,
  },
  {
    namespace: 'translate',
    cssProperties: ['--tw-translate-x', '--tw-translate-y', 'translate'],
    negative: true,
    accepts: isFractionalSpacing,
  },
  {
    namespace: 'transition',
    cssProperties: transitionCssProperties,
    accepts: oneOf(['all', 'colors', 'opacity', 'shadow', 'transform', 'none']),
  },
  {
    namespace: 'grid-cols',
    cssProperties: ['grid-template-columns'],
    accepts: value => /^[1-9]\d*$/u.test(value) || oneOf(['none', 'subgrid'])(value) || isArbitraryOrVariable(value),
  },
  { namespace: 'table', cssProperties: ['table-layout'], accepts: oneOf(['auto', 'fixed']) },
  {
    namespace: 'list',
    cssProperties: value => [['disc', 'decimal', 'none'].includes(value) ? 'list-style-type' : 'list-style-position'],
    accepts: oneOf(['disc', 'decimal', 'none', 'inside', 'outside']),
  },
  {
    namespace: 'object',
    cssProperties: value => [
      ['contain', 'cover', 'fill', 'none', 'scale-down'].includes(value) ? 'object-fit' : 'object-position',
    ],
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
    cssProperties: ['cursor'],
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
  { namespace: 'pointer-events', cssProperties: ['pointer-events'], accepts: oneOf(['auto', 'none']) },
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
  return exactVariantRegistry.includes(variant as (typeof exactVariantRegistry)[number]);
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

function registryCssProperties(utility: string): readonly string[] | undefined {
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
    return typeof rule.cssProperties === 'function' ? rule.cssProperties(suffix) : rule.cssProperties;
  }

  return undefined;
}

export class TailwindCandidateClassifier {
  classify(token: string): TailwindCandidateClassification {
    if (!isByteExactHtmlClassToken(token)) {
      return {
        status: 'unverified',
        reason: 'The decoded candidate cannot be emitted as the same raw HTML source token.',
      };
    }

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
      return {
        status: 'unverified',
        reason: 'The Tailwind candidate contains an unverified or target-changing variant.',
      };
    }

    const arbitraryProperty = parseArbitraryProperty(descriptor.utility);
    const cssProperties =
      arbitraryProperty === undefined ? registryCssProperties(descriptor.utility) : [arbitraryProperty];
    if (cssProperties === undefined || cssProperties.length === 0) {
      return { status: 'unverified', reason: 'The utility is not in the compiler-proven built-in registry.' };
    }

    return { status: 'verified', descriptor: { ...descriptor, cssProperties } };
  }
}
