import { load } from 'cheerio';
import { FxFlexOffsetConverter } from './fxoffset.attribute';

describe('FxFlexOffsetConverter', () => {
  let converter: FxFlexOffsetConverter;

  beforeEach(() => {
    converter = new FxFlexOffsetConverter();
  });

  it('should add correct class for fxFlexOffset without breakpoint', () => {
    const html = `<div fxFlexOffset="4"></div>`;
    const $ = load(html);
    const element = $('div');

    converter.convert(['4'], element);
    expect(element.hasClass('ml-4')).toBe(true);
  });

  it('should add correct class for fxFlexOffset with breakpoint', () => {
    const html = `<div fxFlexOffset="4" fxLayout.md=""></div>`;
    const $ = load(html);
    const element = $('div');

    converter.convert(['4'], element, 'md');
    expect(element.hasClass('md:ml-4')).toBe(true);
  });

  it('should handle multiple breakpoints correctly', () => {
    const html = `<div fxFlexOffset="4" fxLayout.md="" fxLayout.lg=""></div>`;
    const $ = load(html);
    const element = $('div');

    converter.convert(['4'], element, 'md');
    converter.convert(['6'], element, 'lg');

    expect(element.hasClass('md:ml-4')).toBe(true);
    expect(element.hasClass('lg:ml-6')).toBe(true);
  });

  it('should handle no fxFlexOffset value', () => {
    const html = `<div fxFlexOffset=""></div>`;
    const $ = load(html);
    const element = $('div');

    converter.convert([], element);

    expect(element.attr('class')).toBeUndefined();
  });
});
