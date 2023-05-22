import { load } from 'cheerio';
import { FxFlexAttributeConverter } from './fxflex.attribute';

describe('FxFlexAttributeConverter', () => {
  let converter: FxFlexAttributeConverter;

  beforeEach(() => {
    converter = new FxFlexAttributeConverter();
  });

  it('should add correct class for fxFlex without breakpoint', () => {
    const html = `<div fxFlex></div>`;
    const $ = load(html);
    const element = $('div');

    converter.convert([], element, undefined);
    expect(element.hasClass('flex')).toBe(true);
  });

  it('should add correct class for fxFlex with breakpoint', () => {
    const html = `<div fxFlex.md></div>`;
    const $ = load(html);
    const element = $('div');

    converter.convert([], element, 'md');
    expect(element.hasClass('md:flex')).toBe(true);
  });

  it('should handle multiple breakpoints correctly', () => {
    const html = `<div fxFlex></div>`;
    const $ = load(html);
    const element = $('div');

    converter.convert([], element, 'md');
    converter.convert([], element, 'lg');

    expect(element.hasClass('md:flex')).toBe(true);
    expect(element.hasClass('lg:flex')).toBe(true);
  });

  it('should handle no fxFlex value', () => {
    const html = `<div fxFlex></div>`;
    const $ = load(html);
    const element = $('div');

    converter.convert([], element, undefined);

    expect(element.hasClass('flex')).toBe(true);
  });

  it('should handle fxFlex value with only basis entry', () => {
    const html = `<div fxFlex='30%'></div>`;
    const $ = load(html);
    const element = $('div');

    converter.convert(['30%'], element, undefined);

    expect(element.hasClass('flex-[30%]')).toBe(true);
  });

  it('should handle fxFlex value with only basis entry', () => {
    const html = `<div fxFlex='0 1 30%'></div>`;
    const $ = load(html);
    const element = $('div');

    converter.convert(['0', '1', '30%'], element, undefined);

    expect(element.hasClass('flex-[0_1_30%]')).toBe(true);
  });
});
