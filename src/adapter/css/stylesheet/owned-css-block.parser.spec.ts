import { parseOwnedCssBlock } from './owned-css-block.parser';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const START = '/* flex-layout-codemod:start schema=1 */';
const END = '/* flex-layout-codemod:end */';
const RULE_A = `/* flex-layout-codemod:rule id=${A} */`;

describe('parseOwnedCssBlock', () => {
  test.each([
    ['', 'empty CSS'],
    ['.handwritten { display: block; }', 'handwritten CSS'],
    ['/* ordinary comment */', 'an unrelated comment'],
    [`/* note: ${START} */`, 'a non-prefixed comment containing marker text'],
    [`.x::before { content: "${START}"; }`, 'marker text in a string'],
  ])('returns absent for %s', (source, _label) => {
    expect(parseOwnedCssBlock(source)).toEqual({ status: 'absent' });
  });

  test.each([
    ['an escaped quote', String.raw`.escaped\"text"/* flex-layout-codemod:start schema=1 */"`],
    ['an escaped comment opener', String.raw`.escaped\/* flex-layout-codemod:start schema=1 */`],
  ])('returns absent when marker text follows %s in normal CSS', (_label, source) => {
    expect(parseOwnedCssBlock(source)).toEqual({ status: 'absent' });
  });

  test('finds a valid LF block and its internal newline', () => {
    const source = `${START}\n${RULE_A}\n.flm-${A} {\n  display: flex;\n}\n${END}`;

    expect(parseOwnedCssBlock(source)).toEqual({
      status: 'found',
      range: { start: 0, end: source.length },
      newline: '\n',
    });
  });

  test('finds a valid CRLF block and permits an opening brace directly after the selector', () => {
    const source = `${START}\r\n${RULE_A}\r\n.flm-${A}{\r\n  display: flex;\r\n}\r\n${END}`;

    expect(parseOwnedCssBlock(source)).toEqual({
      status: 'found',
      range: { start: 0, end: source.length },
      newline: '\r\n',
    });
  });

  test('returns the exact marker range without claiming handwritten prefix or suffix bytes', () => {
    const prefix = '.before {}\n\n';
    const block = `${START}\n${END}`;
    const suffix = '\n\n.after {}';
    const source = prefix + block + suffix;

    expect(parseOwnedCssBlock(source)).toEqual({
      status: 'found',
      range: { start: prefix.length, end: prefix.length + block.length },
      newline: '\n',
    });
  });

  test('uses the document newline for a same-line empty marker pair', () => {
    const prefix = '.before {}\r\n';
    const block = `${START}${END}`;

    expect(parseOwnedCssBlock(prefix + block)).toEqual({
      status: 'found',
      range: { start: prefix.length, end: prefix.length + block.length },
      newline: '\r\n',
    });
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
      source: `${RULE_A}\n.flm-${A} {}${START}${END}`,
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
      label: 'rule ID and next selector mismatch',
      source: `${START}${RULE_A}\n.flm-${B} {}${END}`,
      code: 'ownership-rule-mismatch',
      reason: 'Flex-layout-codemod rule ID does not match following selector',
    },
  ] as const)('returns a stable, path-free invalid result for $label', ({ source, code, reason }) => {
    const result = parseOwnedCssBlock(source);

    expect(result).toEqual({ status: 'invalid', code, reason });
    expect(reason).not.toMatch(/[/\\]/);
  });
});
