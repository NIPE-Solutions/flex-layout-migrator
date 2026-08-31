import { ConverterFactory } from './converter.factory';
import { TailwindAdapter } from '../adapter/tailwind/tailwind.adapter';

describe('ConverterFactory', () => {
  test('creates the Tailwind adapter', () => {
    const converter = ConverterFactory.createConverter('tailwind');
    expect(converter).toBeInstanceOf(TailwindAdapter);
  });

  test('createConverter() should throw an error for an unknown converter type', () => {
    expect(() => {
      ConverterFactory.createConverter('unknown');
    }).toThrowError('Converter [unknown] not found');
  });
});
