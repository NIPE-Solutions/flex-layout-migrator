import { BreakpointCatalog, type BreakpointDefinition } from '../../breakpoint/breakpoint-catalog';
import { ResponsiveVariantEmitter } from './responsive-variant.emitter';

function definition(alias: string): BreakpointDefinition {
  const classification = new BreakpointCatalog().classify(alias);
  if (classification.kind !== 'verified') {
    throw new Error(`Expected ${alias} to be a verified viewport breakpoint`);
  }
  return classification.definition;
}

describe('ResponsiveVariantEmitter', () => {
  test.each([
    ['gt-xs', 'flex-col', '[@media_screen_and_(min-width:_600px)]:flex-col'],
    ['lt-sm', 'flex-col', '[@media_screen_and_(max-width:_599.98px)]:flex-col'],
    ['sm', 'flex-col', '[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:flex-col'],
  ])('emits the exact %s media variant for %s', (alias, utility, expected) => {
    expect(new ResponsiveVariantEmitter().emit(definition(alias), utility)).toBe(expected);
  });

  test('rejects a utility already decorated with an arbitrary media variant', () => {
    expect(() =>
      new ResponsiveVariantEmitter().emit(definition('sm'), '[@media_screen_and_(min-width:_600px)]:flex-col'),
    ).toThrow('Cannot nest a responsive media variant');
  });
});
