const cssLengthUnits = new Set([
  'cm',
  'mm',
  'Q',
  'in',
  'pc',
  'pt',
  'px',
  'em',
  'ex',
  'ch',
  'rem',
  'lh',
  'rlh',
  'vw',
  'vh',
  'vmin',
  'vmax',
  'vb',
  'vi',
  'svw',
  'svh',
  'lvw',
  'lvh',
  'dvw',
  'dvh',
  'cqw',
  'cqh',
  'cqi',
  'cqb',
  'cqmin',
  'cqmax',
]);

const cssColorKeywords = new Set(
  `black silver gray white maroon red purple fuchsia green lime olive yellow navy blue teal aqua aliceblue
  antiquewhite aquamarine azure beige bisque blanchedalmond blueviolet brown burlywood cadetblue chartreuse
  chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey
  darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue
  darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick
  floralwhite forestgreen gainsboro ghostwhite gold goldenrod greenyellow grey honeydew hotpink indianred indigo ivory
  khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray
  lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue
  lightyellow limegreen linen magenta mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen
  mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin
  navajowhite oldlace olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip
  peachpuff peru pink plum powderblue rebeccapurple rosybrown royalblue saddlebrown salmon sandybrown seagreen
  seashell sienna skyblue slateblue slategray slategrey snow springgreen steelblue tan thistle tomato turquoise violet
  wheat whitesmoke yellowgreen transparent currentcolor canvas canvastext linktext visitedtext activetext buttonface
  buttontext buttonborder field fieldtext highlight highlighttext selecteditem selecteditemtext mark marktext graytext
  accentcolor accentcolortext`
    .split(/\s+/u)
    .filter(Boolean),
);

const absoluteFontSizes = new Set([
  'xx-small',
  'x-small',
  'small',
  'medium',
  'large',
  'x-large',
  'xx-large',
  'xxx-large',
]);
const relativeFontSizes = new Set(['larger', 'smaller']);
const defaultTailwindColorNames = new Set([
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
]);
const defaultTailwindColorShades = new Set([
  '50',
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
  '700',
  '800',
  '900',
  '950',
]);

const unsignedDecimal = /^(?:(?:\d+(?:\.\d+)?)|(?:\.\d+))$/u;
const signedCssNumber = /^[+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?$/iu;
const mathFunction = /(?:calc|min|max|clamp|mod|rem|sin|cos|tan|asin|acos|atan|atan2|pow|sqrt|hypot|log|exp|round)\(/u;
const colorFunction = /^(?:rgba?|hsla?|hwb|color|(?:ok)?(?:lab|lch)|light-dark|color-mix|--alpha)\(/iu;

interface ArbitraryValue {
  readonly hint?: string;
  readonly payload: string;
}

function arbitraryValue(value: string): ArbitraryValue | undefined {
  if (!value.startsWith('[') || !value.endsWith(']')) return undefined;
  const inner = value.slice(1, -1);
  const hinted = inner.match(/^([a-z][a-z-]*):([\s\S]+)$/u);
  return hinted === null ? { payload: inner } : { hint: hinted[1], payload: hinted[2] ?? '' };
}

function splitNumberAndUnit(value: string): { readonly number: string; readonly unit?: string } | undefined {
  const match = value.match(/^((?:(?:\d+(?:\.\d+)?)|(?:\.\d+)))([a-zA-Z%]+)?$/u);
  if (match === null) return undefined;
  return { number: match[1] ?? '', unit: match[2] };
}

function isUnsignedLength(value: string, allowPercentage: boolean, allowUnitless: boolean): boolean {
  const parsed = splitNumberAndUnit(value);
  if (parsed === undefined || !unsignedDecimal.test(parsed.number)) return false;
  if (parsed.unit === undefined) return allowUnitless;
  return (allowPercentage && parsed.unit === '%') || cssLengthUnits.has(parsed.unit);
}

export function isConservativelyAdmittedTextLength(value: string): boolean {
  const arbitrary = arbitraryValue(value);
  if (arbitrary === undefined) return false;
  if (arbitrary.hint !== undefined && arbitrary.hint !== 'length') return false;
  if (arbitrary.hint === 'length' && arbitrary.payload === '0') return true;
  return isUnsignedLength(arbitrary.payload, true, false);
}

export function isConservativelyAdmittedBorderWidth(value: string): boolean {
  const arbitrary = arbitraryValue(value);
  if (arbitrary === undefined) return false;
  if (arbitrary.hint !== undefined && arbitrary.hint !== 'length') return false;
  if (arbitrary.hint === 'length' && arbitrary.payload === '0') return true;
  return isUnsignedLength(arbitrary.payload, false, arbitrary.hint === undefined);
}

function isTailwindLength(value: string): boolean {
  if (/^--spacing\(/iu.test(value)) return true;
  if (mathFunction.test(value)) return true;
  const match = value.match(/^([+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?)([a-zA-Z]+)$/iu);
  return match !== null && signedCssNumber.test(match[1] ?? '') && cssLengthUnits.has(match[2] ?? '');
}

function isTailwindPercentage(value: string): boolean {
  return /^[+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?%$/iu.test(value) || mathFunction.test(value);
}

function decodedInferenceValue(value: string): string | undefined {
  if (value.includes('\\')) return undefined;
  return value.replaceAll('_', ' ');
}

type TailwindDataType = 'color' | 'length' | 'percentage' | 'absolute-size' | 'relative-size' | 'line-width';

function inferTailwindDataType(value: string, types: readonly TailwindDataType[]): TailwindDataType | undefined {
  if (value.startsWith('var(')) return undefined;

  for (const type of types) {
    if (
      type === 'color' &&
      (value.startsWith('#') || colorFunction.test(value) || cssColorKeywords.has(value.toLowerCase()))
    ) {
      return type;
    }
    if (type === 'length' && isTailwindLength(value)) return type;
    if (type === 'percentage' && isTailwindPercentage(value)) return type;
    if (type === 'absolute-size' && absoluteFontSizes.has(value)) return type;
    if (type === 'relative-size' && relativeFontSizes.has(value)) return type;
    if (type === 'line-width') {
      const parts = value.split(' ');
      if (
        parts.length > 0 &&
        parts.every(
          part =>
            part.length > 0 &&
            (isTailwindLength(part) || signedCssNumber.test(part) || ['thin', 'medium', 'thick'].includes(part)),
        )
      ) {
        return type;
      }
    }
  }
  return undefined;
}

export function isPinnedTailwindColorToken(value: string): boolean {
  const [color, opacity, remainder] = value.split('/');
  if (remainder !== undefined || color === undefined) return false;
  const standard = ['inherit', 'current', 'transparent', 'black', 'white'].includes(color);
  const [name, shade, extra] = color.split('-');
  const palette =
    extra === undefined &&
    name !== undefined &&
    shade !== undefined &&
    defaultTailwindColorNames.has(name) &&
    defaultTailwindColorShades.has(shade);
  if (!standard && !palette) return false;
  if (opacity === undefined) return true;
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(opacity)) return false;
  const numericOpacity = Number(opacity);
  return numericOpacity >= 0 && numericOpacity <= 100;
}

export function tailwindArbitraryTextKind(value: string): 'color' | 'font-size' | 'unknown' {
  const arbitrary = arbitraryValue(value);
  if (arbitrary === undefined) return 'unknown';
  if (['size', 'length', 'percentage', 'absolute-size', 'relative-size'].includes(arbitrary.hint ?? '')) {
    return 'font-size';
  }
  if (arbitrary.hint === 'color') return 'color';
  if (arbitrary.hint !== undefined) return 'unknown';
  const payload = decodedInferenceValue(arbitrary.payload);
  if (payload === undefined || payload.length === 0) return 'unknown';
  const inferred = inferTailwindDataType(payload, ['color', 'length', 'percentage', 'absolute-size', 'relative-size']);
  return inferred !== undefined && inferred !== 'color' ? 'font-size' : 'color';
}

function isTailwindBackgroundPosition(value: string): boolean {
  let recognized = 0;
  for (const part of value.split(' ')) {
    if (['center', 'top', 'right', 'bottom', 'left'].includes(part)) {
      recognized += 1;
      continue;
    }
    if (part.startsWith('var(')) continue;
    if (!isTailwindLength(part) && !isTailwindPercentage(part)) return false;
    recognized += 1;
  }
  return recognized > 0;
}

function isTailwindBackgroundSize(value: string): boolean {
  let recognized = 0;
  for (const layer of value.split(',')) {
    if (layer === 'cover' || layer === 'contain') {
      recognized += 1;
      continue;
    }
    const parts = layer.split(' ');
    if (
      (parts.length !== 1 && parts.length !== 2) ||
      !parts.every(part => part === 'auto' || isTailwindLength(part) || isTailwindPercentage(part))
    ) {
      return false;
    }
    recognized += 1;
  }
  return recognized > 0;
}

function splitTopLevelCommas(value: string): readonly string[] | undefined {
  const closingByOpening = new Map([
    ['(', ')'],
    ['[', ']'],
    ['{', '}'],
  ]);
  const stack: string[] = [];
  const parts: string[] = [];
  let quote: '"' | "'" | undefined;
  let start = 0;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === undefined) return undefined;
    if (quote !== undefined) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === '\\') {
      index += 1;
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
    if ([')', ']', '}'].includes(character)) {
      if (stack.pop() !== character) return undefined;
      continue;
    }
    if (character === ',' && stack.length === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  if (quote !== undefined || stack.length > 0) return undefined;
  parts.push(value.slice(start));
  return parts;
}

function isTailwindBackgroundImage(value: string): boolean {
  const layers = splitTopLevelCommas(value);
  if (layers === undefined) return false;
  let recognized = 0;
  for (const layer of layers) {
    const normalized = layer.trim();
    if (normalized.startsWith('var(')) continue;
    if (
      !/^(?:url|(?:repeating-)?(?:linear|radial|conic)-gradient|element|image|cross-fade|image-set)\([\s\S]*\)$/u.test(
        normalized,
      )
    ) {
      return false;
    }
    recognized += 1;
  }
  return recognized > 0;
}

export function tailwindArbitraryBackgroundKind(
  value: string,
): 'background-color' | 'background-image' | 'background-position' | 'background-size' | 'unknown' {
  const arbitrary = arbitraryValue(value);
  if (arbitrary === undefined) return 'unknown';
  if (arbitrary.hint === 'percentage' || arbitrary.hint === 'position') return 'background-position';
  if (['bg-size', 'length', 'size'].includes(arbitrary.hint ?? '')) return 'background-size';
  if (arbitrary.hint === 'image' || arbitrary.hint === 'url') return 'background-image';
  if (arbitrary.hint === 'color') return 'background-color';
  if (arbitrary.hint !== undefined) return 'unknown';

  const payload = decodedInferenceValue(arbitrary.payload);
  if (payload === undefined || payload.length === 0) return 'unknown';
  if (payload.startsWith('var(')) return 'unknown';
  if (isTailwindBackgroundImage(payload)) return 'background-image';
  if (inferTailwindDataType(payload, ['color']) === 'color') return 'background-color';

  const position = isTailwindBackgroundPosition(payload);
  const size = isTailwindBackgroundSize(payload);
  if (position === size) return 'unknown';
  return position ? 'background-position' : 'background-size';
}

export function tailwindArbitraryBorderKind(value: string): 'border-color' | 'border-width' | 'unknown' {
  const arbitrary = arbitraryValue(value);
  if (arbitrary === undefined) return 'unknown';
  if (arbitrary.hint === 'length' || arbitrary.hint === 'line-width') return 'border-width';
  if (arbitrary.hint === 'color') return 'border-color';
  if (arbitrary.hint !== undefined) return 'unknown';
  const payload = decodedInferenceValue(arbitrary.payload);
  if (payload === undefined || payload.length === 0) return 'unknown';
  const inferred = inferTailwindDataType(payload, ['color', 'line-width', 'length']);
  return inferred === 'line-width' || inferred === 'length' ? 'border-width' : 'border-color';
}

export function tailwindArbitraryShadowKind(value: string): 'shadow-color' | 'shadow-geometry' | 'unknown' {
  const arbitrary = arbitraryValue(value);
  if (arbitrary === undefined) return 'unknown';
  if (arbitrary.hint === 'color') return 'shadow-color';
  if (arbitrary.hint !== undefined) return 'unknown';
  const payload = decodedInferenceValue(arbitrary.payload);
  if (payload === undefined || payload.length === 0) return 'unknown';
  return inferTailwindDataType(payload, ['color']) === 'color' ? 'shadow-color' : 'shadow-geometry';
}
