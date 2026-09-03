import {
  DEFAULT_BREAKPOINTS,
  FLEX_LAYOUT_DIRECTIVES,
  isFlexLayoutDirective,
  isKnownBreakpoint,
} from './flex-layout.catalog';

describe('Flex-Layout catalog', () => {
  test('recognizes every upstream directive family', () => {
    const directives = [
      'fxLayout',
      'fxLayoutAlign',
      'fxLayoutGap',
      'fxFlex',
      'fxGrow',
      'fxShrink',
      'fxFlexAlign',
      'fxFlexFill',
      'fxFill',
      'fxFlexOffset',
      'fxFlexOrder',
      'fxShow',
      'fxHide',
      'gdAlignColumns',
      'gdAlignRows',
      'gdArea',
      'gdAreas',
      'gdAuto',
      'gdColumn',
      'gdColumns',
      'gdGap',
      'gdGridAlign',
      'gdInline',
      'gdRow',
      'gdRows',
      'class',
      'ngClass',
      'style',
      'ngStyle',
      'imgSrc',
    ];

    expect(FLEX_LAYOUT_DIRECTIVES).toEqual(directives);
    expect(directives.every(isFlexLayoutDirective)).toBe(true);
    expect(isFlexLayoutDirective('aria-label')).toBe(false);
  });

  test('recognizes default, orientation, and print breakpoints', () => {
    expect(DEFAULT_BREAKPOINTS).toEqual([
      'xs',
      'sm',
      'md',
      'lg',
      'xl',
      'lt-sm',
      'lt-md',
      'lt-lg',
      'lt-xl',
      'gt-xs',
      'gt-sm',
      'gt-md',
      'gt-lg',
    ]);
    expect(isKnownBreakpoint('handset.landscape')).toBe(true);
    expect(isKnownBreakpoint('print')).toBe(true);
    expect(isKnownBreakpoint('cinema')).toBe(false);
  });
});
