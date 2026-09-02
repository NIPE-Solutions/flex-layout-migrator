import { FLEX_LAYOUT_DIRECTIVES } from './flex-layout.catalog';
import { COMPATIBILITY_INVENTORY } from './compatibility-inventory';

describe('compatibility inventory', () => {
  it('classifies every recognized directive exactly once', () => {
    const names = COMPATIBILITY_INVENTORY.map(entry => entry.directive);
    expect(names).toHaveLength(new Set(names).size);
    expect([...names].sort()).toEqual([...FLEX_LAYOUT_DIRECTIVES].sort());
  });

  it('records the current implemented and planned boundaries', () => {
    expect(COMPATIBILITY_INVENTORY).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ directive: 'fxLayout', tailwind: 'limited', css: 'planned' }),
        expect.objectContaining({ directive: 'gdColumns', tailwind: 'limited', css: 'planned' }),
        expect.objectContaining({ directive: 'gdInline', family: 'grid', tailwind: 'limited', css: 'planned' }),
        expect.objectContaining({
          directive: 'imgSrc',
          tailwind: 'not-applicable',
          image: 'limited',
          breakpoints: expect.objectContaining({ standard: 'limited', custom: 'preserved' }),
        }),
        expect.objectContaining({ directive: 'class', tailwind: 'preserved', css: 'preserved' }),
      ]),
    );
  });

  it('distinguishes standard, orientation, print, and custom breakpoint coverage', () => {
    const layout = COMPATIBILITY_INVENTORY.find(entry => entry.directive === 'fxLayout');
    expect(layout?.breakpoints).toEqual({
      standard: 'limited',
      orientation: 'planned',
      print: 'planned',
      custom: 'preserved',
    });
  });
});
