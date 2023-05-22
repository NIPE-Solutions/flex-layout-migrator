import { load } from 'cheerio';
import { FxLayoutAttributeConverter } from './fxlayout.attribute';

describe('FxFlexLayoutAttributeConverter', () => {
  let converter: FxLayoutAttributeConverter;

  beforeEach(() => {
    converter = new FxLayoutAttributeConverter();
  });

  it('should add correct class for fxLayout without breakpoint', () => {
    const html = `<div fxLayout="row"></div>`;
    const $ = load(html);
    const element = $('div');

    converter.convert(['row'], element, undefined);
    expect(element.hasClass('flex-row')).toBe(true);
  });

  it('should add correct class for fxLayout with breakpoint', () => {
    const html = `<div fxLayout.md="row"></div>`;
    const $ = load(html);
    const element = $('div');

    converter.convert(['row'], element, 'md');
    expect(element.hasClass('md:flex-row')).toBe(true);
  });

  it('should set row if no value is used by fxLayout', () => {
    const html = `<div fxLayout></div>`;
    const $ = load(html);
    const element = $('div');

    converter.convert([], element, undefined);
    expect(element.hasClass('flex-row')).toBe(true);
  });

  it('should set wrap if it is used by fxLayout', () => {
    const html = `<div fxLayout="row wrap"></div>`;
    const $ = load(html);
    const element = $('div');

    converter.convert(['row', 'wrap'], element, undefined);
    expect(element.hasClass('flex-row')).toBe(true);
    expect(element.hasClass('flex-wrap')).toBe(true);
  });
});
