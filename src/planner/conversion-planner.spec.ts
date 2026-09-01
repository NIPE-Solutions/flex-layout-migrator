import { TailwindAdapter } from '../adapter/tailwind/tailwind.adapter';
import { TemplateAnalyzer } from '../analyzer/template.analyzer';
import { SourceEditor } from '../edit/source-editor';
import { AngularTemplateParser } from '../template/angular-template.parser';
import { ConversionPlanner } from './conversion-planner';

function migrate(source: string) {
  const parsed = new AngularTemplateParser().parse(source, 'fixture.html');
  if (parsed.status !== 'parsed') throw new Error('Expected fixture to parse');
  const inputs = new TemplateAnalyzer().analyze('fixture.html', parsed.elements);
  const plan = new ConversionPlanner().plan(source, parsed.elements, inputs, new TailwindAdapter());
  const edited = new SourceEditor().apply(source, plan.edits);
  if (edited.status !== 'applied') throw new Error('Expected edits to be valid');
  return { ...plan, output: edited.output };
}

describe('ConversionPlanner', () => {
  test('removes a converted input and merges classes into a literal class attribute', () => {
    const result = migrate('<div class="card" fxLayout="row"></div>');

    expect(result.output).toBe('<div class="card flex flex-row box-border"></div>');
    expect(result.results).toEqual([
      expect.objectContaining({
        status: 'converted',
        input: expect.objectContaining({ directive: 'fxLayout' }),
      }),
    ]);
  });

  test('inserts one deterministic class attribute for multiple conversions', () => {
    const result = migrate('<div fxLayout="row" fxLayoutGap="4"></div>');

    expect(result.output).toBe('<div class="flex flex-row box-border gap-[4px]"></div>');
    expect(result.results.map(item => item.status)).toEqual(['converted', 'converted']);
  });

  test('orders generated classes independently of directive source order', () => {
    const forward = migrate('<div fxLayout="row" fxLayoutGap="4"></div>');
    const reversed = migrate('<div fxLayoutGap="4" fxLayout="row"></div>');

    expect(forward.output).toBe('<div class="flex flex-row box-border gap-[4px]"></div>');
    expect(reversed.output).toBe(forward.output);
  });

  test('orders responsive family classes independently of attribute source order', () => {
    const forward = migrate('<div fxFlexAlign.sm="end" fxFlexAlign.xs="start"></div>');
    const reversed = migrate('<div fxFlexAlign.xs="start" fxFlexAlign.sm="end"></div>');

    expect(reversed.output).toBe(forward.output);
  });

  test('inserts classes before the slash in a self-closing custom element', () => {
    const result = migrate('<app-card fxLayout="column"/>');

    expect(result.output).toBe('<app-card class="flex flex-col box-border"/>');
  });

  test('deduplicates classes while preserving their first occurrence', () => {
    const result = migrate('<div class="flex card flex" fxLayout="row"></div>');

    expect(result.output).toBe('<div class="flex card flex-row box-border"></div>');
  });

  test('preserves a directive when an existing Tailwind utility controls the same property', () => {
    const source = '<div class="card flex-col" fxLayout="row"></div>';
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toContainEqual(expect.objectContaining({ status: 'review', code: 'class-conflict' }));
  });

  test.each(['flex-col!', '!flex-col', 'sm:flex-col!'])(
    'preserves a directive when important utility %s controls the same property',
    utility => {
      const source = `<div class="${utility}" fxLayout="row"></div>`;
      const result = migrate(source);

      expect(result.output).toBe(source);
      expect(result.results).toContainEqual(expect.objectContaining({ status: 'review', code: 'class-conflict' }));
    },
  );

  test('preserves the complete flex group when an existing utility conflicts', () => {
    const source = '<div class="flex-none" fxFlex="25" fxGrow="2"></div>';
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toEqual([
      expect.objectContaining({ status: 'review', code: 'class-conflict' }),
      expect.objectContaining({ status: 'review', code: 'class-conflict' }),
    ]);
  });

  test('preserves the complete layout cluster when an existing utility conflicts with its gap', () => {
    const source = '<div class="gap-2" fxLayout="row" fxLayoutGap="4"></div>';
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toEqual([
      expect.objectContaining({
        status: 'review',
        code: 'context-unverified',
        input: expect.objectContaining({ directive: 'fxLayout' }),
      }),
      expect.objectContaining({
        status: 'review',
        code: 'class-conflict',
        input: expect.objectContaining({ directive: 'fxLayoutGap' }),
      }),
    ]);
  });

  test('preserves layout and alignment together after an alignment class conflict', () => {
    const source = '<div class="justify-center" fxLayout="row" fxLayoutAlign="end start"></div>';
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toEqual([
      expect.objectContaining({
        status: 'review',
        code: 'context-unverified',
        input: expect.objectContaining({ directive: 'fxLayout' }),
      }),
      expect.objectContaining({
        status: 'review',
        code: 'class-conflict',
        input: expect.objectContaining({ directive: 'fxLayoutAlign' }),
      }),
    ]);
  });

  test('preserves parent-context consumers after a parent layout class conflict', () => {
    const source = '<div class="flex-col" fxLayout="row"><span fxFlex="50"></span><span fxFlexOffset="4"></span></div>';
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toEqual([
      expect.objectContaining({
        status: 'review',
        code: 'class-conflict',
        input: expect.objectContaining({ directive: 'fxLayout' }),
      }),
      expect.objectContaining({
        status: 'review',
        code: 'context-unverified',
        input: expect.objectContaining({ directive: 'fxFlex' }),
      }),
      expect.objectContaining({
        status: 'review',
        code: 'context-unverified',
        input: expect.objectContaining({ directive: 'fxFlexOffset' }),
      }),
    ]);
  });

  test('preserves the directive when a bound class cannot be merged safely', () => {
    const source = '<div [class]="classes" fxLayout="row"></div>';

    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toContainEqual(
      expect.objectContaining({
        status: 'review',
        code: 'bound-class',
      }),
    );
  });

  test('preserves the directive when literal and bound classes coexist', () => {
    const source = '<div class="card" [class]="classes" fxLayout="row"></div>';
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toContainEqual(expect.objectContaining({ status: 'review', code: 'bound-class' }));
  });

  test.each([
    ['fxShow', '<div fxShow></div>', '<div></div>'],
    ['fxShow false', '<div fxShow="false"></div>', '<div class="hidden"></div>'],
    ['fxHide', '<div fxHide></div>', '<div class="hidden"></div>'],
    ['fxHide false', '<div fxHide="false"></div>', '<div></div>'],
  ])('converts static visibility semantics for %s', (_case, source, expected) => {
    const result = migrate(source);

    expect(result.output).toBe(expected);
    expect(result.results).toEqual([expect.objectContaining({ status: 'converted' })]);
  });

  test('converts a responsive-only hide without guessing a restoration display', () => {
    const result = migrate('<div fxHide.sm></div>');

    expect(result.output).toBe(
      '<div class="[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:hidden"></div>',
    );
    expect(result.results).toEqual([expect.objectContaining({ status: 'converted' })]);
  });

  test('restores a hidden base state from converted layout semantics', () => {
    const result = migrate('<div fxLayout="column" fxShow="false" fxShow.sm></div>');

    expect(result.output).toBe(
      '<div class="flex flex-col box-border hidden [@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:flex"></div>',
    );
    expect(result.results.every(item => item.status === 'converted')).toBe(true);
  });

  test('restores a hidden base state from one existing display utility', () => {
    const result = migrate('<div class="block" fxShow="false" fxShow.sm></div>');

    expect(result.output).toBe(
      '<div class="block hidden [@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:block"></div>',
    );
    expect(result.results.every(item => item.status === 'converted')).toBe(true);
  });

  test.each([
    '<div style="display:block" fxShow></div>',
    '<div [style.display]="display" fxShow></div>',
    '<div [style.display]="display" fxHide></div>',
    '<div [attr.style]="styles" fxShow></div>',
    '<div bind-attr.style="styles" fxShow></div>',
  ])('preserves visibility when parser-provided style evidence controls display: %s', source => {
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toContainEqual(
      expect.objectContaining({ status: 'review', code: 'display-restoration-unverified' }),
    );
  });

  test.each([
    '<div [class]="classes" fxHide></div>',
    '<div [attr.class]="classes" fxHide></div>',
    '<div bind-attr.class="classes" fxHide></div>',
  ])('preserves a hiding family when parser-produced bound classes block generated output: %s', source => {
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toEqual([expect.objectContaining({ status: 'review', code: 'bound-class' })]);
  });

  test.each(['CLASS', 'Class'])('merges generated visibility output into the existing %s attribute', classKey => {
    const result = migrate(`<div ${classKey}="card" fxHide></div>`);

    expect(result.output).toBe(`<div ${classKey}="card hidden"></div>`);
    expect(result.results).toEqual([expect.objectContaining({ status: 'converted' })]);
  });

  test('uses an uppercase literal CLASS display utility as restoration evidence', () => {
    const result = migrate('<div CLASS="block" fxShow="false" fxShow.sm></div>');

    expect(result.output).toBe(
      '<div CLASS="block hidden [@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:block"></div>',
    );
    expect(result.results.every(item => item.status === 'converted')).toBe(true);
  });

  test('removes an all-shown no-op family beside a bound class without inserting an empty class', () => {
    const result = migrate('<div [class]="classes" fxShow></div>');

    expect(result.output).toBe('<div [class]="classes"></div>');
    expect(result.results).toEqual([expect.objectContaining({ status: 'converted' })]);
  });

  test('preserves layout and visibility atomically when visibility is dynamic', () => {
    const source = '<div fxLayout="row" [fxHide]="hidden"></div>';
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toEqual([
      expect.objectContaining({ status: 'review', code: 'context-unverified' }),
      expect.objectContaining({ status: 'review', code: 'dynamic-binding' }),
    ]);
  });

  test('lets visibility own display when layout and hiding share one responsive range', () => {
    const result = migrate('<div fxLayout.sm="column" fxHide.sm></div>');

    expect(result.output).toBe(
      '<div class="[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:flex-col [@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:box-border [@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:hidden"></div>',
    );
    expect(result.output).not.toContain(']:flex ');
    expect(result.results.every(item => item.status === 'converted')).toBe(true);
  });

  test('preserves a competing existing display class and closes the layout dependency afterward', () => {
    const source = '<div class="block" fxLayout="row" fxHide></div>';
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toEqual([
      expect.objectContaining({ status: 'review', code: 'context-unverified' }),
      expect.objectContaining({ status: 'review', code: 'class-conflict' }),
    ]);
  });

  test('closes visibility dependencies after a non-display layout class conflict', () => {
    const source = '<div class="flex-col" fxLayout="row" fxShow="false" fxShow.sm></div>';
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toEqual([
      expect.objectContaining({ status: 'review', code: 'class-conflict' }),
      expect.objectContaining({ status: 'review', code: 'context-unverified' }),
      expect.objectContaining({ status: 'review', code: 'context-unverified' }),
    ]);
  });

  test('keeps parent gap conversion independent from a hidden child', () => {
    const result = migrate('<div fxLayout="row" fxLayoutGap="4"><span fxHide></span></div>');

    expect(result.output).toBe('<div class="flex flex-row box-border gap-[4px]"><span class="hidden"></span></div>');
    expect(result.results.every(item => item.status === 'converted')).toBe(true);
  });

  test.each([
    ['dynamic', '<div fxLayout="row" [fxHide]="hidden"></div>', ['context-unverified', 'dynamic-binding']],
    [
      'optional breakpoint',
      '<div fxLayout="row" fxShow.handset></div>',
      ['context-unverified', 'breakpoint-unverified'],
    ],
    ['custom breakpoint', '<div fxLayout="row" fxHide.cinema></div>', ['context-unverified', 'custom-breakpoint']],
  ] as const)('retains intrinsic visibility diagnostic precedence for %s input', (_case, source, codes) => {
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results.map(item => (item.status === 'converted' ? undefined : item.code))).toEqual(codes);
  });

  test('plans fxFlex, fxGrow, and fxShrink as one atomic semantic group', () => {
    const result = migrate('<div fxShrink="0" fxFlex="25" fxGrow="2"></div>');

    expect(result.output).toBe('<div class="[flex:2_0_25%] box-border"></div>');
    expect(result.results.map(item => item.status)).toEqual(['converted', 'converted', 'converted']);
  });

  test('preserves the complete flex group when one member is dynamic', () => {
    const source = '<div fxFlex="25" [fxGrow]="factor"></div>';
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results.map(item => item.status)).toEqual(['review', 'review']);
  });

  test('classifies static flex modifiers as context-dependent when fxFlex is dynamic', () => {
    const source = '<div [fxFlex]="basis" fxGrow="2"></div>';
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toEqual([
      expect.objectContaining({ status: 'review', code: 'dynamic-binding' }),
      expect.objectContaining({ status: 'review', code: 'context-unverified' }),
    ]);
  });

  test('converts responsive flex sizing members as one atomic semantic group', () => {
    const source = '<div fxFlex="50" fxGrow="2" fxFlex.sm="100" fxShrink.sm="0"></div>';
    const result = migrate(source);

    expect(result.output).not.toContain('fxFlex');
    expect(result.output).not.toContain('fxGrow');
    expect(result.output).not.toContain('fxShrink');
    expect(result.output).toContain('[flex:2_1_100%]');
    expect(result.output).toContain('[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:[flex:2_0_100%]');
    expect(result.results.map(item => item.status)).toEqual(['converted', 'converted', 'converted', 'converted']);
  });

  test('rejects fxGrow without the fxFlex directive that owns the input', () => {
    const source = '<div fxGrow="2"></div>';
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toContainEqual(expect.objectContaining({ status: 'invalid', code: 'invalid-value' }));
  });

  test('preserves alignment when its layout direction is dynamic', () => {
    const source = '<div [fxLayout]="direction" fxLayoutAlign="center end"></div>';
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toEqual([
      expect.objectContaining({ status: 'review', code: 'dynamic-binding' }),
      expect.objectContaining({ status: 'review', code: 'context-unverified' }),
    ]);
  });

  test('preserves layout and gap when a responsive layout can wrap', () => {
    const source = '<div fxLayout="row" fxLayout.sm="row wrap" fxLayoutGap="4"></div>';
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results.map(item => item.status)).toEqual(['review', 'review', 'review']);
  });

  test('converts responsive layout, gap, and alignment with matching layout context', () => {
    const source =
      '<div fxLayout="row" fxLayout.sm="column" fxLayoutGap="4" fxLayoutGap.sm="8" fxLayoutAlign="start stretch" fxLayoutAlign.sm="end stretch"></div>';
    const result = migrate(source);

    expect(result.output).not.toContain('fxLayout');
    expect(result.output).toContain('gap-[4px]');
    expect(result.output).toContain('[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:gap-[8px]');
    expect(result.output).toContain('[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:max-w-full');
    expect(result.results.every(item => item.status === 'converted')).toBe(true);
  });

  test('uses responsive parent layout context for child offsets', () => {
    const source = '<div fxLayout="row" fxLayout.sm="column"><span fxFlexOffset="4" fxFlexOffset.sm="8"></span></div>';
    const result = migrate(source);

    expect(result.output).not.toContain('fxLayout');
    expect(result.output).not.toContain('fxFlexOffset');
    expect(result.output).toContain('ms-[4%]');
    expect(result.output).toContain('[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:mt-[8%]');
    expect(result.results.every(item => item.status === 'converted')).toBe(true);
  });

  test('preserves a responsive child offset when the parent layout cluster has an unresolved gap', () => {
    const source = '<div fxLayout="row" fxLayout.sm="row wrap" fxLayoutGap="4"><span fxFlexOffset.sm="8"></span></div>';
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toContainEqual(
      expect.objectContaining({
        status: 'review',
        code: 'context-unverified',
        input: expect.objectContaining({ directive: 'fxFlexOffset' }),
      }),
    );
  });

  test('preserves responsive child flex sizing when the parent layout cluster has unresolved alignment', () => {
    const source = '<div fxLayout="row" [fxLayoutAlign.sm]="alignment"><span fxFlex.sm="50"></span></div>';
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toContainEqual(
      expect.objectContaining({
        status: 'review',
        code: 'context-unverified',
        input: expect.objectContaining({ directive: 'fxFlex' }),
      }),
    );
  });

  test.each([
    ['print gap', '<div fxLayoutGap.print="4"></div>', 'fxLayoutGap', 'breakpoint-unverified'],
    ['optional alignment', '<div fxLayoutAlign.handset="center"></div>', 'fxLayoutAlign', 'breakpoint-unverified'],
    ['custom offset', '<div><span fxFlexOffset.cinema="4"></span></div>', 'fxFlexOffset', 'custom-breakpoint'],
  ] as const)('retains the intrinsic breakpoint diagnostic for contextual %s', (_case, source, directive, code) => {
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toContainEqual(
      expect.objectContaining({
        status: 'review',
        code,
        input: expect.objectContaining({ directive }),
      }),
    );
  });

  test.each([
    [
      'print gap',
      '<div [fxLayout]="direction" fxLayoutGap.print="4"></div>',
      ['dynamic-binding', 'breakpoint-unverified'],
    ],
    [
      'orientation alignment',
      '<div [fxLayout]="direction" fxLayoutAlign.handset="center"></div>',
      ['dynamic-binding', 'breakpoint-unverified'],
    ],
    [
      'custom child offset',
      '<div [fxLayout]="direction"><span fxFlexOffset.cinema="4"></span></div>',
      ['dynamic-binding', 'custom-breakpoint'],
    ],
  ] as const)(
    'retains exact intrinsic diagnostics for contextual %s under a dynamic layout',
    (_case, source, expectedCodes) => {
      const result = migrate(source);

      expect(result.output).toBe(source);
      expect(result.results.map(item => (item.status === 'converted' ? undefined : item.code))).toEqual(expectedCodes);
    },
  );
});
