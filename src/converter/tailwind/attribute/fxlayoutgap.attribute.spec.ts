import { load } from 'cheerio';
import { FxLayoutGapAttributeConverter } from './fxlayoutgap.attribute';

describe('FLayoutGapConverter', () => {
  let converter: FxLayoutGapAttributeConverter;

  beforeEach(() => {
    converter = new FxLayoutGapAttributeConverter();
  });

  it('should add correct class for fxLayoutGap without breakpoint', () => {
    const html = `<div fxLayoutGap='10px'></div>`;
    const $ = load(html);
    const element = $('div');

    converter.convert(['10px'], element, undefined);
    expect(element.hasClass('gap-[10px]')).toBe(true);
  });

  it('should add correct class for fxLayoutGap with breakpoint', () => {
    const html = `<div fxLayout="row" fxLayoutGap.md="10px"></div>`;
    const $ = load(html);
    const element = $('div');

    converter.convert(['10px'], element, 'md');
    expect(element.hasClass('md:gap-[10px]')).toBe(true);
  });

  it('should set to 0 if no layout gap is defined for fxLayoutGap', () => {
    const html = `<div fxLayout="row" fxLayoutGap></div>`;
    const $ = load(html);
    const element = $('div');

    converter.convert([], element, undefined);
    expect(element.hasClass('gap-0')).toBe(true);
  });

  it('should set grid if defined for fxLayoutGap', () => {
    const html = `<div fxLayout="row" fxLayoutGap='10px grid'></div>`;
    const $ = load(html);
    const element = $('div');

    converter.convert(['10px', 'grid'], element, undefined);
    expect(element.hasClass('gap-[10px]')).toBe(true);
    expect(element.hasClass('grid')).toBe(true);
  });
});
