import { BreakpointCatalog, type MediaDefinition } from '../../breakpoint/breakpoint-catalog';
import { cssRuleContext } from './css-breakpoint.context';
import { CssInvariantError } from './css-invariant.error';
import { CssArtifactRegistry } from './css-artifact.registry';

const viewportMedia: MediaDefinition = {
  type: 'screen',
  clauses: [{ min: 600, max: 959.98, orientation: 'landscape' }],
};

describe('CssArtifactRegistry', () => {
  test('registers a base rule with the canonical SHA-256 class name', () => {
    const rule = new CssArtifactRegistry().register('layout', [{ property: 'display', value: 'flex' }]);

    expect(rule).toEqual({
      owner: 'flex-layout-codemod',
      id: 'adfe22f4b447241ec535540d3638405b3d08ee49fda39beaf07563e450256a61',
      className: 'flm-adfe22f4b447241ec535540d3638405b3d08ee49fda39beaf07563e450256a61',
      family: 'layout',
      declarations: [{ property: 'display', value: 'flex' }],
      context: { priority: 0 },
    });
    expect(rule.className).toMatch(/^flm-[a-f0-9]{64}$/);
  });

  test('keeps canonical identities stable across registry instances', () => {
    const declarations = [{ property: 'display', value: 'flex' }] as const;
    const first = new CssArtifactRegistry().register('layout', declarations);
    const second = new CssArtifactRegistry().register('layout', declarations);

    expect(second).toEqual(first);
  });

  test('treats declaration order as part of a rule identity', () => {
    const registry = new CssArtifactRegistry();
    const first = registry.register('layout', [
      { property: 'display', value: 'flex' },
      { property: 'flex-direction', value: 'row' },
    ]);
    const second = registry.register('layout', [
      { property: 'flex-direction', value: 'row' },
      { property: 'display', value: 'flex' },
    ]);

    expect(second.className).not.toBe(first.className);
  });

  test('treats normalized media and priority as part of a rule identity', () => {
    const registry = new CssArtifactRegistry();
    const base = registry.register('layout-gap', [{ property: 'gap', value: '1rem' }]);
    const responsive = registry.register('layout-gap', [{ property: 'gap', value: '1rem' }], {
      media: viewportMedia,
      priority: 900,
    });

    expect(responsive.className).not.toBe(base.className);
    expect(responsive.context).toEqual({ media: viewportMedia, priority: 900 });
  });

  test('accepts a defensive context copied from a verified breakpoint definition', () => {
    const breakpoint = new BreakpointCatalog().classify('sm');
    if (breakpoint.kind !== 'verified') throw new Error('Expected sm to be verified');

    const rule = new CssArtifactRegistry().register(
      'layout-gap',
      [{ property: 'gap', value: '1rem' }],
      cssRuleContext(breakpoint.definition),
    );

    expect(rule.context).toEqual({
      priority: 900,
      media: { type: 'screen', clauses: [{ min: 600, max: 959.98 }] },
    });
  });

  test('deduplicates equivalent rules by canonical identity', () => {
    const registry = new CssArtifactRegistry();
    const first = registry.register('layout', [{ property: 'display', value: 'flex' }]);
    const second = registry.register('layout', [{ property: 'display', value: 'flex' }]);

    expect(second).toBe(first);
    expect(registry.rules()).toEqual([first]);
  });

  test('defensively copies and freezes registered artifacts', () => {
    const declarations = [{ property: 'gap', value: '1rem' }];
    const media = { type: 'screen' as const, clauses: [{ min: 600 }] };
    const context = { priority: 900, media };
    const registry = new CssArtifactRegistry();
    const rule = registry.register('layout-gap', declarations, context);
    const snapshot = registry.rules();

    declarations[0]!.value = '2rem';
    media.clauses[0]!.min = 700;
    context.priority = 0;

    expect(rule).toMatchObject({
      declarations: [{ property: 'gap', value: '1rem' }],
      context: { priority: 900, media: { type: 'screen', clauses: [{ min: 600 }] } },
    });
    expect(Object.isFrozen(rule)).toBe(true);
    expect(Object.isFrozen(rule.declarations)).toBe(true);
    expect(Object.isFrozen(rule.declarations[0])).toBe(true);
    expect(Object.isFrozen(rule.context)).toBe(true);
    expect(Object.isFrozen(rule.context.media)).toBe(true);
    expect(Object.isFrozen(rule.context.media?.clauses)).toBe(true);
    expect(Object.isFrozen(rule.context.media?.clauses[0])).toBe(true);
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  test('rejects duplicate declaration properties', () => {
    const registry = new CssArtifactRegistry();

    expect(() =>
      registry.register('layout', [
        { property: 'display', value: 'flex' },
        { property: 'display', value: 'inline-flex' },
      ]),
    ).toThrow(CssInvariantError);
  });

  test.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects a non-finite media bound of %s',
    bound => {
      const registry = new CssArtifactRegistry();

      expect(() =>
        registry.register('layout-gap', [{ property: 'gap', value: '1rem' }], {
          priority: 900,
          media: { type: 'screen', clauses: [{ min: bound }] },
        }),
      ).toThrow(CssInvariantError);
    },
  );

  test.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects a non-finite rule priority of %s',
    priority => {
      const registry = new CssArtifactRegistry();

      expect(() =>
        registry.register('layout-gap', [{ property: 'gap', value: '1rem' }], {
          priority,
          media: viewportMedia,
        }),
      ).toThrow(CssInvariantError);
    },
  );

  test.each([-1, 1])('rejects a base rule with nonzero priority %s', priority => {
    const registry = new CssArtifactRegistry();

    expect(() => registry.register('layout-gap', [{ property: 'gap', value: '1rem' }], { priority })).toThrow(
      CssInvariantError,
    );
  });

  test('rejects malformed digest output', () => {
    const registry = new CssArtifactRegistry(() => 'not-a-sha256-digest');

    expect(() => registry.register('layout', [{ property: 'display', value: 'flex' }])).toThrow(CssInvariantError);
  });

  test('rejects a digest collision between different canonical identities', () => {
    const registry = new CssArtifactRegistry(() => 'a'.repeat(64));
    const first = registry.register('layout', [{ property: 'display', value: 'flex' }]);

    expect(first.className).toBe(`flm-${'a'.repeat(64)}`);
    expect(registry.register('layout', [{ property: 'display', value: 'flex' }])).toBe(first);
    expect(() => registry.register('layout-gap', [{ property: 'gap', value: '1rem' }])).toThrow(CssInvariantError);
  });
});
