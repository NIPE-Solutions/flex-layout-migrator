import { BreakpointCatalog, type MediaDefinition } from '../../src/breakpoint/breakpoint-catalog';

function matches(media: MediaDefinition, width: number): boolean {
  return (
    media.type === 'screen' &&
    media.clauses.some(
      clause => (clause.min === undefined || width >= clause.min) && (clause.max === undefined || width <= clause.max),
    )
  );
}

function selected(aliases: readonly string[], width: number): string | undefined {
  const catalog = new BreakpointCatalog();
  return aliases
    .map(alias => catalog.classify(alias))
    .filter(result => result.kind === 'verified')
    .map(result => result.definition)
    .sort((left, right) => right.priority - left.priority)
    .find(definition => matches(definition.media, width))?.alias;
}

describe('native responsive image selection order', () => {
  test.each([
    [320, 'xs'],
    [600, undefined],
    [1000, 'md'],
    [1280, undefined],
  ] as const)('selects bounded xs/md equivalently at %dpx', (width, expected) => {
    expect(selected(['xs', 'md'], width)).toBe(expected);
  });

  test.each([
    [320, 'xs'],
    [700, 'lt-md'],
    [1000, 'gt-xs'],
  ] as const)('reproduces overlap priority at %dpx', (width, expected) => {
    expect(selected(['gt-xs', 'lt-md', 'xs'], width)).toBe(expected);
  });
});
