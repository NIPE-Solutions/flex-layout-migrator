import { mediaRangesIntersect, type MediaRange } from '../../breakpoint/breakpoint-catalog';

type TailwindActivation = { readonly kind: 'base' } | { readonly kind: 'media'; readonly range: MediaRange };

interface TailwindUtilityDescriptor {
  readonly token: string;
  readonly propertyGroup?: string;
  readonly activation: TailwindActivation;
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

function splitVariants(className: string): { readonly variants?: string; readonly utility: string } {
  let bracketDepth = 0;
  let escaped = false;
  let lastVariantSeparator = -1;

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
      bracketDepth = Math.max(0, bracketDepth - 1);
    } else if (character === ':' && bracketDepth === 0) {
      lastVariantSeparator = index;
    }
  }

  return lastVariantSeparator < 0
    ? { utility: className }
    : {
        variants: className.slice(0, lastVariantSeparator),
        utility: className.slice(lastVariantSeparator + 1),
      };
}

function activation(variants: string | undefined): TailwindActivation {
  if (variants === undefined) return { kind: 'base' };

  const match = variants.match(generatedMediaVariant);
  if (!match) return { kind: 'base' };
  const min = match[1] === undefined ? undefined : Number(match[1]);
  const maxValue = match[2] ?? match[3];
  const max = maxValue === undefined ? undefined : Number(maxValue);
  if (min !== undefined && max !== undefined && min > max) return { kind: 'base' };
  return { kind: 'media', range: { min, max } };
}

function propertyGroup(utility: string): string | undefined {
  const value = utility.replace(/^!/u, '').replace(/!$/u, '');
  const arbitraryProperty = value.match(/^\[([^:]+):/u)?.[1];
  if (arbitraryProperty) {
    if (['flex', 'flex-grow', 'flex-shrink', 'flex-basis'].includes(arbitraryProperty)) return 'flex-sizing';
    return arbitraryProperty;
  }
  if (displayUtilities.has(value)) return 'display';
  if (/^flex-(?:row|row-reverse|col|col-reverse)$/u.test(value)) return 'flex-direction';
  if (/^flex-(?:wrap|wrap-reverse|nowrap)$/u.test(value)) return 'flex-wrap';
  if (/^(?:flex-.+|grow(?:-.+)?|shrink(?:-.+)?|basis-.+)$/u.test(value)) return 'flex-sizing';
  if (/^box-(?:border|content)$/u.test(value)) return 'box-sizing';
  if (/^justify-/u.test(value)) return 'justify-content';
  if (/^items-/u.test(value)) return 'align-items';
  if (/^content-/u.test(value)) return 'align-content';
  if (/^self-/u.test(value)) return 'align-self';
  if (/^(?:gap|gap-x|gap-y)-/u.test(value)) return 'gap';
  if (/^order-/u.test(value)) return 'order';
  if (/^-?m(?:[trblxyse])?-/u.test(value)) return 'margin';
  if (/^(?:size|w)-/u.test(value)) return 'width';
  if (/^(?:size|h)-/u.test(value)) return 'height';
  if (/^min-w-/u.test(value)) return 'min-width';
  if (/^min-h-/u.test(value)) return 'min-height';
  if (/^max-w-/u.test(value)) return 'max-width';
  if (/^max-h-/u.test(value)) return 'max-height';
  return undefined;
}

function describe(token: string): TailwindUtilityDescriptor {
  const { variants, utility } = splitVariants(token);
  return { token, propertyGroup: propertyGroup(utility), activation: activation(variants) };
}

function activationsIntersect(left: TailwindActivation, right: TailwindActivation): boolean {
  return left.kind === 'base' || right.kind === 'base' || mediaRangesIntersect(left.range, right.range);
}

export function findTailwindClassConflicts(
  existingClassNames: readonly string[],
  generatedClassNames: readonly string[],
): ReadonlySet<string> {
  const generatedTokens = new Set(generatedClassNames);
  const existing = existingClassNames.filter(token => !generatedTokens.has(token)).map(describe);
  const conflicts = new Set<string>();

  for (const generated of generatedClassNames.map(describe)) {
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
