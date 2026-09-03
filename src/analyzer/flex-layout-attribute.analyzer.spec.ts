import { analyzeFlexLayoutAttribute } from './flex-layout-attribute.analyzer';

describe('analyzeFlexLayoutAttribute', () => {
  test.each([
    ['fxLayout', 'row', 'fxLayout', undefined, 'literal'],
    ['fxLayout.sm', 'column', 'fxLayout', 'sm', 'literal'],
    ['[fxFlex]', 'basis', 'fxFlex', undefined, 'property'],
    ['[fxShow.gt-md]', 'visible', 'fxShow', 'gt-md', 'property'],
    ['[fxLayout.handset.landscape]', 'row', 'fxLayout', 'handset.landscape', 'property'],
    ['class.sm', 'compact', 'class', 'sm', 'literal'],
    ['gdInline', '', 'gdInline', undefined, 'literal'],
    ['gdInline.md', 'false', 'gdInline', 'md', 'literal'],
    ['[gdInline]', 'isInline', 'gdInline', undefined, 'property'],
  ] as const)('analyzes %s without evaluating its value', (sourceName, value, directive, breakpoint, binding) => {
    expect(analyzeFlexLayoutAttribute(sourceName, value)).toEqual({
      sourceName,
      value,
      directive,
      breakpoint,
      binding,
    });
  });

  test('retains an unknown breakpoint for later classification', () => {
    expect(analyzeFlexLayoutAttribute('fxLayout.cinema', 'row')).toEqual({
      sourceName: 'fxLayout.cinema',
      value: 'row',
      directive: 'fxLayout',
      breakpoint: 'cinema',
      binding: 'literal',
    });
  });

  test.each([
    ['src.xs', 'small.png', 'literal'],
    ['src.gt-lg', 'wide.png', 'literal'],
    ['[src.md]', 'mediumImage', 'property'],
    ['[src.handset.landscape]', 'handsetImage', 'property'],
  ] as const)('recognizes upstream responsive image input %s as imgSrc', (sourceName, value, binding) => {
    expect(analyzeFlexLayoutAttribute(sourceName, value)).toEqual({
      sourceName,
      value,
      directive: 'imgSrc',
      breakpoint: sourceName.replace(/^\[?src\./, '').replace(/\]$/, ''),
      binding,
    });
  });

  test.each([
    ['aria-label', 'Menu'],
    ['class', 'card'],
    ['style', 'display: block'],
    ['[class]', 'cardClass'],
    ['[style]', 'cardStyle'],
    ['src', 'fallback.png'],
    ['[src]', 'fallbackImage'],
    ['fxLayout]', 'row'],
  ])('ignores unrelated or malformed attribute %s', (sourceName, value) => {
    expect(analyzeFlexLayoutAttribute(sourceName, value)).toBeUndefined();
  });
});
