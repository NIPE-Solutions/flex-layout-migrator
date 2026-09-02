import { AdapterFactory } from './adapter.factory';
import { TailwindAdapter } from './tailwind/tailwind.adapter';

describe('AdapterFactory', () => {
  test('creates the Tailwind adapter', () => {
    expect(AdapterFactory.create('tailwind')).toBeInstanceOf(TailwindAdapter);
  });

  test('creates the Tailwind adapter with breakpoint migration configuration', () => {
    expect(
      AdapterFactory.create('tailwind', {
        orientationBreakpoints: true,
        printWithBreakpoints: Object.freeze(['md']),
      }),
    ).toBeInstanceOf(TailwindAdapter);
  });

  test('rejects unknown targets', () => {
    expect(() => AdapterFactory.create('unknown')).toThrow('Adapter [unknown] not found');
  });
});
