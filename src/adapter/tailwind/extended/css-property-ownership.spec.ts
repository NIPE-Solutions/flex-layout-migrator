import { cssPropertiesOverlap, cssPropertyOwnershipCovers } from './css-property-ownership';

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

  test('treats all as universal ordinary-property ownership without claiming custom properties', () => {
    expect(cssPropertiesOverlap('all', 'display')).toBe(true);
    expect(cssPropertiesOverlap('color', 'all')).toBe(true);
    expect(cssPropertiesOverlap('all', '--card-color')).toBe(false);
    expect(cssPropertyOwnershipCovers('all', 'display')).toBe(true);
    expect(cssPropertyOwnershipCovers('display', 'all')).toBe(false);
  });

  test.each([
    'border-start-start-radius',
    'border-start-end-radius',
    'border-end-start-radius',
    'border-end-end-radius',
    'border-top-left-radius',
    'border-top-right-radius',
    'border-bottom-left-radius',
    'border-bottom-right-radius',
  ])('treats border-radius as conservative ownership of %s', property => {
    expect(cssPropertyOwnershipCovers('border-radius', property)).toBe(true);
  });
});
