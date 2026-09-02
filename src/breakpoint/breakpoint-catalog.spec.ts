import { BreakpointCatalog, mediaDefinitionsIntersect, mediaRangesIntersect } from './breakpoint-catalog';

describe('BreakpointCatalog', () => {
  const cases = [
    ['xs', 0, 599.98, 1000],
    ['sm', 600, 959.98, 900],
    ['md', 960, 1279.98, 800],
    ['lg', 1280, 1919.98, 700],
    ['xl', 1920, 4999.98, 600],
    ['lt-sm', undefined, 599.98, 950],
    ['lt-md', undefined, 959.98, 850],
    ['lt-lg', undefined, 1279.98, 750],
    ['lt-xl', undefined, 1919.98, 650],
    ['gt-xs', 600, undefined, -950],
    ['gt-sm', 960, undefined, -850],
    ['gt-md', 1280, undefined, -750],
    ['gt-lg', 1920, undefined, -650],
  ] as const;

  test.each(cases)('%s has the exact upstream range', (alias, min, max, priority) => {
    expect(new BreakpointCatalog().classify(alias)).toEqual({
      kind: 'verified',
      definition: {
        alias,
        range: { min, max },
        media: { type: 'screen', clauses: [{ min, max }] },
        priority,
      },
    });
  });

  test('classifies optional, print, and custom aliases exhaustively', () => {
    const catalog = new BreakpointCatalog();

    expect(catalog.classify('handset')).toEqual({ kind: 'optional', alias: 'handset' });
    expect(catalog.classify('print')).toEqual({ kind: 'print', alias: 'print' });
    expect(catalog.classify('cinema')).toEqual({ kind: 'custom', alias: 'cinema' });
  });

  test.each([
    ['handset.portrait', [{ max: 599.98, orientation: 'portrait' }], 2000],
    ['handset.landscape', [{ max: 959.98, orientation: 'landscape' }], 2000],
    [
      'handset',
      [
        { max: 599.98, orientation: 'portrait' },
        { max: 959.98, orientation: 'landscape' },
      ],
      2000,
    ],
    ['tablet.portrait', [{ min: 600, max: 839.98, orientation: 'portrait' }], 2100],
    ['tablet.landscape', [{ min: 960, max: 1279.98, orientation: 'landscape' }], 2100],
    [
      'tablet',
      [
        { min: 600, max: 839.98, orientation: 'portrait' },
        { min: 960, max: 1279.98, orientation: 'landscape' },
      ],
      2100,
    ],
    ['web.portrait', [{ min: 840, orientation: 'portrait' }], 2200],
    ['web.landscape', [{ min: 1280, orientation: 'landscape' }], 2200],
    [
      'web',
      [
        { min: 840, orientation: 'portrait' },
        { min: 1280, orientation: 'landscape' },
      ],
      2200,
    ],
  ] as const)('%s has the exact opt-in orientation definition', (alias, clauses, priority) => {
    expect(new BreakpointCatalog({ orientationBreakpoints: true }).classify(alias)).toEqual({
      kind: 'verified',
      definition: { alias, range: clauses[0], media: { type: 'screen', clauses }, priority },
    });
  });

  test('verifies print only when its source configuration is explicit', () => {
    expect(new BreakpointCatalog().classify('print')).toEqual({ kind: 'print', alias: 'print' });
    expect(
      new BreakpointCatalog({ orientationBreakpoints: false, printWithBreakpoints: [] }).classify('print'),
    ).toEqual({
      kind: 'verified',
      definition: { alias: 'print', range: {}, media: { type: 'print', clauses: [{}] }, priority: 1000 },
    });
  });
});

describe('mediaDefinitionsIntersect', () => {
  const screen = (...clauses: Parameters<typeof mediaDefinitionsIntersect>[0]['clauses']) => ({
    type: 'screen' as const,
    clauses,
  });

  test('requires compatible orientation and width in at least one clause pair', () => {
    expect(mediaDefinitionsIntersect(screen({ max: 599.98, orientation: 'portrait' }), screen({ min: 500 }))).toBe(
      true,
    );
    expect(
      mediaDefinitionsIntersect(
        screen({ max: 599.98, orientation: 'portrait' }),
        screen({ max: 959.98, orientation: 'landscape' }),
      ),
    ).toBe(false);
  });

  test('keeps print disjoint from screen', () => {
    expect(mediaDefinitionsIntersect({ type: 'print', clauses: [{}] }, screen({}))).toBe(false);
  });
});

describe('mediaRangesIntersect', () => {
  test('treats touching bounds as intersecting', () => {
    expect(mediaRangesIntersect({ min: 600, max: 960 }, { min: 960, max: 1279.98 })).toBe(true);
  });

  test('treats separated bounds as disjoint', () => {
    expect(mediaRangesIntersect({ min: 600, max: 959.98 }, { min: 960, max: 1279.98 })).toBe(false);
  });

  test('handles open-ended ranges as infinities', () => {
    expect(mediaRangesIntersect({ max: 599.98 }, { min: 600 })).toBe(false);
    expect(mediaRangesIntersect({ max: 599.98 }, { min: 599.98 })).toBe(true);
    expect(mediaRangesIntersect({ min: 1280 }, { min: 1920 })).toBe(true);
  });
});
