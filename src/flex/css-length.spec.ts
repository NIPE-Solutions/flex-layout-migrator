import { parseCssLength } from './css-length';

describe('parseCssLength', () => {
  test('adds the directive fallback unit to a unitless number', () => {
    expect(parseCssLength('4', { fallbackUnit: 'px' })).toEqual({ ok: true, value: '4px' });
  });

  test('preserves an allowed CSS calculation', () => {
    expect(parseCssLength('calc(100% - 2rem)', { fallbackUnit: '%' })).toEqual({
      ok: true,
      value: 'calc(100% - 2rem)',
    });
  });

  test('rejects unsupported CSS functions', () => {
    expect(parseCssLength('expression(alert(1))', { fallbackUnit: 'px' })).toEqual({ ok: false });
  });
});
