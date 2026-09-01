type CssPropertyOwnership =
  | { readonly kind: 'universal' }
  | { readonly kind: 'known'; readonly longhands: ReadonlySet<string> }
  | { readonly kind: 'unknown'; readonly property: string }
  | { readonly kind: 'custom'; readonly property: string };

const edges = ['top', 'right', 'bottom', 'left'] as const;

function edgeLonghands(prefix: string, suffix?: string): readonly string[] {
  return edges.map(edge => `${prefix}-${edge}${suffix === undefined ? '' : `-${suffix}`}`);
}

const physicalBorderWidths = edgeLonghands('border', 'width');
const physicalBorderStyles = edgeLonghands('border', 'style');
const physicalBorderColors = edgeLonghands('border', 'color');
const logicalBorderWidths = [
  'border-inline-start-width',
  'border-inline-end-width',
  'border-block-start-width',
  'border-block-end-width',
] as const;
const logicalBorderStyles = [
  'border-inline-start-style',
  'border-inline-end-style',
  'border-block-start-style',
  'border-block-end-style',
] as const;
const logicalBorderColors = [
  'border-inline-start-color',
  'border-inline-end-color',
  'border-block-start-color',
  'border-block-end-color',
] as const;
const borderWidths = [...physicalBorderWidths, ...logicalBorderWidths];
const borderStyles = [...physicalBorderStyles, ...logicalBorderStyles];
const borderColors = [...physicalBorderColors, ...logicalBorderColors];
const borderImage = [
  'border-image-source',
  'border-image-slice',
  'border-image-width',
  'border-image-outset',
  'border-image-repeat',
] as const;

const shorthandLonghands = new Map<string, readonly string[]>([
  [
    'margin',
    [...edgeLonghands('margin'), 'margin-inline-start', 'margin-inline-end', 'margin-block-start', 'margin-block-end'],
  ],
  ['margin-inline', ['margin-inline-start', 'margin-inline-end', 'margin-left', 'margin-right']],
  ['margin-block', ['margin-block-start', 'margin-block-end', 'margin-top', 'margin-bottom']],
  ['margin-inline-start', ['margin-inline-start', 'margin-left', 'margin-right']],
  ['margin-inline-end', ['margin-inline-end', 'margin-left', 'margin-right']],
  [
    'padding',
    [
      ...edgeLonghands('padding'),
      'padding-inline-start',
      'padding-inline-end',
      'padding-block-start',
      'padding-block-end',
    ],
  ],
  ['padding-inline', ['padding-inline-start', 'padding-inline-end', 'padding-left', 'padding-right']],
  ['padding-block', ['padding-block-start', 'padding-block-end', 'padding-top', 'padding-bottom']],
  ['padding-inline-start', ['padding-inline-start', 'padding-left', 'padding-right']],
  ['padding-inline-end', ['padding-inline-end', 'padding-left', 'padding-right']],
  ['inset', [...edges, 'inset-inline-start', 'inset-inline-end', 'inset-block-start', 'inset-block-end']],
  ['inset-inline', ['inset-inline-start', 'inset-inline-end', 'left', 'right']],
  ['inset-block', ['inset-block-start', 'inset-block-end', 'top', 'bottom']],
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
  [
    'border-inline-width',
    ['border-inline-start-width', 'border-inline-end-width', 'border-left-width', 'border-right-width'],
  ],
  ['border-block-width', ['border-block-start-width', 'border-block-end-width', ...physicalBorderWidths]],
  ['border-inline-start-width', ['border-inline-start-width', 'border-left-width', 'border-right-width']],
  ['border-inline-end-width', ['border-inline-end-width', 'border-left-width', 'border-right-width']],
  ['border-block-start-width', ['border-block-start-width', ...physicalBorderWidths]],
  ['border-block-end-width', ['border-block-end-width', ...physicalBorderWidths]],
  ['border-style', borderStyles],
  [
    'border-inline-style',
    ['border-inline-start-style', 'border-inline-end-style', 'border-left-style', 'border-right-style'],
  ],
  ['border-block-style', ['border-block-start-style', 'border-block-end-style', ...physicalBorderStyles]],
  ['border-inline-start-style', ['border-inline-start-style', 'border-left-style', 'border-right-style']],
  ['border-inline-end-style', ['border-inline-end-style', 'border-left-style', 'border-right-style']],
  ['border-block-start-style', ['border-block-start-style', ...physicalBorderStyles]],
  ['border-block-end-style', ['border-block-end-style', ...physicalBorderStyles]],
  ['border-color', borderColors],
  [
    'border-inline-color',
    ['border-inline-start-color', 'border-inline-end-color', 'border-left-color', 'border-right-color'],
  ],
  ['border-block-color', ['border-block-start-color', 'border-block-end-color', ...physicalBorderColors]],
  ['border-inline-start-color', ['border-inline-start-color', 'border-left-color', 'border-right-color']],
  ['border-inline-end-color', ['border-inline-end-color', 'border-left-color', 'border-right-color']],
  ['border-block-start-color', ['border-block-start-color', ...physicalBorderColors]],
  ['border-block-end-color', ['border-block-end-color', ...physicalBorderColors]],
  [
    'border-radius',
    [
      'border-top-left-radius',
      'border-top-right-radius',
      'border-bottom-right-radius',
      'border-bottom-left-radius',
      'border-start-start-radius',
      'border-start-end-radius',
      'border-end-start-radius',
      'border-end-end-radius',
    ],
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
  ['grid-column', ['grid-column-start', 'grid-column-end']],
  ['grid-row', ['grid-row-start', 'grid-row-end']],
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
  'justify-items',
  'justify-self',
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  'color',
  'text-align',
  'text-wrap',
  'background-blend-mode',
  'background-size',
  'background-attachment',
  'background-clip',
  'background-origin',
  'background-position',
  'background-repeat',
  'box-shadow',
  'opacity',
  'position',
  'transform',
  'translate',
  'rotate',
  'scale',
  'transform-origin',
  'order',
  'grid-column-start',
  'grid-column-end',
  'grid-row-start',
  'grid-row-end',
  'grid-auto-columns',
  'grid-auto-rows',
  'table-layout',
  'object-fit',
  'object-position',
  'cursor',
  'pointer-events',
  'visibility',
  'clip',
  'clip-path',
  'white-space',
  'text-overflow',
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
