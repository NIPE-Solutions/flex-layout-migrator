import { cssPropertiesOverlap } from './css-property-ownership';

describe('cssPropertiesOverlap', () => {
  test.each([
    ['font', 'font-size'],
    ['background', 'background-color'],
    ['gap', 'row-gap'],
    ['margin', 'margin-top'],
    ['padding', 'padding-left'],
    ['inset', 'bottom'],
    ['border', 'border-left-color'],
    ['border-top', 'border-top-width'],
    ['border-width', 'border-right-width'],
    ['overflow', 'overflow-y'],
    ['flex', 'flex-basis'],
    ['transition', 'transition-duration'],
    ['grid-template', 'grid-template-columns'],
    ['list-style', 'list-style-type'],
  ])('recognizes %s ownership of %s', (shorthand, longhand) => {
    expect(cssPropertiesOverlap(shorthand, longhand)).toBe(true);
    expect(cssPropertiesOverlap(longhand, shorthand)).toBe(true);
  });

  test.each([
    ['margin-top', 'margin-bottom'],
    ['padding-left', 'padding-right'],
    ['top', 'bottom'],
    ['row-gap', 'column-gap'],
    ['border-top-color', 'border-bottom-width'],
    ['background-color', 'background-image'],
    ['font-size', 'font-weight'],
  ])('keeps disjoint longhands %s and %s independent', (left, right) => {
    expect(cssPropertiesOverlap(left, right)).toBe(false);
  });

  test('treats unknown ordinary properties conservatively', () => {
    expect(cssPropertiesOverlap('future-shorthand', 'color')).toBe(true);
    expect(cssPropertiesOverlap('color', 'future-shorthand')).toBe(true);
  });

  test('does not broadly conflate unrelated custom properties', () => {
    expect(cssPropertiesOverlap('--card-gap', '--card-color')).toBe(false);
    expect(cssPropertiesOverlap('--card-gap', '--card-gap')).toBe(true);
    expect(cssPropertiesOverlap('--card-gap', 'gap')).toBe(false);
  });
});
