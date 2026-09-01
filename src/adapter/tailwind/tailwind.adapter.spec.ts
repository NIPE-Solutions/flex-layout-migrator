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
    [{ breakpoint: 'cinema', sourceName: 'fxLayout.cinema' }, 'review', 'custom-breakpoint'],
    [{ directive: 'fxShow', sourceName: 'fxShow' }, 'unsupported', 'target-unsupported'],
    [{ value: 'diagonal' }, 'invalid', 'invalid-value'],
  ] as const)('classifies unresolved input %o', (overrides, status, code) => {
    expect(new TailwindAdapter().plan(input(overrides), { element })).toMatchObject({ status, code });
  });

  test('decorates verified responsive classes after planning their literal value semantics', () => {
    expect(
      new TailwindAdapter().plan(
        input({ directive: 'fxFlexAlign', sourceName: 'fxFlexAlign.sm', breakpoint: 'sm', value: 'center' }),
        {
          element,
        },
      ),
    ).toMatchObject({
      status: 'converted',
      classNames: ['[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:self-center'],
    });
  });

  test('classifies invalid property-bound values as dynamic bindings', () => {
    expect(
      new TailwindAdapter().plan(
        input({
          directive: 'fxFlexAlign',
          sourceName: '[fxFlexAlign.sm]',
          binding: 'property',
          breakpoint: 'sm',
          value: 'diagonal',
        }),
        { element },
      ),
    ).toMatchObject({ status: 'review', code: 'dynamic-binding' });
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

  test('preserves every responsive family member when one generated token conflicts', () => {
    const adapter = new TailwindAdapter();
    const inputs = [
      input({
        id: 'fixture:xs',
        sourceName: 'fxFlexAlign.xs',
        directive: 'fxFlexAlign',
        breakpoint: 'xs',
        value: 'start',
      }),
      input({
        id: 'fixture:sm',
        sourceName: 'fxFlexAlign.sm',
        directive: 'fxFlexAlign',
        breakpoint: 'sm',
        value: 'end',
      }),
    ];
    const plans = adapter.planElement(inputs, { element, inputs });

    expect(
      adapter.resolveClassConflicts(plans, [
        '[@media_screen_and_(min-width:_0px)_and_(max-width:_599.98px)]:self-center',
      ]),
    ).toEqual([
      expect.objectContaining({ status: 'review', code: 'class-conflict' }),
      expect.objectContaining({ status: 'review', code: 'class-conflict' }),
    ]);
  });

  test('keeps a responsive family converted when an existing bounded utility is disjoint', () => {
    const adapter = new TailwindAdapter();
    const responsive = input({
      id: 'fixture:sm',
      sourceName: 'fxFlexAlign.sm',
      directive: 'fxFlexAlign',
      breakpoint: 'sm',
      value: 'end',
    });
    const plans = adapter.planElement([responsive], { element, inputs: [responsive] });

    expect(
      adapter.resolveClassConflicts(plans, [
        '[@media_screen_and_(min-width:_0px)_and_(max-width:_599.98px)]:self-center',
      ]),
    ).toEqual([expect.objectContaining({ status: 'converted' })]);
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
