import type { LocatedFlexLayoutInput } from '../../../analyzer/flex-layout-attribute.analyzer';
import { literalStyleMayControlDisplay, parseLiteralStyleDeclarations } from '../visibility/literal-style-display';
import { parseResponsiveStyleValue } from './responsive-style-value.parser';

function input(overrides: Partial<LocatedFlexLayoutInput> = {}): LocatedFlexLayoutInput {
  return {
    id: 'fixture:ngStyle.sm',
    fileName: 'fixture.html',
    elementId: '0',
    sourceName: 'ngStyle.sm',
    directive: 'ngStyle',
    value: 'color: #334155',
    binding: 'literal',
    breakpoint: 'sm',
    source: { start: 0, end: 32 },
    nameSource: { start: 0, end: 10 },
    valueSource: { start: 12, end: 30 },
    ...overrides,
  };
}

describe('parseLiteralStyleDeclarations', () => {
  test('parses comments, decoded entities, quotes, and balanced nested values without splitting their delimiters', () => {
    expect(
      parseLiteralStyleDeclarations(
        '/* lead */ color: rgb(1, 2, calc(3 + 4)); content: "Rock & Roll; key: value"; --Theme: {a:[b;c]};',
      ),
    ).toEqual({
      status: 'parsed',
      declarations: [
        { property: 'color', value: 'rgb(1, 2, calc(3 + 4))' },
        { property: 'content', value: '"Rock & Roll; key: value"' },
        { property: '--Theme', value: '{a:[b;c]}' },
      ],
    });
  });

  test('decodes CSS identifier escapes before exposing declaration properties', () => {
    expect(parseLiteralStyleDeclarations('D\\69 splay: block; c\\6flor: red')).toEqual({
      status: 'parsed',
      declarations: [
        { property: 'Display', value: 'block' },
        { property: 'color', value: 'red' },
      ],
    });
  });

  test('ignores empty declarations and preserves duplicate declarations in source order', () => {
    expect(parseLiteralStyleDeclarations(' ; color: red;; COLOR: red; color: blue; ')).toEqual({
      status: 'parsed',
      declarations: [
        { property: 'color', value: 'red' },
        { property: 'COLOR', value: 'red' },
        { property: 'color', value: 'blue' },
      ],
    });
  });

  test.each([
    ['unterminated comment', 'color: red; /*'],
    ['unterminated quote', 'content: "unfinished'],
    ['unmatched closing delimiter', 'color: rgb(1, 2))'],
    ['unmatched opening delimiter', 'color: calc(1px + 2px'],
    ['missing declaration colon', 'color: red; broken'],
    ['empty property', ': red'],
    ['comment-split property', 'dis/**/play: block'],
    ['dangling escape', 'color: red\\'],
  ])('returns unverified for %s', (_case, value) => {
    expect(parseLiteralStyleDeclarations(value)).toMatchObject({ status: 'unverified' });
    expect(literalStyleMayControlDisplay(value)).toBe(true);
  });

  test('keeps the display compatibility wrapper conservative over parsed declarations', () => {
    expect(literalStyleMayControlDisplay('color: red; --display: block')).toBe(false);
    expect(literalStyleMayControlDisplay('color: red; d\\69 splay: block')).toBe(true);
  });
});

describe('parseResponsiveStyleValue', () => {
  test('normalizes dashed property names, preserves custom-property spelling, and applies exact-key last-value wins', () => {
    expect(
      parseResponsiveStyleValue(
        input({
          value: 'Z-INDEX: 1; color: red; Z-INDEX: 2; --Theme_Gap: 1rem; --theme_gap: 2rem; color: #334155',
        }),
      ),
    ).toEqual({
      status: 'parsed',
      value: {
        declarations: [
          { property: 'z-index', value: '2' },
          { property: 'color', value: '#334155' },
          { property: '--Theme_Gap', value: '1rem' },
          { property: '--theme_gap', value: '2rem' },
        ],
      },
    });
  });

  test('strips quote characters from upstream raw-string keys and values before Angular NgStyle applies them', () => {
    expect(parseResponsiveStyleValue(input({ value: `'color': 'red'; "font-size".px: "14"` }))).toEqual({
      status: 'parsed',
      value: {
        declarations: [
          { property: 'color', value: 'red' },
          { property: 'font-size', value: '14px' },
        ],
      },
    });
  });

  test.each([
    ['width.%', '50', 'width', '50%'],
    ['font-size.px', '14', 'font-size', '14px'],
    ['letter-spacing.em', '0.1', 'letter-spacing', '0.1em'],
    ['font-size.rem', '.875', 'font-size', '.875rem'],
    ['width.vw', '80', 'width', '80vw'],
    ['height.vh', '100', 'height', '100vh'],
    ['width.vmin', '20', 'width', '20vmin'],
    ['height.vmax', '30', 'height', '30vmax'],
    ['rotate.deg', '-45', 'rotate', '-45deg'],
    ['animation-duration.s', '0.2', 'animation-duration', '0.2s'],
    ['transition-delay.ms', '150', 'transition-delay', '150ms'],
  ])('normalizes the exact Angular unit suffix %s', (sourceProperty, sourceValue, property, value) => {
    expect(parseResponsiveStyleValue(input({ value: `${sourceProperty}: ${sourceValue}` }))).toEqual({
      status: 'parsed',
      value: { declarations: [{ property, value }] },
    });
  });

  test('preserves CSS variables and calc expressions while stripping quotes and retaining colons', () => {
    expect(
      parseResponsiveStyleValue(
        input({
          value:
            'width: calc(100% - var(--card-gap, 1rem)); content: "key: exact value"; color: rgb(var(--channels, 51 65 85) / 50%)',
        }),
      ),
    ).toEqual({
      status: 'parsed',
      value: {
        declarations: [
          { property: 'width', value: 'calc(100% - var(--card-gap, 1rem))' },
          { property: 'content', value: 'key: exact value' },
          { property: 'color', value: 'rgb(var(--channels, 51 65 85) / 50%)' },
        ],
      },
    });
  });

  test.each([
    ['quoted semicolon', `content: 'first; second'`],
    ['function semicolon', 'width: var(--card; 10px)'],
  ])('preserves the family when upstream semicolon splitting makes %s ambiguous', (_case, value) => {
    expect(parseResponsiveStyleValue(input({ value }))).toMatchObject({ status: 'unverified' });
  });

  test('uses the last duplicate value exactly as the upstream raw-string map does', () => {
    expect(parseResponsiveStyleValue(input({ value: 'color: red; color: blue' }))).toEqual({
      status: 'parsed',
      value: { declarations: [{ property: 'color', value: 'blue' }] },
    });
    expect(parseResponsiveStyleValue(input({ value: '--Theme: red; --Theme: blue' }))).toEqual({
      status: 'parsed',
      value: { declarations: [{ property: '--Theme', value: 'blue' }] },
    });
  });

  test.each([
    ['lowercase key inserted before its uppercase collision', 'font-size:10px; FONT-SIZE:20px; font-size:30px'],
    ['uppercase key inserted before its lowercase collision', 'FONT-SIZE:20px; font-size:10px; FONT-SIZE:30px'],
    ['unit-suffixed key casing collision', 'font-size.PX:10; FONT-SIZE.px:20'],
  ])('preserves ordinary CSS keys whose exact spelling collides case-insensitively: %s', (_case, value) => {
    const result = parseResponsiveStyleValue(input({ value }));

    expect(result).toMatchObject({ status: 'unverified' });
    if (result.status !== 'unverified') throw new Error('Expected the case-colliding style value to be unverified.');
    expect(result.reason).toMatch(/case|spelling|activation/iu);
  });

  test.each(['margin-top:1px; MARGIN:2px; margin-top:3px', 'MARGIN:2px; margin-top:1px; MARGIN:3px'])(
    'preserves case-colliding shorthand application order that classes cannot encode: %s',
    value => {
      expect(parseResponsiveStyleValue(input({ value }))).toMatchObject({ status: 'unverified' });
    },
  );

  test.each(['COLOR: red', 'backgroundColor: red'])(
    'preserves undashed property spelling %s whose renderer outcome cannot be modeled as a CSS property',
    value => {
      expect(parseResponsiveStyleValue(input({ value }))).toMatchObject({ status: 'unverified' });
    },
  );

  test.each(['color: red!important', 'color: red ! IMPORTANT', 'color: red!/**/important', `color: 'red!important'`])(
    'preserves declaration priority text that Angular NgStyle does not apply: %s',
    value => {
      const result = parseResponsiveStyleValue(input({ value }));

      expect(result).toMatchObject({ status: 'unverified' });
      if (result.status !== 'unverified') throw new Error('Expected declaration priority to be unverified.');
      expect(result.reason).toMatch(/important|priority/iu);
    },
  );

  test.each([
    ['longhand before shorthand', 'margin-top: 2rem; margin: 1rem'],
    ['shorthand before longhand', 'margin: 1rem; margin-top: 2rem'],
  ])('rejects overlapping declaration ownership with %s', (_case, value) => {
    const result = parseResponsiveStyleValue(input({ value }));

    expect(result).toMatchObject({ status: 'unverified' });
    if (result.status !== 'unverified') throw new Error('Expected overlapping declarations to be unverified.');
    expect(result.reason).toMatch(/overlapping CSS property ownership/u);
  });

  test.each([
    ['URL function', 'background-image: url("https://example.test/image.png")'],
    ['URL inside another function', 'background-image: image-set("https://example.test/image.png" 1x)'],
    ['relative URL inside image-set', 'background-image: image-set("card.png" 1x)'],
    ['relative URL inside image', 'background-image: image("card.png")'],
    ['legacy expression function', 'width: EXPRESSION(alert(1))'],
    ['interpolation', 'color: {{ theme.color }}'],
    ['unsupported unit suffix', 'font-size.ch: 2'],
    ['unit-bearing suffixed value', 'font-size.px: 1rem'],
    ['ambiguous value escape', 'color: r\\65 d'],
    ['empty property', ': red'],
    ['empty value', 'color: '],
    ['unsupported property spelling', 'font size: 14px'],
    ['unencodable bracket value', 'content: "[unsafe]"'],
    ['raw-source HTML reference', 'content: &copy;'],
  ])('rejects the complete responsive value for %s', (_case, value) => {
    expect(parseResponsiveStyleValue(input({ value }))).toMatchObject({ status: 'unverified' });
  });

  test.each([
    ['--alpha()', 'color: --alpha(red/50%)'],
    ['theme()', 'color: theme(colors.red.500)'],
    ['--theme()', 'color: --theme(--color-brand)'],
    ['--spacing()', 'margin: --spacing(4)'],
  ])('leaves the complete style value unverified before Tailwind can resolve %s', (_case, value) => {
    expect(parseResponsiveStyleValue(input({ value }))).toMatchObject({ status: 'unverified' });
  });

  test('accepts an empty declaration list as the exact empty responsive style map', () => {
    expect(parseResponsiveStyleValue(input({ value: ' ; ; ' }))).toEqual({
      status: 'parsed',
      value: { declarations: [] },
    });
  });

  test.each([
    ['deprecated style alias', { sourceName: 'style.sm', directive: 'style' }],
    ['property-bound ngStyle alias', { sourceName: '[ngStyle.sm]', binding: 'property' }],
    ['empty breakpoint suffix', { sourceName: 'ngStyle.', breakpoint: '' }],
  ] as const)('leaves %s unverified', (_name, overrides) => {
    expect(parseResponsiveStyleValue(input(overrides)).status).toBe('unverified');
  });
});
