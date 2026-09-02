import { validateSingleSrcsetUrl } from './srcset-value';

describe('validateSingleSrcsetUrl', () => {
  test.each(['hero.png', '/assets/hero@2x.png?crop=wide&format=webp', 'https://cdn.example/hero.webp'])(
    'accepts one descriptor-free URL: %s',
    value => {
      expect(validateSingleSrcsetUrl(value)).toEqual({ status: 'valid', value });
    },
  );

  test.each([
    '',
    'hero 2x',
    'hero.png 480w',
    'one.png,two.png',
    'one.png, two.png',
    '{{ hero }}',
    'data:image/png;base64,abc',
  ])('rejects an empty or ambiguous srcset value: %s', value => {
    expect(validateSingleSrcsetUrl(value)).toMatchObject({ status: 'invalid', reason: expect.any(String) });
  });
});
