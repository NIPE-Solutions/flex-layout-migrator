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

  test.each(['sm:flex-col', '[@media_screen_and_(min-width:_600px)]:flex-col'])(
    'rejects a utility already decorated with the responsive variant %s',
    utility => {
      expect(() => new ResponsiveVariantEmitter().emit(definition('sm'), utility)).toThrow(
        'Cannot decorate an already-variant utility',
      );
    },
  );

  test.each([
    ['sm', 'hover:bg-blue-600', '[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:hover:bg-blue-600'],
    ['gt-xs', 'dark:hover:text-white', '[@media_screen_and_(min-width:_600px)]:dark:hover:text-white'],
    ['lt-sm', '![color:red]', '[@media_screen_and_(max-width:_599.98px)]:![color:red]'],
  ])('places the exact %s media variant before ordinary variants in %s', (alias, candidate, expected) => {
    expect(new ResponsiveVariantEmitter().emitCandidate(definition(alias), candidate)).toBe(expected);
  });

  test('rejects a source candidate that already contains a generated exact-media variant', () => {
    const candidate = '[@media_screen_and_(min-width:_600px)]:hover:flex';

    expect(() => new ResponsiveVariantEmitter().emitCandidate(definition('sm'), candidate)).toThrow(
      'Cannot decorate a candidate containing a generated media variant',
    );
  });
});
