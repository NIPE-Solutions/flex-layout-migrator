type CssPropertyOwnership =
  | { readonly kind: 'universal' }
  | { readonly kind: 'known'; readonly longhands: ReadonlySet<string> }
  | { readonly kind: 'unknown'; readonly property: string }
  | { readonly kind: 'custom'; readonly property: string };

const edges = ['top', 'right', 'bottom', 'left'] as const;

function edgeLonghands(prefix: string, suffix?: string): readonly string[] {
  return edges.map(edge => `${prefix}-${edge}${suffix === undefined ? '' : `-${suffix}`}`);
}

const borderWidths = edgeLonghands('border', 'width');
const borderStyles = edgeLonghands('border', 'style');
const borderColors = edgeLonghands('border', 'color');
const borderImage = [
  'border-image-source',
  'border-image-slice',
  'border-image-width',
  'border-image-outset',
  'border-image-repeat',
] as const;

const shorthandLonghands = new Map<string, readonly string[]>([
  ['margin', edgeLonghands('margin')],
  ['padding', edgeLonghands('padding')],
  ['inset', [...edges]],
  ['gap', ['row-gap', 'column-gap']],
  [
    'font',
    [
      'font-style',
      'font-variant',
      'font-weight',
      'font-stretch',
      'font-size',
      'line-height',
      'font-family',
      'font-size-adjust',
      'font-kerning',
      'font-optical-sizing',
      'font-feature-settings',
      'font-variation-settings',
      'font-language-override',
    ],
  ],
  [
    'background',
    [
      'background-image',
      'background-position',
      'background-size',
      'background-repeat',
      'background-origin',
      'background-clip',
      'background-attachment',
      'background-color',
    ],
  ],
  ['border', [...borderWidths, ...borderStyles, ...borderColors, ...borderImage]],
  ['border-top', ['border-top-width', 'border-top-style', 'border-top-color']],
  ['border-right', ['border-right-width', 'border-right-style', 'border-right-color']],
  ['border-bottom', ['border-bottom-width', 'border-bottom-style', 'border-bottom-color']],
  ['border-left', ['border-left-width', 'border-left-style', 'border-left-color']],
  ['border-width', borderWidths],
  ['border-style', borderStyles],
  ['border-color', borderColors],
  [
    'border-radius',
    ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'],
  ],
  ['border-image', borderImage],
  ['overflow', ['overflow-x', 'overflow-y']],
  ['flex', ['flex-grow', 'flex-shrink', 'flex-basis']],
  [
    'transition',
    [
      'transition-property',
      'transition-duration',
      'transition-timing-function',
      'transition-delay',
      'transition-behavior',
    ],
  ],
  ['grid-template', ['grid-template-rows', 'grid-template-columns', 'grid-template-areas']],
  [
    'grid',
    [
      'grid-template-rows',
      'grid-template-columns',
      'grid-template-areas',
      'grid-auto-rows',
      'grid-auto-columns',
      'grid-auto-flow',
    ],
  ],
  ['list-style', ['list-style-type', 'list-style-position', 'list-style-image']],
  ['columns', ['column-width', 'column-count']],
  ['column-rule', ['column-rule-width', 'column-rule-style', 'column-rule-color']],
  ['outline', ['outline-width', 'outline-style', 'outline-color']],
  [
    'text-decoration',
    ['text-decoration-line', 'text-decoration-style', 'text-decoration-color', 'text-decoration-thickness'],
  ],
  ['place-content', ['align-content', 'justify-content']],
  ['place-items', ['align-items', 'justify-items']],
  ['place-self', ['align-self', 'justify-self']],
  [
    'animation',
    [
      'animation-name',
      'animation-duration',
      'animation-timing-function',
      'animation-delay',
      'animation-iteration-count',
      'animation-direction',
      'animation-fill-mode',
      'animation-play-state',
      'animation-timeline',
      'animation-range-start',
      'animation-range-end',
    ],
  ],
]);

const knownIndependentProperties = new Set([
  ...[...shorthandLonghands.values()].flatMap(longhands => [...longhands]),
  'display',
  'box-sizing',
  'flex-direction',
  'flex-wrap',
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  'color',
  'background-blend-mode',
  'box-shadow',
  'opacity',
  'position',
  'transform',
  'transform-origin',
  'order',
  'grid-column-start',
  'grid-column-end',
  'grid-row-start',
  'grid-row-end',
  'table-layout',
  'object-fit',
  'object-position',
  'cursor',
  'pointer-events',
  'visibility',
  'clip',
  'clip-path',
  'white-space',
  'content',
  'z-index',
]);

function ownership(property: string): CssPropertyOwnership {
  if (property.startsWith('--')) return { kind: 'custom', property };

  const normalized = property.toLowerCase();
  if (normalized === 'all') return { kind: 'universal' };
  const expanded = shorthandLonghands.get(normalized);
  if (expanded !== undefined) return { kind: 'known', longhands: new Set(expanded) };
  if (knownIndependentProperties.has(normalized)) {
    return { kind: 'known', longhands: new Set([normalized]) };
  }
  return { kind: 'unknown', property: normalized };
}

export function cssPropertiesOverlap(leftProperty: string, rightProperty: string): boolean {
  const left = ownership(leftProperty);
  const right = ownership(rightProperty);

  if (left.kind === 'custom' || right.kind === 'custom') {
    return left.kind === 'custom' && right.kind === 'custom' && left.property === right.property;
  }
  if (left.kind === 'universal' || right.kind === 'universal') return true;
  if (left.kind === 'unknown' || right.kind === 'unknown') return true;
  return [...left.longhands].some(longhand => right.longhands.has(longhand));
}

export function cssPropertyOwnershipCovers(ownerProperty: string, targetProperty: string): boolean {
  const owner = ownership(ownerProperty);
  const target = ownership(targetProperty);

  if (owner.kind === 'custom' || target.kind === 'custom') {
    return owner.kind === 'custom' && target.kind === 'custom' && owner.property === target.property;
  }
  if (owner.kind === 'universal') return true;
  if (target.kind === 'universal') return false;
  if (owner.kind === 'unknown' || target.kind === 'unknown') {
    return owner.kind === 'unknown' && target.kind === 'unknown' && owner.property === target.property;
  }
  return [...target.longhands].every(longhand => owner.longhands.has(longhand));
}
