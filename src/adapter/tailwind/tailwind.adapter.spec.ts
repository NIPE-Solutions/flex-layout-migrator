import type { LocatedFlexLayoutInput } from '../../analyzer/flex-layout-attribute.analyzer';
import type { TemplateElement } from '../../template/template.model';
import { TailwindAdapter } from './tailwind.adapter';

const element: TemplateElement = {
  id: '0',
  name: 'div',
  source: { start: 0, end: 5 },
  startTag: { start: 0, end: 5 },
  structural: false,
  attributes: [],
};
const parent: TemplateElement = {
  id: 'parent',
  name: 'section',
  source: { start: 0, end: 9 },
  startTag: { start: 0, end: 9 },
  structural: false,
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

  test('preserves explicit inline layout semantics through adapter rendering', () => {
    const layout = input({ value: 'column wrap inline' });

    expect(new TailwindAdapter().plan(layout, { element })).toEqual({
      status: 'converted',
      input: layout,
      classNames: ['inline-flex', 'flex-col', 'flex-wrap', 'box-border'],
    });
  });

  test('converts a literal Grid directive through exact arbitrary properties', () => {
    const gridInput = input({
      directive: 'gdColumns',
      sourceName: 'gdColumns',
      value: '[first] 1fr [last]',
    });

    expect(
      new TailwindAdapter().plan(gridInput, {
        element,
        parent,
        parentInputs: [input({ id: 'parent:grid', elementId: 'parent', directive: 'gdColumns', value: '1fr' })],
      }),
    ).toEqual({
      status: 'converted',
      input: gridInput,
      classNames: ['grid', '[grid-template-columns:[first]_1fr_[last]]'],
    });
  });

  test('preserves a child Grid directive without proven parent Grid context', () => {
    const gridInput = input({ directive: 'gdRow', sourceName: 'gdRow', value: '1' });

    expect(new TailwindAdapter().plan(gridInput, { element, parentInputs: [] })).toMatchObject({
      status: 'review',
      code: 'context-unverified',
    });
  });

  test('decorates a literal responsive Grid directive with the verified media variant', () => {
    const gridInput = input({
      directive: 'gdColumn',
      sourceName: 'gdColumn.sm',
      breakpoint: 'sm',
      value: '1 / span 2',
    });

    expect(
      new TailwindAdapter().plan(gridInput, {
        element,
        parent,
        parentInputs: [input({ id: 'parent:grid', elementId: 'parent', directive: 'gdRows', value: 'auto' })],
      }),
    ).toEqual({
      status: 'converted',
      input: gridInput,
      classNames: ['[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:[grid-column:1_/_span_2]'],
    });
  });

  test('converts explicitly enabled composite orientation breakpoints', () => {
    const member = input({ sourceName: 'fxLayout.handset', breakpoint: 'handset', value: 'column' });

    expect(
      new TailwindAdapter({ orientationBreakpoints: true }).planElement([member], {
        element,
        inputs: [member],
      }),
    ).toEqual([
      {
        status: 'converted',
        input: member,
        classNames: [
          '[@media_(orientation:_portrait)_and_(max-width:_599.98px)]:flex',
          '[@media_(orientation:_landscape)_and_(max-width:_959.98px)]:flex',
          '[@media_(orientation:_portrait)_and_(max-width:_599.98px)]:flex-col',
          '[@media_(orientation:_landscape)_and_(max-width:_959.98px)]:flex-col',
          '[@media_(orientation:_portrait)_and_(max-width:_599.98px)]:box-border',
          '[@media_(orientation:_landscape)_and_(max-width:_959.98px)]:box-border',
        ],
      },
    ]);
  });

  test('converts different values in disjoint portrait and landscape activations', () => {
    const portrait = input({
      id: 'fixture:portrait',
      sourceName: 'fxLayout.handset.portrait',
      breakpoint: 'handset.portrait',
      value: 'column',
    });
    const landscape = input({
      id: 'fixture:landscape',
      sourceName: 'fxLayout.handset.landscape',
      breakpoint: 'handset.landscape',
      value: 'row',
    });

    const plans = new TailwindAdapter({ orientationBreakpoints: true }).planElement([portrait, landscape], {
      element,
      inputs: [portrait, landscape],
    });

    expect(plans).toEqual([
      expect.objectContaining({ status: 'converted' }),
      expect.objectContaining({ status: 'converted' }),
    ]);
  });

  test('preserves differing values in intersecting composite and specific orientation aliases', () => {
    const handset = input({
      id: 'fixture:handset',
      sourceName: 'fxLayout.handset',
      breakpoint: 'handset',
      value: 'column',
    });
    const portrait = input({
      id: 'fixture:portrait',
      sourceName: 'fxLayout.handset.portrait',
      breakpoint: 'handset.portrait',
      value: 'row',
    });

    expect(
      new TailwindAdapter({ orientationBreakpoints: true }).planElement([handset, portrait], {
        element,
        inputs: [handset, portrait],
      }),
    ).toEqual([
      expect.objectContaining({ status: 'review', code: 'responsive-precedence-unverified' }),
      expect.objectContaining({ status: 'review', code: 'responsive-precedence-unverified' }),
    ]);
  });

  test('converts orientation visibility, responsive class, and responsive style families', () => {
    const hidden = input({
      id: 'fixture:hidden',
      directive: 'fxShow',
      sourceName: 'fxShow',
      value: 'false',
    });
    const shown = input({
      id: 'fixture:shown',
      directive: 'fxShow',
      sourceName: 'fxShow.handset.portrait',
      breakpoint: 'handset.portrait',
      value: '',
    });
    const responsiveClass = input({
      id: 'fixture:class',
      directive: 'ngClass',
      sourceName: 'ngClass.handset.landscape',
      breakpoint: 'handset.landscape',
      value: 'flex',
    });
    const responsiveStyle = input({
      id: 'fixture:style',
      directive: 'ngStyle',
      sourceName: 'ngStyle.web.portrait',
      breakpoint: 'web.portrait',
      value: 'color:red',
    });

    const adapter = new TailwindAdapter({ orientationBreakpoints: true });

    expect(
      adapter.planElement([hidden, shown], {
        element,
        inputs: [hidden, shown],
        existingClassNames: ['block'],
      }),
    ).toEqual([
      expect.objectContaining({
        status: 'converted',
        classNames: ['hidden', '[@media_(orientation:_portrait)_and_(max-width:_599.98px)]:block'],
      }),
      expect.objectContaining({ status: 'converted', classNames: [] }),
    ]);
    expect(adapter.planElement([responsiveClass], { element, inputs: [responsiveClass] })).toEqual([
      expect.objectContaining({
        status: 'converted',
        classNames: ['[@media_(orientation:_landscape)_and_(max-width:_959.98px)]:flex'],
      }),
    ]);
    expect(adapter.planElement([responsiveStyle], { element, inputs: [responsiveStyle] })).toEqual([
      expect.objectContaining({
        status: 'converted',
        classNames: ['[@media_(orientation:_portrait)_and_(min-width:_840px)]:[color:red]'],
      }),
    ]);
  });

  test('emits a configured responsive value as the effective print fallback', () => {
    const base = input({ id: 'fixture:base', value: 'row' });
    const md = input({
      id: 'fixture:md',
      sourceName: 'fxLayout.md',
      breakpoint: 'md',
      value: 'column',
    });

    const plans = new TailwindAdapter({
      orientationBreakpoints: false,
      printWithBreakpoints: ['md'],
    }).planElement([base, md], { element, inputs: [base, md] });

    expect(plans[0]).toMatchObject({ status: 'converted', classNames: ['flex', 'flex-row', 'box-border'] });
    expect(plans[1]).toMatchObject({
      status: 'converted',
      classNames: expect.arrayContaining([
        '[@media_print]:flex',
        '[@media_print]:flex-col',
        '[@media_print]:box-border',
      ]),
    });
  });

  test('lets an explicit print value override configured responsive fallbacks', () => {
    const md = input({ id: 'fixture:md', sourceName: 'fxLayout.md', breakpoint: 'md', value: 'column' });
    const print = input({ id: 'fixture:print', sourceName: 'fxLayout.print', breakpoint: 'print', value: 'row' });

    const plans = new TailwindAdapter({
      orientationBreakpoints: false,
      printWithBreakpoints: ['md'],
    }).planElement([md, print], { element, inputs: [md, print] });

    expect(plans[0]).toMatchObject({ status: 'converted' });
    expect(plans[0]?.status === 'converted' ? plans[0].classNames : []).not.toContain('[@media_print]:flex-col');
    expect(plans[1]).toMatchObject({
      status: 'converted',
      classNames: ['[@media_print]:flex', '[@media_print]:flex-row', '[@media_print]:box-border'],
    });
  });

  test('uses the highest-priority configured responsive value during print', () => {
    const md = input({ id: 'fixture:md', sourceName: 'fxLayout.md', breakpoint: 'md', value: 'row' });
    const handset = input({
      id: 'fixture:handset',
      sourceName: 'fxLayout.handset',
      breakpoint: 'handset',
      value: 'column',
    });

    const plans = new TailwindAdapter({
      orientationBreakpoints: true,
      printWithBreakpoints: ['md', 'handset'],
    }).planElement([md, handset], { element, inputs: [md, handset] });

    expect(plans[1]).toMatchObject({
      status: 'converted',
      classNames: expect.arrayContaining(['[@media_print]:flex-col']),
    });
    expect(plans[0]?.status === 'converted' ? plans[0].classNames : []).not.toContain('[@media_print]:flex-row');
  });

  test('adds print fallbacks for responsive class, style, and Grid families', () => {
    const responsiveClass = input({
      id: 'fixture:class',
      directive: 'ngClass',
      sourceName: 'ngClass.md',
      breakpoint: 'md',
      value: 'flex',
    });
    const responsiveStyle = input({
      id: 'fixture:style',
      directive: 'ngStyle',
      sourceName: 'ngStyle.md',
      breakpoint: 'md',
      value: 'color:red',
    });
    const columns = input({
      id: 'fixture:columns',
      directive: 'gdColumns',
      sourceName: 'gdColumns.md',
      breakpoint: 'md',
      value: '1fr',
    });
    const adapter = new TailwindAdapter({ orientationBreakpoints: false, printWithBreakpoints: ['md'] });

    expect(adapter.planElement([responsiveClass], { element, inputs: [responsiveClass] })[0]).toMatchObject({
      status: 'converted',
      classNames: expect.arrayContaining(['[@media_print]:flex']),
    });
    expect(adapter.planElement([responsiveStyle], { element, inputs: [responsiveStyle] })[0]).toMatchObject({
      status: 'converted',
      classNames: expect.arrayContaining(['[@media_print]:[color:red]']),
    });
    expect(adapter.planElement([columns], { element, inputs: [columns] })[0]).toMatchObject({
      status: 'converted',
      classNames: expect.arrayContaining(['[@media_print]:grid', '[@media_print]:[grid-template-columns:1fr]']),
    });
  });

  test('encodes quoted gdAreas rows without introducing an HTML delimiter collision', () => {
    const gridInput = input({ directive: 'gdAreas', sourceName: 'gdAreas', value: 'header | main' });

    expect(new TailwindAdapter().plan(gridInput, { element })).toEqual({
      status: 'converted',
      input: gridInput,
      classNames: ['grid', "[grid-template-areas:'header'_'main']"],
    });
  });

  test('composes gdInline with container declarations without contradictory display utilities', () => {
    const columns = input({ id: 'fixture:columns', directive: 'gdColumns', sourceName: 'gdColumns', value: '1fr' });
    const inline = input({ id: 'fixture:inline', directive: 'gdInline', sourceName: 'gdInline', value: '' });

    expect(new TailwindAdapter().planElement([columns, inline], { element, inputs: [columns, inline] })).toEqual([
      { status: 'converted', input: columns, classNames: ['[grid-template-columns:1fr]'] },
      { status: 'converted', input: inline, classNames: ['inline-grid'] },
    ]);
  });

  test('emits one shared grid display across multiple container directives', () => {
    const columns = input({ id: 'fixture:columns', directive: 'gdColumns', sourceName: 'gdColumns', value: '1fr' });
    const gap = input({ id: 'fixture:gap', directive: 'gdGap', sourceName: 'gdGap', value: '1rem' });

    expect(new TailwindAdapter().planElement([columns, gap], { element, inputs: [columns, gap] })).toEqual([
      { status: 'converted', input: columns, classNames: ['grid', '[grid-template-columns:1fr]'] },
      { status: 'converted', input: gap, classNames: ['[grid-gap:1rem]'] },
    ]);
  });

  test('preserves a complete Grid directive family when one responsive member is dynamic', () => {
    const base = input({ id: 'fixture:columns', directive: 'gdColumns', sourceName: 'gdColumns', value: '1fr' });
    const dynamic = input({
      id: 'fixture:columns-sm',
      directive: 'gdColumns',
      sourceName: '[gdColumns.sm]',
      breakpoint: 'sm',
      binding: 'property',
      value: 'columns',
    });

    expect(new TailwindAdapter().planElement([base, dynamic], { element, inputs: [base, dynamic] })).toEqual([
      expect.objectContaining({ status: 'review', code: 'context-unverified' }),
      expect.objectContaining({ status: 'review', code: 'dynamic-binding' }),
    ]);
  });

  test('preserves every display-dependent Grid container when one container input is unresolved', () => {
    const columns = input({ id: 'fixture:columns', directive: 'gdColumns', sourceName: 'gdColumns', value: '1fr' });
    const dynamicGap = input({
      id: 'fixture:gap',
      directive: 'gdGap',
      sourceName: '[gdGap]',
      binding: 'property',
      value: 'gap',
    });

    expect(
      new TailwindAdapter().planElement([columns, dynamicGap], { element, inputs: [columns, dynamicGap] }),
    ).toEqual([
      expect.objectContaining({ status: 'review', code: 'context-unverified' }),
      expect.objectContaining({ status: 'review', code: 'dynamic-binding' }),
    ]);
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
