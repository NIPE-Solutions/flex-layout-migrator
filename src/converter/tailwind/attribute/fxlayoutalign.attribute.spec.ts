import { load } from 'cheerio';
import { FxLayoutAlignAttributeConverter } from './fxlayoutalign.attribute';

describe('FLayoutAlignConverter', () => {
  let converter: FxLayoutAlignAttributeConverter;

  beforeEach(() => {
    converter = new FxLayoutAlignAttributeConverter();
  });

  it('should add correct class for fxLayoutAlign without breakpoint', () => {
    const html = `<div fxLayoutAlign='center end'></div>`;
    const $ = load(html);
    const element = $('div');

    converter.convert(['center', 'end'], element, undefined, {
      direction: 'row',
    });
    expect(element.hasClass('justify-center')).toBe(true);
    expect(element.hasClass('items-end')).toBe(true);
  });

  it('should add correct class for fxLayoutAlign with breakpoint', () => {
    const html = `<div fxLayoutAlign.md="center end"></div>`;
    const $ = load(html);
    const element = $('div');

    converter.convert(['center', 'end'], element, 'md', {
      direction: 'row',
    });
    expect(element.hasClass('md:justify-center')).toBe(true);
    expect(element.hasClass('md:items-end')).toBe(true);
  });

  it('should add correct class for fxLayoutAlign for columns', () => {
    const html = `<div fxLayoutAlign="center end"></div>`;
    const $ = load(html);
    const element = $('div');

    converter.convert(['center', 'end'], element, undefined, {
      direction: 'column',
    });
    expect(element.hasClass('justify-center')).toBe(true);
    expect(element.hasClass('content-end')).toBe(true);
  });

  it('should set stretch if no value is set for fxLayoutAlign', () => {
    const html = `<div fxLayoutAlign></div>`;
    const $ = load(html);
    const element = $('div');

    converter.convert([], element, undefined, {
      direction: 'row',
    });
    expect(element.hasClass('justify-start')).toBe(true);
    expect(element.hasClass('items-stretch')).toBe(true);
  });
});
