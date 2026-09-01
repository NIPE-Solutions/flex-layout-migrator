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

const unsignedDecimal = /^(?:(?:\d+(?:\.\d+)?)|(?:\.\d+))$/u;
const signedCssNumber = /^[+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?$/iu;
const mathFunction = /^(?:calc|min|max|clamp|mod|rem|sin|cos|tan|asin|acos|atan|atan2|pow|sqrt|hypot|log|exp|round)\(/u;
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
  if (mathFunction.test(value)) return true;
  const match = value.match(/^([+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?)([a-zA-Z]+)$/iu);
  return match !== null && signedCssNumber.test(match[1] ?? '') && cssLengthUnits.has(match[2] ?? '');
}

export function tailwindArbitraryTextKind(value: string): 'color' | 'font-size' {
  const arbitrary = arbitraryValue(value);
  if (arbitrary === undefined) return 'color';
  if (arbitrary.hint === 'length') return 'font-size';
  if (arbitrary.hint === 'color') return 'color';
  return isTailwindLength(arbitrary.payload) || /^[+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?%$/iu.test(arbitrary.payload)
    ? 'font-size'
    : 'color';
}

export function tailwindArbitraryBorderKind(value: string): 'border-color' | 'border-width' {
  const arbitrary = arbitraryValue(value);
  if (arbitrary === undefined) return 'border-color';
  if (arbitrary.hint === 'length') return 'border-width';
  if (arbitrary.hint === 'color') return 'border-color';
  return isTailwindLength(arbitrary.payload) || signedCssNumber.test(arbitrary.payload)
    ? 'border-width'
    : 'border-color';
}

export function tailwindArbitraryShadowKind(value: string): 'shadow-color' | 'shadow-geometry' {
  const arbitrary = arbitraryValue(value);
  if (arbitrary === undefined) return 'shadow-geometry';
  if (arbitrary.hint === 'color') return 'shadow-color';
  const payload = arbitrary.payload;
  return payload.startsWith('#') || colorFunction.test(payload) || cssColorKeywords.has(payload.toLowerCase())
    ? 'shadow-color'
    : 'shadow-geometry';
}
