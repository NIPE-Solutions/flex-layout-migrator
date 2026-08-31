import { AdapterFactory } from './adapter.factory';
import { TailwindAdapter } from './tailwind/tailwind.adapter';

describe('AdapterFactory', () => {
  test('creates the Tailwind adapter', () => {
    expect(AdapterFactory.create('tailwind')).toBeInstanceOf(TailwindAdapter);
  });

  test('rejects unknown targets', () => {
    expect(() => AdapterFactory.create('unknown')).toThrow('Adapter [unknown] not found');
  });
});
