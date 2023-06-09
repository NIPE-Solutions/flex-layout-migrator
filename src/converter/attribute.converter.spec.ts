import { AttributeConverter } from './attribute.converter';
import { Cheerio } from 'cheerio';
import * as cheerio from 'cheerio';
import { BreakPoint, breakpoints } from './breakpoint.type';

class DummyAttributeConverter extends AttributeConverter<unknown> {
  constructor(attributeName: string) {
    super(attributeName);
  }

  public convert(_value: string[], _element: Cheerio<cheerio.Element>, _breakPoint?: BreakPoint): void {
    // Implementierung für den Test
  }
}

describe('AttributeConverter', () => {
  const attributeName = 'dummy';
  const converter = new DummyAttributeConverter(attributeName);

  test('getAttributeName() should return the attribute name', () => {
    expect(converter.getAttributeName()).toBe(attributeName);
  });

  test('usesBreakpoints() should return true by default', () => {
    expect(converter.usesBreakpoints()).toBe(true);
  });

  test('getAttributeNames() should return attribute names with breakpoints', () => {
    const expectedAttributeNames = ['', ...breakpoints].map(breakpoint => {
      return breakpoint ? `${attributeName}.${breakpoint}` : attributeName;
    });

    expect(converter.getAttributeNames()).toEqual(expectedAttributeNames);
  });

  test('getSelectors() should return a string of comma-separated selectors', () => {
    const expectedSelectors = [
      `[${attributeName}]`,
      ...breakpoints.map(breakpoint => `[${attributeName}.${breakpoint}]`),
    ].join(', ');

    expect(converter.getSelectors()).toBe(expectedSelectors);
  });

  test('prepare() should return an empty object', () => {
    const $ = cheerio.load('<div></div>');
    const element = $('div');
    expect(converter.prepare($, element)).toEqual({});
  });
});
