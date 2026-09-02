import { parsePrintWithBreakpoints } from './breakpoint-migration-config';

describe('parsePrintWithBreakpoints', () => {
  test('accepts an explicit empty print list', () => {
    expect(parsePrintWithBreakpoints('none', false)).toEqual([]);
  });

  test('normalizes a comma-separated standard alias list', () => {
    expect(parsePrintWithBreakpoints(' md, gt-sm ', false)).toEqual(['md', 'gt-sm']);
  });

  test('accepts orientation aliases only when orientation breakpoints are enabled', () => {
    expect(parsePrintWithBreakpoints('handset,web.portrait', true)).toEqual(['handset', 'web.portrait']);
    expect(() => parsePrintWithBreakpoints('handset', false)).toThrow(
      'Orientation breakpoint alias handset requires --orientation-breakpoints',
    );
  });

  test.each([
    ['', 'Print breakpoint aliases must not be empty'],
    ['md,md', 'Print breakpoint list contains duplicate alias md'],
    ['print', 'Print breakpoint list must not contain print'],
    ['cinema', 'Unknown breakpoint alias cinema'],
    ['none,md', 'The literal none cannot be combined with breakpoint aliases'],
  ])('rejects invalid value %j', (value, message) => {
    expect(() => parsePrintWithBreakpoints(value, true)).toThrow(message);
  });
});
