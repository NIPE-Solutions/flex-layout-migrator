import { CssStylesheetError } from './css-stylesheet.error';
import { scanCssComments } from './css-comment.scanner';

describe('scanCssComments', () => {
  test('returns no comments for empty CSS', () => {
    expect(scanCssComments('')).toEqual([]);
  });

  test('returns exact offsets and content for an ordinary comment', () => {
    const source = '.x {} /* ordinary */ .y {}';

    expect(scanCssComments(source)).toEqual([
      {
        start: 6,
        end: 20,
        content: ' ordinary ',
      },
    ]);
  });

  test('returns adjacent comments as separate tokens', () => {
    expect(scanCssComments('/* one *//*two*/')).toEqual([
      { start: 0, end: 9, content: ' one ' },
      { start: 9, end: 16, content: 'two' },
    ]);
  });

  test('ignores marker-looking text inside a quoted string', () => {
    const source = `.x::before{content:"/* flex-layout-codemod:start schema=1 */"}/* real */`;

    expect(scanCssComments(source)).toEqual([
      { start: source.indexOf('/* real */'), end: source.length, content: ' real ' },
    ]);
  });

  test('honors escaped quotes and backslashes in both quote styles', () => {
    const source = String.raw`.a{content:"escaped \" quote and \\ slash"}.b{content:'escaped \' quote and \\ slash'}/* after */`;

    expect(scanCssComments(source)).toEqual([
      { start: source.indexOf('/* after */'), end: source.length, content: ' after ' },
    ]);
  });

  test('recognizes a comment delimiter immediately after a string', () => {
    const source = `.x{content:'done'}/* after */`;

    expect(scanCssComments(source)).toEqual([
      { start: source.indexOf('/* after */'), end: source.length, content: ' after ' },
    ]);
  });

  test.each([
    ['escaped quote', String.raw`.escaped\"text"/* flex-layout-codemod:start schema=1 */"/* real */`],
    ['escaped comment opener', String.raw`.escaped\/* flex-layout-codemod:start schema=1 */;/* real */`],
  ])('does not expose marker text after an %s in normal CSS', (_label, source) => {
    const realCommentStart = source.indexOf('/* real */');

    expect(scanCssComments(source)).toEqual([{ start: realCommentStart, end: source.length, content: ' real ' }]);
  });

  test.each([
    ['LF', '\n'],
    ['CRLF', '\r\n'],
    ['CR', '\r'],
    ['form feed', '\f'],
  ])('does not consume a %s terminator as a normal-state escape', (_label, terminator) => {
    const source = `\\${terminator}/* real */`;
    const commentStart = 1 + terminator.length;

    expect(scanCssComments(source)).toEqual([{ start: commentStart, end: source.length, content: ' real ' }]);
  });

  test.each([
    ['without trailing whitespace', String.raw`.escaped\2f/* real */`],
    ['with CRLF trailing whitespace', `.escaped\\00002f\r\n/* real */`],
  ])('recognizes a real comment after a hex escape %s', (_label, source) => {
    const commentStart = source.indexOf('/* real */');

    expect(scanCssComments(source)).toEqual([{ start: commentStart, end: source.length, content: ' real ' }]);
  });

  test.each([
    ['LF', '.x{}\n/* line\ncomment */', 5, 23, ' line\ncomment '],
    ['CRLF', '.x{}\r\n/* line\r\ncomment */', 6, 25, ' line\r\ncomment '],
  ] as const)('preserves exact offsets and content in %s input', (_label, source, start, end, content) => {
    expect(scanCssComments(source)).toEqual([{ start, end, content }]);
  });

  test.each([
    ['comment', '/* unfinished', 'Unterminated CSS comment'],
    ['single-quoted string', ".x{content:'unfinished}", 'Unterminated CSS single-quoted string'],
    ['double-quoted string', '.x{content:"unfinished}', 'Unterminated CSS double-quoted string'],
  ])('throws a stable stylesheet error for an unterminated %s', (_label, source, message) => {
    expect(() => scanCssComments(source)).toThrow(CssStylesheetError);
    expect(() => scanCssComments(source)).toThrow(expect.objectContaining({ code: 'unterminated-css-token', message }));
  });
});
