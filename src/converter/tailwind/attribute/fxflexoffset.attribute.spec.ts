import { load } from 'cheerio';
import { FxFlexOffsetAttributeConverter } from './fxflexoffset.attribute';

describe('FxFlexOffsetConverter', () => {
  let converter: FxFlexOffsetAttributeConverter;

  beforeEach(() => {
    converter = new FxFlexOffsetAttributeConverter();
  });

  it('should add correct class for fxFlexOffset without breakpoint', () => {
    const html = `<div fxFlexOffset="4"></div>`;
    const $ = load(html);
    const element = $('div');

    converter.convert(['4'], element, undefined, {
      direction: 'column',
    });
    expect(element.hasClass('mt-4')).toBe(true);
  });

  it('should add correct class for fxFlexOffset with breakpoint', () => {
    const html = `<div fxFlexOffset.md="4"></div>`;
    const $ = load(html);
    const element = $('div');

    converter.convert(['4'], element, 'md', {
      direction: 'column',
    });
    expect(element.hasClass('md:mt-4')).toBe(true);
  });

  it('should handle multiple breakpoints correctly', () => {
    const html = `<div fxFlexOffset="4" fxLayout.md="" fxLayout.lg=""></div>`;
    const $ = load(html);
    const element = $('div');

    converter.convert(['4'], element, 'md', {
      direction: 'column',
    });
    converter.convert(['6'], element, 'lg', {
      direction: 'column',
    });

    expect(element.hasClass('md:mt-4')).toBe(true);
    expect(element.hasClass('lg:mt-6')).toBe(true);
  });

  it('should handle no fxFlexOffset value', () => {
    const html = `<div fxFlexOffset=""></div>`;
    const $ = load(html);
    const element = $('div');

    converter.convert([], element, undefined, {
      direction: 'column',
    });

    expect(element.hasClass('mt-0')).toBe(true);
  });
});
