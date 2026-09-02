import type { LocatedFlexLayoutInput } from '../../analyzer/flex-layout-attribute.analyzer';
import { BreakpointCatalog } from '../../breakpoint/breakpoint-catalog';
import { ResponsiveVariantEmitter } from './responsive-variant.emitter';
import { planResponsiveClasses } from './responsive-plan';

function input(overrides: Partial<LocatedFlexLayoutInput> = {}): LocatedFlexLayoutInput {
  return {
    id: 'fixture:0',
    fileName: 'fixture.html',
    elementId: '0',
    sourceName: 'fxFlexAlign',
    directive: 'fxFlexAlign',
    value: 'center',
    binding: 'literal',
    breakpoint: undefined,
    source: { start: 0, end: 18 },
    nameSource: { start: 0, end: 11 },
    ...overrides,
  };
}

function plan(overrides: Partial<LocatedFlexLayoutInput> = {}) {
  return planResponsiveClasses(
    input(overrides),
    ['self-center'],
    new BreakpointCatalog(),
    new ResponsiveVariantEmitter(),
  );
}

describe('planResponsiveClasses', () => {
  test('decorates a verified literal breakpoint with its exact media variant', () => {
    expect(plan({ sourceName: 'fxFlexAlign.sm', breakpoint: 'sm' })).toEqual({
      status: 'converted',
      classNames: ['[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:self-center'],
    });
  });

  test('preserves a property-bound responsive value as dynamic before value parsing', () => {
    expect(
      plan({ sourceName: '[fxFlexAlign.sm]', binding: 'property', breakpoint: 'sm', value: 'not-a-flex-alignment' }),
    ).toMatchObject({ status: 'review', code: 'dynamic-binding' });
  });

  test.each([
    ['handset', 'breakpoint-unverified'],
    ['print', 'breakpoint-unverified'],
    ['cinema', 'custom-breakpoint'],
  ] as const)('preserves the unverified %s breakpoint alias', (breakpoint, code) => {
    expect(plan({ sourceName: `fxFlexAlign.${breakpoint}`, breakpoint })).toMatchObject({ status: 'review', code });
  });

  test.each([
    ['handset', '--orientation-breakpoints'],
    ['print', '--print-with-breakpoints'],
  ])('identifies the required configuration evidence for %s', (breakpoint, option) => {
    expect(plan({ sourceName: `fxFlexAlign.${breakpoint}`, breakpoint })).toMatchObject({
      status: 'review',
      suggestion: expect.stringContaining(option),
    });
  });
});
