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
    expect(new ResponsiveVariantEmitter().emit(definition(alias), utility)).toEqual([expected]);
  });

  test.each(['sm:flex-col', '[@media_screen_and_(min-width:_600px)]:flex-col'])(
    'rejects a utility already decorated with the responsive variant %s',
    utility => {
      expect(() => new ResponsiveVariantEmitter().emit(definition('sm'), utility)).toThrow(
        'Cannot decorate an already-variant utility',
      );
    },
  );

  test.each(['w-[17px', 'w-17px]', 'flex\\'])('rejects malformed utility structure before decorating %j', utility => {
    expect(() => new ResponsiveVariantEmitter().emit(definition('sm'), utility)).toThrow(
      'Cannot decorate a malformed Tailwind utility',
    );
  });

  test('treats a colon after an escaped opening bracket as a variant separator', () => {
    expect(() => new ResponsiveVariantEmitter().emit(definition('sm'), 'hover\\[:flex')).toThrow(
      'Cannot decorate an already-variant utility',
    );
  });

  test('preserves a structurally valid escaped closing bracket inside an arbitrary utility', () => {
    expect(new ResponsiveVariantEmitter().emit(definition('sm'), '[content:\\]]')).toEqual([
      '[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:[content:\\]]',
    ]);
  });

  test.each([
    ['sm', 'hover:bg-blue-600', '[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:hover:bg-blue-600'],
    ['gt-xs', 'dark:hover:text-white', '[@media_screen_and_(min-width:_600px)]:dark:hover:text-white'],
    ['lt-sm', '![color:red]', '[@media_screen_and_(max-width:_599.98px)]:![color:red]'],
    ['sm', 'hover:-mt-2', '[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:hover:-mt-2'],
    ['gt-xs', 'dark:flex!', '[@media_screen_and_(min-width:_600px)]:dark:flex!'],
  ])('places the exact %s media variant before ordinary variants in %s', (alias, candidate, expected) => {
    expect(new ResponsiveVariantEmitter().emitCandidate(definition(alias), candidate)).toEqual([expected]);
  });

  test.each([
    '[@media_screen_and_(min-width:_600px)]:hover:flex',
    '[@media_screen_and_(min-width:_700px)_and_(max-width:_600px)]:flex',
  ])('rejects source candidate containing generated exact-media syntax %s', candidate => {
    expect(() => new ResponsiveVariantEmitter().emitCandidate(definition('sm'), candidate)).toThrow(
      'Cannot decorate a candidate containing a generated media variant',
    );
  });

  test('emits every composite orientation clause in canonical order', () => {
    const classification = new BreakpointCatalog({ orientationBreakpoints: true }).classify('handset');
    if (classification.kind !== 'verified') throw new Error('Expected handset to be verified');

    expect(new ResponsiveVariantEmitter().emit(classification.definition, 'flex-col')).toEqual([
      '[@media_(orientation:_portrait)_and_(max-width:_599.98px)]:flex-col',
      '[@media_(orientation:_landscape)_and_(max-width:_959.98px)]:flex-col',
    ]);
  });

  test('emits print as an exact media variant', () => {
    const classification = new BreakpointCatalog({
      orientationBreakpoints: false,
      printWithBreakpoints: [],
    }).classify('print');
    if (classification.kind !== 'verified') throw new Error('Expected print to be verified');

    expect(new ResponsiveVariantEmitter().emit(classification.definition, 'hidden')).toEqual(['[@media_print]:hidden']);
  });
});
