import { parseCssLength } from '../../flex/css-length';
import { arbitraryValue } from './tailwind-value.parser';

describe('parseCssLength', () => {
  test.each([
    ['4', 'px', '4px'],
    ['12.5', '%', '12.5%'],
    ['-2', 'px', '-2px'],
    ['0', 'px', '0px'],
    ['10px', 'px', '10px'],
    ['1.5rem', 'px', '1.5rem'],
    ['25%', 'px', '25%'],
    ['calc(100% - 2rem)', 'px', 'calc(100% - 2rem)'],
    ['var(--layout-gap)', 'px', 'var(--layout-gap)'],
  ] as const)('normalizes %s with a %s fallback unit', (source, fallbackUnit, expected) => {
    expect(parseCssLength(source, { fallbackUnit })).toEqual({ ok: true, value: expected });
  });

  test.each(['', 'four', '10 px', '1;display:none', 'url(example.test)', 'calc(100%);color:red'])(
    'rejects unsafe or unsupported value %j',
    source => {
      expect(parseCssLength(source, { fallbackUnit: 'px' })).toEqual({ ok: false });
    },
  );
});

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
