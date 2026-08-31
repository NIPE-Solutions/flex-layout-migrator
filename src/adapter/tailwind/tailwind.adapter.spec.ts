import type { LocatedFlexLayoutInput } from '../../analyzer/flex-layout-attribute.analyzer';
import type { TemplateElement } from '../../template/template.model';
import { TailwindAdapter } from './tailwind.adapter';

const element: TemplateElement = {
  id: '0',
  name: 'div',
  startTag: { start: 0, end: 5 },
  attributes: [],
};

function input(overrides: Partial<LocatedFlexLayoutInput> = {}): LocatedFlexLayoutInput {
  return {
    id: 'fixture:0',
    fileName: 'fixture.html',
    elementId: '0',
    sourceName: 'fxLayout',
    directive: 'fxLayout',
    value: 'row',
    binding: 'literal',
    breakpoint: undefined,
    source: { start: 0, end: 14 },
    nameSource: { start: 0, end: 8 },
    ...overrides,
  };
}

describe('TailwindAdapter', () => {
  test('returns a complete class plan for a supported static input', () => {
    expect(new TailwindAdapter().plan(input(), { element })).toEqual({
      status: 'converted',
      input: input(),
      classNames: ['flex', 'flex-row', 'box-border'],
    });
  });

  test.each([
    [{ binding: 'property' }, 'review', 'dynamic-binding'],
    [{ breakpoint: 'sm', sourceName: 'fxLayout.sm' }, 'review', 'breakpoint-unverified'],
    [{ breakpoint: 'cinema', sourceName: 'fxLayout.cinema' }, 'review', 'custom-breakpoint'],
    [{ directive: 'fxShow', sourceName: 'fxShow' }, 'unsupported', 'target-unsupported'],
    [{ value: 'diagonal' }, 'invalid', 'invalid-value'],
  ] as const)('classifies unresolved input %o', (overrides, status, code) => {
    expect(new TailwindAdapter().plan(input(overrides), { element })).toMatchObject({ status, code });
  });

  test('uses upstream px units instead of the Tailwind spacing scale for gaps', () => {
    expect(new TailwindAdapter().plan(input({ directive: 'fxLayoutGap', value: '4' }), { element })).toMatchObject({
      status: 'converted',
      classNames: ['gap-[4px]'],
    });
  });

  test('preserves the Flex-Layout grid gap algorithm for review', () => {
    expect(new TailwindAdapter().plan(input({ directive: 'fxLayoutGap', value: '4 grid' }), { element })).toMatchObject(
      { status: 'review', code: 'semantic-unsupported' },
    );
  });

  test('uses exact upstream flex sizing when planning a standalone fxFlex input', () => {
    expect(new TailwindAdapter().plan(input({ directive: 'fxFlex', value: '25' }), { element })).toMatchObject({
      status: 'converted',
      classNames: ['[flex:1_1_100%]', '[max-width:25%]', 'box-border'],
    });
  });

  test.each([
    ['fxFlexAlign', 'end', ['self-end']],
    ['fxFlexFill', '', ['m-0', 'w-full', 'h-full', 'min-w-full', 'min-h-full']],
    ['fxFill', '', ['m-0', 'w-full', 'h-full', 'min-w-full', 'min-h-full']],
    ['fxFlexOffset', '4', ['ms-[4%]']],
    ['fxFlexOrder', '2', ['[order:2]']],
  ] as const)('plans exact independent %s semantics', (directive, value, classNames) => {
    expect(new TailwindAdapter().plan(input({ directive, value }), { element })).toMatchObject({
      status: 'converted',
      classNames,
    });
  });
});
