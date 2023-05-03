import { Converter } from './converter';
import { AttributeConverter } from './attribute.converter';
import { Cheerio } from 'cheerio';
import * as cheerio from 'cheerio';

class DummyAttributeConverter extends AttributeConverter<unknown> {
  constructor() {
    super('dummy');
  }

  convert(
    value: string[],
    element: Cheerio<cheerio.Element>,
    breakPoint?: string,
  ): void {
    // Dummy converter, does nothing
  }
}

class TestConverter extends Converter {
  constructor() {
    super();
    this.addConverter(new DummyAttributeConverter());
  }
}

describe('Converter', () => {
  let converter: TestConverter;

  beforeEach(() => {
    converter = new TestConverter();
  });

  test('canConvert() should return true for supported attribute', () => {
    expect(converter.canConvert('dummy')).toBe(true);
  });

  test('canConvert() should return false for unsupported attribute', () => {
    expect(converter.canConvert('unsupported')).toBe(false);
  });

  test('convert() should not throw an error for supported attribute', () => {
    const element = cheerio.load("<div dummy='value'></div>")('div');
    expect(() => converter.convert('dummy', ['value'], element)).not.toThrow();
  });

  test('convert() should throw an error for unsupported attribute', () => {
    const element = cheerio.load("<div unsupported='value'></div>")('div');
    expect(() => converter.convert('unsupported', ['value'], element)).toThrow(
      'Unknown attribute: unsupported',
    );
  });

  test('getAllAttributes() should return a list of supported attributes', () => {
    expect(converter.getAllAttributes()).toEqual([
      'dummy',
      'dummy.xs',
      'dummy.sm',
      'dummy.md',
      'dummy.lg',
      'dummy.xl',
      'dummy.lt-sm',
      'dummy.lt-md',
      'dummy.lt-lg',
      'dummy.lt-xl',
      'dummy.gt-xs',
      'dummy.gt-sm',
      'dummy.gt-md',
      'dummy.gt-lg',
    ]);
  });
});
