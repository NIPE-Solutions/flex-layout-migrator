import type { OwnedCssRule } from './css-artifact.model';
import { CssArtifactRegistry } from './css-artifact.registry';
import { compareOwnedCssRules } from './css-rule-order';

const ids = {
  baseAlpha: 'a'.repeat(64),
  baseZeta: 'b'.repeat(64),
  responsiveLow: 'c'.repeat(64),
  responsiveFirst: 'd'.repeat(64),
  responsiveSecond: 'e'.repeat(64),
  responsiveHigh: 'f'.repeat(64),
} as const;

function digestFor(canonicalIdentity: string): string {
  if (canonicalIdentity.includes('base-alpha')) return ids.baseAlpha;
  if (canonicalIdentity.includes('base-zeta')) return ids.baseZeta;
  if (canonicalIdentity.includes('responsive-low')) return ids.responsiveLow;
  if (canonicalIdentity.includes('responsive-first')) return ids.responsiveFirst;
  if (canonicalIdentity.includes('responsive-second')) return ids.responsiveSecond;
  if (canonicalIdentity.includes('responsive-high')) return ids.responsiveHigh;
  throw new Error(`Unexpected canonical identity: ${canonicalIdentity}`);
}

function registerRules(order: readonly string[]) {
  const registry = new CssArtifactRegistry(digestFor);
  const register = (value: string, context?: Parameters<CssArtifactRegistry['register']>[2]) =>
    registry.register('layout-gap', [{ property: 'gap', value }], context);
  const definitions = {
    'base-alpha': () => register('base-alpha'),
    'base-zeta': () => register('base-zeta'),
    'responsive-low': () =>
      register('responsive-low', { priority: 800, media: { type: 'screen', clauses: [{ min: 960 }] } }),
    'responsive-first': () =>
      register('responsive-first', { priority: 900, media: { type: 'screen', clauses: [{ min: 600 }] } }),
    'responsive-second': () =>
      register('responsive-second', { priority: 900, media: { type: 'screen', clauses: [{ min: 600 }] } }),
    'responsive-high': () =>
      register('responsive-high', { priority: 1000, media: { type: 'screen', clauses: [{ max: 599.98 }] } }),
  } as const;

  order.forEach(key => definitions[key as keyof typeof definitions]());
  return registry;
}

describe('compareOwnedCssRules', () => {
  test('orders base rules first, then descending priority, then identifier', () => {
    const registry = registerRules([
      'responsive-low',
      'responsive-second',
      'base-zeta',
      'responsive-high',
      'base-alpha',
      'responsive-first',
    ]);

    expect(registry.rules().map(rule => rule.id)).toEqual([
      ids.baseAlpha,
      ids.baseZeta,
      ids.responsiveHigh,
      ids.responsiveFirst,
      ids.responsiveSecond,
      ids.responsiveLow,
    ]);
  });

  test.each([
    [['base-alpha', 'responsive-high', 'responsive-second', 'responsive-low', 'base-zeta', 'responsive-first']],
    [['responsive-first', 'base-zeta', 'responsive-low', 'responsive-high', 'base-alpha', 'responsive-second']],
  ] as const)('does not use registration order for %j', order => {
    expect(
      registerRules(order)
        .rules()
        .map(rule => rule.id),
    ).toEqual([
      ids.baseAlpha,
      ids.baseZeta,
      ids.responsiveHigh,
      ids.responsiveFirst,
      ids.responsiveSecond,
      ids.responsiveLow,
    ]);
  });

  test('uses the digest as a deterministic tie-breaker for equal priority and declarations', () => {
    const first: OwnedCssRule = {
      owner: 'flex-layout-codemod',
      id: ids.responsiveSecond,
      className: `flm-${ids.responsiveSecond}`,
      family: 'layout-gap',
      declarations: [{ property: 'gap', value: '1rem' }],
      context: { priority: 900, media: { type: 'screen', clauses: [{ min: 600 }] } },
    };
    const second: OwnedCssRule = { ...first, id: ids.responsiveFirst, className: `flm-${ids.responsiveFirst}` };

    expect([first, second].sort(compareOwnedCssRules).map(rule => rule.id)).toEqual([
      ids.responsiveFirst,
      ids.responsiveSecond,
    ]);
  });

  test('uses code-unit ordering rather than locale collation for identifier ties', () => {
    const uppercase: OwnedCssRule = {
      owner: 'flex-layout-codemod',
      id: 'Z',
      className: 'flm-Z',
      family: 'layout-gap',
      declarations: [{ property: 'gap', value: '1rem' }],
      context: { priority: 0 },
    };
    const lowercase: OwnedCssRule = { ...uppercase, id: 'a', className: 'flm-a' };

    expect([lowercase, uppercase].sort(compareOwnedCssRules).map(rule => rule.id)).toEqual(['Z', 'a']);
  });

  test('returns a frozen ordered array without changing future registry results', () => {
    const registry = registerRules(['responsive-low', 'base-zeta', 'base-alpha']);
    const rules = registry.rules();

    expect(Object.isFrozen(rules)).toBe(true);
    expect(rules.map(rule => rule.id)).toEqual([ids.baseAlpha, ids.baseZeta, ids.responsiveLow]);
    expect(registry.rules().map(rule => rule.id)).toEqual([ids.baseAlpha, ids.baseZeta, ids.responsiveLow]);
  });
});
