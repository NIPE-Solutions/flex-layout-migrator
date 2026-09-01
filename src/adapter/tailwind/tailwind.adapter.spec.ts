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
    [{ directive: 'fxShow', sourceName: 'fxShow' }, 'review', 'context-unverified'],
    [{ value: 'diagonal' }, 'invalid', 'invalid-value'],
  ] as const)('classifies unresolved input %o', (overrides, status, code) => {
    expect(new TailwindAdapter().plan(input(overrides), { element })).toMatchObject({ status, code });
  });

  test('plans a complete static and responsive visibility family through the dedicated state pipeline', () => {
    const adapter = new TailwindAdapter();
    const inputs = [
      input({ id: 'fixture:show', directive: 'fxShow', sourceName: 'fxShow', value: 'false' }),
      input({
        id: 'fixture:show-sm',
        directive: 'fxShow',
        sourceName: 'fxShow.sm',
        breakpoint: 'sm',
        value: '',
      }),
    ];

    expect(adapter.planElement(inputs, { element, inputs, existingClassNames: ['block'] })).toEqual([
      expect.objectContaining({ status: 'converted', classNames: ['hidden', expect.stringContaining(']:block')] }),
      expect.objectContaining({ status: 'converted', classNames: [] }),
    ]);
  });

  test('uses converted layout display as responsive visibility restoration', () => {
    const adapter = new TailwindAdapter();
    const inputs = [
      input({ id: 'fixture:layout', directive: 'fxLayout', sourceName: 'fxLayout', value: 'column' }),
      input({ id: 'fixture:show', directive: 'fxShow', sourceName: 'fxShow', value: 'false' }),
      input({
        id: 'fixture:show-sm',
        directive: 'fxShow',
        sourceName: 'fxShow.sm',
        breakpoint: 'sm',
        value: '',
      }),
    ];

    expect(adapter.planElement(inputs, { element, inputs, existingClassNames: [] })).toEqual([
      expect.objectContaining({ status: 'converted', classNames: ['flex', 'flex-col', 'box-border'] }),
      expect.objectContaining({ status: 'converted', classNames: ['hidden', expect.stringContaining(']:flex')] }),
      expect.objectContaining({ status: 'converted', classNames: [] }),
    ]);
  });

  test.each([
    ['xs', '[@media_screen_and_(min-width:_0px)_and_(max-width:_599.98px)]:flex'],
    ['sm', '[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:flex'],
    ['md', '[@media_screen_and_(min-width:_960px)_and_(max-width:_1279.98px)]:flex'],
    ['lg', '[@media_screen_and_(min-width:_1280px)_and_(max-width:_1919.98px)]:flex'],
    ['xl', '[@media_screen_and_(min-width:_1920px)_and_(max-width:_4999.98px)]:flex'],
    ['lt-sm', '[@media_screen_and_(max-width:_599.98px)]:flex'],
    ['lt-md', '[@media_screen_and_(max-width:_959.98px)]:flex'],
    ['lt-lg', '[@media_screen_and_(max-width:_1279.98px)]:flex'],
    ['lt-xl', '[@media_screen_and_(max-width:_1919.98px)]:flex'],
    ['gt-xs', '[@media_screen_and_(min-width:_600px)]:flex'],
    ['gt-sm', '[@media_screen_and_(min-width:_960px)]:flex'],
    ['gt-md', '[@media_screen_and_(min-width:_1280px)]:flex'],
    ['gt-lg', '[@media_screen_and_(min-width:_1920px)]:flex'],
  ] as const)(
    'routes literal ngClass and ngStyle %s families through exact extended conversion',
    (alias, className) => {
      const classMember = input({
        id: `fixture:ngClass.${alias}`,
        directive: 'ngClass',
        sourceName: `ngClass.${alias}`,
        breakpoint: alias,
        value: 'flex',
      });
      const styleMember = input({
        id: `fixture:ngStyle.${alias}`,
        directive: 'ngStyle',
        sourceName: `ngStyle.${alias}`,
        breakpoint: alias,
        value: 'color:red',
      });

      expect(
        new TailwindAdapter().planElement([classMember, styleMember], { element, inputs: [classMember, styleMember] }),
      ).toEqual([
        { status: 'converted', input: classMember, classNames: [className] },
        { status: 'converted', input: styleMember, classNames: [className.replace(/:flex$/u, ':[color:red]')] },
      ]);
    },
  );

  test('routes literal responsive style declarations through the real extended producer', () => {
    const member = input({
      id: 'fixture:ngStyle.lt-md',
      directive: 'ngStyle',
      sourceName: 'ngStyle.lt-md',
      breakpoint: 'lt-md',
      value: 'font-size.px: 14; color: #334155',
    });

    expect(new TailwindAdapter().planElement([member], { element, inputs: [member] })).toEqual([
      {
        status: 'converted',
        input: member,
        classNames: [
          '[@media_screen_and_(max-width:_959.98px)]:[font-size:14px]',
          '[@media_screen_and_(max-width:_959.98px)]:[color:#334155]',
        ],
      },
    ]);
  });

  test('keeps standalone extended planning context-unverified while retaining intrinsic diagnostics', () => {
    const convertible = input({
      directive: 'ngClass',
      sourceName: 'ngClass.sm',
      breakpoint: 'sm',
      value: 'flex',
    });
    const applicationClass = input({ ...convertible, value: 'card' });

    expect(new TailwindAdapter().plan(convertible, { element })).toMatchObject({
      status: 'review',
      code: 'context-unverified',
    });
    expect(new TailwindAdapter().plan(applicationClass, { element })).toMatchObject({
      status: 'review',
      code: 'tailwind-candidate-unverified',
    });
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
