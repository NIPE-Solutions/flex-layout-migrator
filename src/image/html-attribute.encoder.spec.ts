import { encodeHtmlAttribute } from './html-attribute.encoder';

describe('encodeHtmlAttribute', () => {
  test.each([
    ['hero.png', 'hero.png'],
    ['a&b"c', 'a&amp;b&quot;c'],
    ['line\r\nbreak', 'line&#13;&#10;break'],
    ['<hero>', '&lt;hero&gt;'],
  ])('encodes %j for a generated double-quoted HTML attribute', (value, expected) => {
    expect(encodeHtmlAttribute(value)).toBe(expected);
  });
});
