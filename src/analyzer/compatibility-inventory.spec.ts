import { FLEX_LAYOUT_DIRECTIVES } from './flex-layout.catalog';
import { COMPATIBILITY_INVENTORY } from './compatibility-inventory';

describe('compatibility inventory', () => {
  it('classifies every recognized directive exactly once', () => {
    const names = COMPATIBILITY_INVENTORY.map(entry => entry.directive);
    expect(names).toHaveLength(new Set(names).size);
    expect([...names].sort()).toEqual([...FLEX_LAYOUT_DIRECTIVES].sort());
  });

  it('records the current native CSS and independent responsive-image boundaries', () => {
    expect(COMPATIBILITY_INVENTORY).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ directive: 'fxLayout', tailwind: 'limited', css: 'limited' }),
        expect.objectContaining({ directive: 'fxFlexOrder', family: 'flex', css: 'limited' }),
        expect.objectContaining({ directive: 'gdColumns', tailwind: 'limited', css: 'preserved' }),
        expect.objectContaining({ directive: 'gdInline', family: 'grid', tailwind: 'limited', css: 'preserved' }),
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

  it('records the CSS target standard-alias limit separately from preserved aliases', () => {
    const layout = COMPATIBILITY_INVENTORY.find(entry => entry.directive === 'fxLayout');
    expect(layout?.breakpoints).toEqual({
      standard: 'limited',
      orientation: 'preserved',
      print: 'preserved',
      custom: 'preserved',
    });
  });
});
