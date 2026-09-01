import { mediaRangesIntersect, type MediaRange } from '../../breakpoint/breakpoint-catalog';
import { analyzeTailwindArbitrarySyntax } from './tailwind-arbitrary-syntax';
import { cssPropertiesOverlap } from './extended/css-property-ownership';
import {
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

function cssProperties(utility: string): readonly string[] {
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
  if (/^justify-/u.test(utility)) return ['justify-content'];
  if (/^items-/u.test(utility)) return ['align-items'];
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
  if (/^text-(?:xs|sm|base|lg|xl|[2-9]xl)(?:\/|$)/u.test(utility)) return ['font-size', 'line-height'];
  const arbitraryText = utility.match(/^text-(\[[\s\S]+\])(?:\/[^\s]+)?$/u)?.[1];
  if (arbitraryText !== undefined) {
    if (tailwindArbitraryTextKind(arbitraryText) === 'color') return ['color'];
    return utility.includes(']/') ? ['font-size', 'line-height'] : ['font-size'];
  }
  if (/^text-/u.test(utility)) return ['color'];
  if (/^bg-\[(?:image:|url\(|(?:linear|radial|conic)-gradient\()/u.test(utility)) return ['background-image'];
  if (/^bg-/u.test(utility)) return ['background-color'];
  const arbitraryBorder = utility.match(/^border-(\[[\s\S]+\])$/u)?.[1];
  if (
    utility === 'border' ||
    /^border-\d/u.test(utility) ||
    (arbitraryBorder !== undefined && tailwindArbitraryBorderKind(arbitraryBorder) === 'border-width')
  ) {
    return ['border-style', 'border-width'];
  }
  if (/^border-(?:solid|dashed|dotted|double|hidden|none)$/u.test(utility)) {
    return ['--tw-border-style', 'border-style'];
  }
  if (/^border-/u.test(utility)) return ['border-color'];
  if (/^rounded(?:-|$)/u.test(utility)) return ['border-radius'];
  const arbitraryShadow = utility.match(/^shadow-(\[[\s\S]+\])$/u)?.[1];
  if (arbitraryShadow !== undefined) {
    return tailwindArbitraryShadowKind(arbitraryShadow) === 'shadow-color'
      ? ['--tw-shadow-color']
      : ['--tw-shadow', 'box-shadow'];
  }
  if (/^shadow(?:-|$)/u.test(utility)) return ['--tw-shadow', 'box-shadow'];
  if (/^ring(?:-|$)/u.test(utility)) return ['--tw-ring-shadow', 'box-shadow'];
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
  if (/^-?rotate-/u.test(utility)) return ['rotate'];
  if (/^scale-(?:\[|\()/u.test(utility)) return ['scale'];
  if (/^scale-/u.test(utility)) return ['--tw-scale-x', '--tw-scale-y', '--tw-scale-z', 'scale'];
  if (/^-?translate-x-/u.test(utility)) return ['--tw-translate-x', 'translate'];
  if (/^-?translate-y-/u.test(utility)) return ['--tw-translate-y', 'translate'];
  if (/^-?translate-/u.test(utility)) return ['--tw-translate-x', '--tw-translate-y', 'translate'];
  if (utility === 'transition-none') return ['transition-property'];
  if (/^transition(?:-|$)/u.test(utility)) {
    return ['transition-property', 'transition-timing-function', 'transition-duration'];
  }
  if (/^duration-/u.test(utility)) return ['transition-duration'];
  if (/^delay-/u.test(utility)) return ['transition-delay'];
  if (/^ease-/u.test(utility)) return ['transition-timing-function'];
  if (/^(?:grid-cols|auto-cols)(?:-|$)/u.test(utility)) return ['grid-template-columns'];
  if (/^(?:grid-rows|auto-rows)(?:-|$)/u.test(utility)) return ['grid-template-rows'];
  if (/^col(?:-|$)/u.test(utility)) return ['grid-column-start', 'grid-column-end'];
  if (/^row(?:-|$)/u.test(utility)) return ['grid-row-start', 'grid-row-end'];
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
  return [];
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
  return {
    token,
    variants,
    utility,
    cssProperties: cssProperties(utility),
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
          current.cssProperties.some(currentProperty =>
            generatedProperties.some(generatedProperty => cssPropertiesOverlap(currentProperty, generatedProperty)),
          ),
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
