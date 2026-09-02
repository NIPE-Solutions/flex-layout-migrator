import { arbitraryValue } from './tailwind-value.parser';

describe('arbitraryValue', () => {
  test.each([
    ['4px', '[4px]'],
    ['1 1 30%', '[1_1_30%]'],
    ['calc(100% - 2rem)', '[calc(100%_-_2rem)]'],
    ['1\t1\n25%', '[1_1_25%]'],
  ])('encodes Tailwind CSS v4 arbitrary value %s', (source, expected) => {
    expect(arbitraryValue(source)).toBe(expected);
  });
});
