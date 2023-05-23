import { load } from 'cheerio';
import { FxFlexFillAttributeConverter } from './fxflexfill.attribute';

describe('FxFlexFillAttributeConverter', () => {
  let converter: FxFlexFillAttributeConverter;

  beforeEach(() => {
    converter = new FxFlexFillAttributeConverter();
  });

  it('should add correct class for fxFlexFill without breakpoint', () => {
    const html = `<div fxFlexFill></div>`;
    const $ = load(html);
    const element = $('div');

    converter.convert([], element, undefined);
    expect(element.hasClass('w-full')).toBe(true);
    expect(element.hasClass('min-w-full')).toBe(true);
    expect(element.hasClass('h-full')).toBe(true);
    expect(element.hasClass('min-h-full')).toBe(true);
  });

  it('should add correct class for fxFlexFill with breakpoint', () => {
    const html = `<div fxFlexFill.md></div>`;
    const $ = load(html);
    const element = $('div');

    converter.convert([], element, 'md');
    expect(element.hasClass('md:w-full')).toBe(true);
    expect(element.hasClass('md:min-w-full')).toBe(true);
    expect(element.hasClass('md:h-full')).toBe(true);
    expect(element.hasClass('md:min-h-full')).toBe(true);
  });
});
