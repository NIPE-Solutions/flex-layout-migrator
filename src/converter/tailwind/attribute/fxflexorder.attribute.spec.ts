import { load } from 'cheerio';
import { FxFlexOrderAttributeConverter } from './fxflexorder.attribute';

describe('FxFlexFillAttributeConverter', () => {
  let converter: FxFlexOrderAttributeConverter;

  beforeEach(() => {
    converter = new FxFlexOrderAttributeConverter();
  });

  it('should add correct class for fxFlexOffset without breakpoint', () => {
    const html = `<div fxFlexOrder="1"></div>`;
    const $ = load(html);
    const element = $('div');

    converter.convert(['1'], element, undefined);
    expect(element.hasClass('order-1')).toBe(true);
  });

  it('should add correct class for fxFlexOffset with breakpoint', () => {
    const html = `<div fxFlexOrder.md></div>`;
    const $ = load(html);
    const element = $('div');

    converter.convert(['1'], element, 'md');
    expect(element.hasClass('md:order-1')).toBe(true);
  });

  it('should set first fxFlexOffset if no value is applied', () => {
    const html = `<div fxFlexOrder></div>`;
    const $ = load(html);
    const element = $('div');

    converter.convert([], element, undefined);
    expect(element.hasClass('order-first')).toBe(true);
  });
});
