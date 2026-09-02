import type { OwnedCssRule } from '../css-artifact.model';
import { mergeOwnedStylesheet } from './owned-stylesheet.merger';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const START = '/* flex-layout-codemod:start schema=1 */';
const END = '/* flex-layout-codemod:end */';

function rule(id: string, property = 'display', value = 'flex'): OwnedCssRule {
  return {
    owner: 'flex-layout-codemod',
    id,
    className: `flm-${id}`,
    family: 'layout',
    declarations: [{ property, value }],
    context: { priority: 0 },
  };
}

function block(newline: '\n' | '\r\n', rules: readonly OwnedCssRule[]): string {
  if (rules.length === 0) return '';

  return [
    START,
    ...rules.flatMap(current => [
      `/* flex-layout-codemod:rule id=${current.id} */`,
      `.${current.className} {`,
      ...current.declarations.map(declaration => `  ${declaration.property}: ${declaration.value};`),
      '}',
    ]),
    END,
  ].join(newline);
}

function expectMerge(existing: string, rules: readonly OwnedCssRule[], output: string): void {
  const result = mergeOwnedStylesheet(existing, rules);

  expect(result).toEqual({ changed: output !== existing, output });
}

describe('mergeOwnedStylesheet', () => {
  test('appends an LF owned block to empty CSS', () => {
    expectMerge('', [rule(A)], block('\n', [rule(A)]));
  });

  test('appends directly after handwritten CSS with no trailing newline', () => {
    const existing = '.handwritten { display: block; }';

    expectMerge(existing, [rule(A)], `${existing}${block('\n', [rule(A)])}`);
  });

  test.each([
    ['LF', '.before {}\n.after {}', '\n'],
    ['CRLF', '.before {}\r\n.after {}', '\r\n'],
    ['mixed document newlines', '.before {}\r\n.after {}\n.last {}', '\r\n'],
  ] as const)('uses the first document newline when appending to %s CSS', (_label, existing, newline) => {
    expectMerge(existing, [rule(A)], `${existing}${block(newline, [rule(A)])}`);
  });

  test('replaces only the owned range and retains its internal newline over the document preference', () => {
    const prefix = 'PREFIX-SENTINEL\r\n.handwritten { color: red; }\r\n';
    const suffix = '\r\nSUFFIX-SENTINEL\n.after { color: blue; }';
    const existing = `${prefix}${block('\n', [rule(A)])}${suffix}`;
    const output = `${prefix}${block('\n', [rule(B)])}${suffix}`;

    expectMerge(existing, [rule(B)], output);
    expect(output.startsWith(prefix)).toBe(true);
    expect(output.endsWith(suffix)).toBe(true);
  });

  test('removes only an owned block surrounded by handwritten bytes', () => {
    const prefix = 'PREFIX-SENTINEL\n\n';
    const suffix = '\n\nSUFFIX-SENTINEL';
    const existing = `${prefix}${block('\r\n', [rule(A)])}${suffix}`;

    expectMerge(existing, [], `${prefix}${suffix}`);
  });

  test('removes an owned-only stylesheet completely', () => {
    const existing = block('\n', [rule(A)]);

    expectMerge(existing, [], '');
  });

  test.each([
    ['', 'empty CSS'],
    ['.handwritten {}', 'handwritten-only CSS'],
    ['.x::before { content: "/* flex-layout-codemod:start schema=1 */"; }', 'a marker-like string'],
  ])('leaves absent ownership and no rules unchanged for %s', (existing, _label) => {
    expectMerge(existing, [], existing);
  });

  test('replaces a smaller owned rule set with a larger one', () => {
    const prefix = '.before {}\n';
    const suffix = '\n.after {}';
    const existing = `${prefix}${block('\n', [rule(A)])}${suffix}`;

    expectMerge(existing, [rule(A), rule(B), rule(C)], `${prefix}${block('\n', [rule(A), rule(B), rule(C)])}${suffix}`);
  });

  test('replaces a larger owned rule set with a smaller one', () => {
    const prefix = '.before {}\r\n';
    const suffix = '\r\n.after {}';
    const existing = `${prefix}${block('\r\n', [rule(A), rule(B), rule(C)])}${suffix}`;

    expectMerge(existing, [rule(C)], `${prefix}${block('\r\n', [rule(C)])}${suffix}`);
  });

  test('is byte-idempotent when merging the same ordered rules again', () => {
    const first = mergeOwnedStylesheet('.before {}\r\n', [rule(A), rule(B)]);

    expect(mergeOwnedStylesheet(first.output, [rule(A), rule(B)])).toEqual({ changed: false, output: first.output });
  });

  test.each([
    {
      label: 'unsupported schema',
      source: '/* flex-layout-codemod:start schema=2 *//* flex-layout-codemod:end */',
      code: 'unsupported-ownership-schema',
      reason: 'Unsupported flex-layout-codemod ownership schema: 2',
    },
    {
      label: 'unknown prefixed marker',
      source: '/* flex-layout-codemod:future */',
      code: 'unknown-ownership-marker',
      reason: 'Unknown flex-layout-codemod ownership marker',
    },
    {
      label: 'duplicate start',
      source: `${START}${END}${START}${END}`,
      code: 'malformed-ownership-block',
      reason: 'Duplicate flex-layout-codemod start marker',
    },
    {
      label: 'duplicate end',
      source: `${START}${END}${END}`,
      code: 'malformed-ownership-block',
      reason: 'Duplicate flex-layout-codemod end marker',
    },
    {
      label: 'end before start',
      source: `${END}${START}`,
      code: 'malformed-ownership-block',
      reason: 'Flex-layout-codemod end marker appears before start marker',
    },
    {
      label: 'missing end mate',
      source: START,
      code: 'malformed-ownership-block',
      reason: 'Flex-layout-codemod start marker has no matching end marker',
    },
    {
      label: 'missing start mate',
      source: END,
      code: 'malformed-ownership-block',
      reason: 'Flex-layout-codemod end marker has no matching start marker',
    },
    {
      label: 'nested start',
      source: `${START}${START}${END}`,
      code: 'malformed-ownership-block',
      reason: 'Nested flex-layout-codemod start marker',
    },
    {
      label: 'rule marker outside the block',
      source: `/* flex-layout-codemod:rule id=${A} */\n.flm-${A} {}${START}${END}`,
      code: 'malformed-ownership-block',
      reason: 'Flex-layout-codemod rule marker appears outside owned block',
    },
    {
      label: 'malformed rule ID',
      source: `${START}/* flex-layout-codemod:rule id=abc */.flm-abc {}${END}`,
      code: 'malformed-ownership-block',
      reason: 'Malformed flex-layout-codemod rule marker',
    },
    {
      label: 'rule ID and selector mismatch',
      source: `${START}/* flex-layout-codemod:rule id=${A} */\n.flm-${B} {}${END}`,
      code: 'ownership-rule-mismatch',
      reason: 'Flex-layout-codemod rule ID does not match following selector',
    },
  ] as const)('throws the parser code and reason for $label', ({ source, code, reason }) => {
    expect(() => mergeOwnedStylesheet(source, [rule(A)])).toThrow(
      expect.objectContaining({ name: 'CssStylesheetError', code, message: reason }),
    );
  });
});
