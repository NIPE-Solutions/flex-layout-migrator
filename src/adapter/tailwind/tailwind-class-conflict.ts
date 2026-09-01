import { mediaRangesIntersect, type MediaRange } from '../../breakpoint/breakpoint-catalog';
import { analyzeTailwindArbitrarySyntax } from './tailwind-arbitrary-syntax';

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
  readonly propertyGroup?: string;
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

function propertyGroup(utility: string): string | undefined {
  const arbitraryProperty = utility.match(/^\[([^:]+):/u)?.[1];
  if (arbitraryProperty) {
    if (['flex', 'flex-grow', 'flex-shrink', 'flex-basis'].includes(arbitraryProperty)) return 'flex-sizing';
    if (/^margin(?:-|$)/u.test(arbitraryProperty)) return 'margin';
    if (/^padding(?:-|$)/u.test(arbitraryProperty)) return 'padding';
    if (/^border(?:-|$)/u.test(arbitraryProperty)) return 'border';
    if (['inset', 'top', 'right', 'bottom', 'left'].includes(arbitraryProperty)) return 'inset';
    if (['transform', 'translate', 'rotate', 'scale'].includes(arbitraryProperty)) return 'transform';
    if (/^transition(?:-|$)/u.test(arbitraryProperty)) return 'transition';
    if (/^overflow(?:-|$)/u.test(arbitraryProperty)) return 'overflow';
    return arbitraryProperty;
  }
  if (displayUtilities.has(utility)) return 'display';
  if (/^flex-(?:row|row-reverse|col|col-reverse)$/u.test(utility)) return 'flex-direction';
  if (/^flex-(?:wrap|wrap-reverse|nowrap)$/u.test(utility)) return 'flex-wrap';
  if (/^(?:flex-.+|grow(?:-.+)?|shrink(?:-.+)?|basis-.+)$/u.test(utility)) return 'flex-sizing';
  if (/^box-(?:border|content)$/u.test(utility)) return 'box-sizing';
  if (/^justify-/u.test(utility)) return 'justify-content';
  if (/^items-/u.test(utility)) return 'align-items';
  if (/^content-/u.test(utility)) return 'align-content';
  if (/^self-/u.test(utility)) return 'align-self';
  if (/^(?:gap|gap-x|gap-y)-/u.test(utility)) return 'gap';
  if (/^order-/u.test(utility)) return 'order';
  if (/^-?m(?:[trblxyse])?-/u.test(utility)) return 'margin';
  if (/^p(?:[trblxyse])?-/u.test(utility)) return 'padding';
  if (/^(?:size|w)-/u.test(utility)) return 'width';
  if (/^(?:size|h)-/u.test(utility)) return 'height';
  if (/^min-w-/u.test(utility)) return 'min-width';
  if (/^min-h-/u.test(utility)) return 'min-height';
  if (/^max-w-/u.test(utility)) return 'max-width';
  if (/^max-h-/u.test(utility)) return 'max-height';
  if (/^text-(?:xs|sm|base|lg|xl|[2-9]xl|\[length:|\[\d)/u.test(utility)) return 'font-size';
  if (/^text-/u.test(utility)) return 'color';
  if (/^bg-\[(?:image:|url\(|(?:linear|radial|conic)-gradient\()/u.test(utility)) return 'background-image';
  if (/^bg-/u.test(utility)) return 'background-color';
  if (/^(?:border|divide|ring|outline)(?:-|$)/u.test(utility)) return 'border';
  if (/^rounded(?:-|$)/u.test(utility)) return 'border-radius';
  if (/^shadow(?:-|$)/u.test(utility)) return 'box-shadow';
  if (/^opacity-/u.test(utility)) return 'opacity';
  if (/^overflow(?:-|$)/u.test(utility)) return 'overflow';
  if (['static', 'fixed', 'absolute', 'relative', 'sticky'].includes(utility)) return 'position';
  if (/^-?(?:inset|top|right|bottom|left)(?:-|$)/u.test(utility)) return 'inset';
  if (/^(?:rotate|scale|translate|skew|transform)(?:-|$)/u.test(utility)) return 'transform';
  if (/^(?:transition|duration|delay|ease)(?:-|$)/u.test(utility)) return 'transition';
  if (/^(?:grid-cols|auto-cols)(?:-|$)/u.test(utility)) return 'grid-template-columns';
  if (/^(?:grid-rows|auto-rows)(?:-|$)/u.test(utility)) return 'grid-template-rows';
  if (/^(?:col|row)(?:-|$)/u.test(utility)) return 'grid-placement';
  if (/^table-(?:auto|fixed)$/u.test(utility)) return 'table-layout';
  if (/^list-(?:disc|decimal|none)$/u.test(utility)) return 'list-style-type';
  if (/^list-(?:inside|outside)$/u.test(utility)) return 'list-style-position';
  if (/^object-(?:contain|cover|fill|none|scale-down)$/u.test(utility)) return 'object-fit';
  if (/^object-/u.test(utility)) return 'object-position';
  if (/^cursor-/u.test(utility)) return 'cursor';
  if (/^pointer-events-/u.test(utility)) return 'pointer-events';
  if (['visible', 'invisible', 'collapse'].includes(utility)) return 'visibility';
  if (['sr-only', 'not-sr-only'].includes(utility)) return 'accessibility';
  return undefined;
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
    propertyGroup: propertyGroup(utility),
    activation: activation(variants),
    hasGeneratedMediaVariant: hasGeneratedMediaVariant(variants),
    important,
  };
}

export function describeTailwindDisplay(token: string): TailwindDisplayUtility | undefined {
  const descriptor = describeTailwindUtility(token);
  if (descriptor === undefined) return undefined;
  if (descriptor.propertyGroup !== 'display') return undefined;
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
    if (generated.propertyGroup === undefined) continue;
    if (
      existing.some(
        current =>
          current.propertyGroup === generated.propertyGroup &&
          activationsIntersect(current.activation, generated.activation),
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
