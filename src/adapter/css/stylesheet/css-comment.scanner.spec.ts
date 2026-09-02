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
