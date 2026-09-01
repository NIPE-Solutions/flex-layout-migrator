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

  test.each([
    ['fxShow', '<div fxShow="fals&#101;"></div>', '<div class="hidden"></div>'],
    ['fxHide', '<div fxHide="fals&#101;"></div>', '<div></div>'],
  ])('uses Angular-decoded entity semantics for %s literals', (_case, source, expected) => {
    const result = migrate(source);

    expect(result.output).toBe(expected);
    expect(result.results).toEqual([expect.objectContaining({ status: 'converted' })]);
  });

  test('uses a decoded entity class as restoration evidence while preserving its raw spelling', () => {
    const result = migrate('<div class="bl&#111;ck" fxShow="false" fxShow.sm></div>');

    expect(result.output).toBe(
      '<div class="bl&#111;ck hidden [@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:block"></div>',
    );
    expect(result.results.every(item => item.status === 'converted')).toBe(true);
  });

  test('keeps generated classes separated after entity-encoded class whitespace', () => {
    const result = migrate('<div class="bl&#111;ck&#32;" fxShow="false" fxShow.sm></div>');

    expect(result.output).toBe(
      '<div class="bl&#111;ck&#32;hidden [@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:block"></div>',
    );
  });

  test('uses a decoded entity style declaration as blocking display evidence', () => {
    const source = '<div style="displa&#121;:block" fxShow></div>';
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toEqual([
      expect.objectContaining({ status: 'review', code: 'display-restoration-unverified' }),
    ]);
  });

  test.each([
    '<div style="/* leading */ display:block" fxHide></div>',
    '<div style="color:red; display/**/:block" fxHide></div>',
    '<div style="d\\69 splay:block" fxHide></div>',
  ])('preserves visibility when CSS-aware inline-style evidence controls display: %s', source => {
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toEqual([
      expect.objectContaining({ status: 'review', code: 'display-restoration-unverified' }),
    ]);
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

  test.each([
    ['zero generated output', '<div class="card" fxShow></div>', '<div class="card"></div>'],
    [
      'replacement-identical generated output',
      '<div class="flex flex-row box-border" fxLayout="row"></div>',
      '<div class="flex flex-row box-border"></div>',
    ],
  ])('does not enqueue an identical literal class edit for %s', (_case, source, expected) => {
    const result = migrate(source);

    expect(result.output).toBe(expected);
    expect(result.edits).toHaveLength(1);
    expect(result.edits).toEqual([
      expect.objectContaining({ text: '', inputId: expect.not.stringContaining(':classes') }),
    ]);
  });

  test.each([
    [
      'bounded class',
      '<div class="card" ngClass.sm="flex items-center"></div>',
      '<div class="card [@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:flex [@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:items-center"></div>',
    ],
    [
      'minimum class',
      '<div ngClass.gt-xs="grid"></div>',
      '<div class="[@media_screen_and_(min-width:_600px)]:grid"></div>',
    ],
    [
      'maximum style',
      '<div ngStyle.lt-md="font-size.px: 14; color: #334155"></div>',
      '<div class="[@media_screen_and_(max-width:_959.98px)]:[font-size:14px] [@media_screen_and_(max-width:_959.98px)]:[color:#334155]"></div>',
    ],
  ])('converts an exact responsive extended %s family', (_case, source, expected) => {
    const result = migrate(source);

    expect(result.output).toBe(expected);
    expect(result.results.every(item => item.status === 'converted')).toBe(true);
  });

  test('converts disjoint extended states and exact identical overlaps atomically', () => {
    const source = '<div ngClass.xs="flex" ngClass.sm="grid" ngStyle.sm="color:red" ngStyle.gt-xs="color:red"></div>';
    const result = migrate(source);

    expect(result.output).toBe(
      '<div class="[@media_screen_and_(min-width:_0px)_and_(max-width:_599.98px)]:flex [@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:grid [@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:[color:red] [@media_screen_and_(min-width:_600px)]:[color:red]"></div>',
    );
    expect(result.results.every(item => item.status === 'converted')).toBe(true);
  });

  test('preserves extended families with conflicting overlap values', () => {
    const source =
      '<div ngClass.sm="flex" ngClass.gt-xs="grid" ngStyle.sm="color:red" ngStyle.gt-xs="color:blue"></div>';
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toEqual([
      expect.objectContaining({ status: 'review', code: 'responsive-precedence-unverified' }),
      expect.objectContaining({ status: 'review', code: 'responsive-precedence-unverified' }),
      expect.objectContaining({ status: 'review', code: 'responsive-precedence-unverified' }),
      expect.objectContaining({ status: 'review', code: 'responsive-precedence-unverified' }),
    ]);
  });

  test.each([
    ['application class', 'ngClass.sm="card"', 'tailwind-candidate-unverified'],
    ['unsafe style', 'ngStyle.sm="background-image:url(card.png)"', 'style-value-unverified'],
    ['dynamic class', '[ngClass.sm]="classes"', 'dynamic-binding'],
    ['dynamic style', '[ngStyle.sm]="styles"', 'dynamic-binding'],
    ['deprecated class', 'class.sm="flex"', 'semantic-unsupported'],
    ['deprecated style', 'style.sm="color:red"', 'semantic-unsupported'],
    ['custom class alias', 'ngClass.cinema="flex"', 'custom-breakpoint'],
    ['optional style alias', 'ngStyle.handset="color:red"', 'breakpoint-unverified'],
    ['print class alias', 'ngClass.print="flex"', 'breakpoint-unverified'],
  ])('preserves an unsupported extended %s with its intrinsic diagnostic', (_case, attribute, code) => {
    const source = `<div ${attribute}></div>`;
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toEqual([expect.objectContaining({ status: 'review', code })]);
  });

  test.each([
    ['existing class', '<div class="grid" ngClass.sm="flex"></div>'],
    ['existing style utility', '<div class="text-blue-500" ngStyle.sm="color:red"></div>'],
    ['fallback style', '<div style="color:blue" ngStyle.sm="color:red"></div>'],
  ])('preserves an extended family with an intersecting %s conflict', (_case, source) => {
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toEqual([expect.objectContaining({ status: 'review', code: 'class-conflict' })]);
  });

  test('keeps unrelated layout and responsive style ownership independent', () => {
    const result = migrate('<div fxLayout="row" ngStyle.sm="color:red"></div>');

    expect(result.output).toBe(
      '<div class="flex flex-row box-border [@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:[color:red]"></div>',
    );
    expect(result.results.every(item => item.status === 'converted')).toBe(true);
  });

  test('keeps the proven inline style winner for overlapping responsive class color', () => {
    const result = migrate('<div ngClass.sm="text-red-500" ngStyle.sm="color:blue"></div>');

    expect(result.output).toBe(
      '<div class="[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:[color:blue]"></div>',
    );
    expect(result.results.every(item => item.status === 'converted')).toBe(true);
  });

  test.each([
    ['arbitrary property', '[color:red!important]', 'color:blue'],
    ['arbitrary color value', 'text-[color:red!important]', 'color:blue'],
    ['arbitrary width value', 'w-[17px!important]', 'width:20px'],
    ['leading important modifier', '![color:red]', 'color:blue'],
    ['trailing important modifier', '[color:red]!', 'color:blue'],
  ])('preserves %s ownership against a normal responsive inline style', (_case, className, style) => {
    const source = `<div ngClass.sm="${className}" ngStyle.sm="${style}"></div>`;
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toEqual([
      expect.objectContaining({ status: 'review', code: 'context-unverified' }),
      expect.objectContaining({ status: 'review', code: 'context-unverified' }),
    ]);
  });

  test('keeps an important responsive inline style over a normal class property', () => {
    const result = migrate('<div ngClass.sm="text-red-500" ngStyle.sm="color:blue!important"></div>');

    expect(result.output).toBe(
      '<div class="[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:[color:blue!important]"></div>',
    );
    expect(result.results.every(item => item.status === 'converted')).toBe(true);
  });

  test('preserves internal important display ownership beside all-shown visibility', () => {
    const source = '<div ngClass.sm="[display:block!important]" fxShow.sm></div>';
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results.every(item => item.status === 'review')).toBe(true);
    expect(result.results.map(item => (item.status === 'converted' ? undefined : item.code))).toContain(
      'context-unverified',
    );
  });

  test('keeps the proven responsive layout winner for overlapping responsive class direction', () => {
    const result = migrate('<div fxLayout.sm="column" ngClass.sm="flex-row"></div>');

    expect(result.output).toBe(
      '<div class="[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:flex [@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:flex-col [@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:box-border"></div>',
    );
    expect(result.results.every(item => item.status === 'converted')).toBe(true);
  });

  test('preserves overlapping responsive layout and ngStyle direction inline writers', () => {
    const source = '<div fxLayout.sm="column" ngStyle.sm="flex-direction:row;color:blue"></div>';
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toEqual([
      expect.objectContaining({ status: 'review', code: 'context-unverified' }),
      expect.objectContaining({ status: 'review', code: 'context-unverified' }),
    ]);
  });

  test.each([
    ['different native gap', '8', 'gap-4'],
    ['identical native gap', '16px', 'gap-[16px]'],
  ])('preserves responsive fxLayoutGap replacement beside %s', (_case, gap, className) => {
    const source = `<div fxLayoutGap.sm="${gap}" ngClass.sm="${className}"></div>`;
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toEqual([
      expect.objectContaining({ status: 'review', code: 'context-unverified' }),
      expect.objectContaining({ status: 'review', code: 'context-unverified' }),
    ]);
  });

  test('lets a converted responsive layout own an overlapping ngClass display candidate', () => {
    const result = migrate('<div fxLayout.sm="row" ngClass.sm="hidden"></div>');

    expect(result.output).toBe(
      '<div class="[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:flex [@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:flex-row [@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:box-border"></div>',
    );
    expect(result.results.every(item => item.status === 'converted')).toBe(true);
  });

  test('preserves overlapping responsive layout and ngStyle display ownership', () => {
    const source = '<div fxLayout.sm="row" ngStyle.sm="display:block"></div>';
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toEqual([
      expect.objectContaining({ status: 'review', code: 'context-unverified' }),
      expect.objectContaining({ status: 'review', code: 'context-unverified' }),
    ]);
  });

  test('preserves partially overlapping layout and extended display families', () => {
    const source = '<div fxLayout.lt-sm="row" ngClass.lt-md="hidden"></div>';
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toEqual([
      expect.objectContaining({ status: 'review', code: 'context-unverified' }),
      expect.objectContaining({ status: 'review', code: 'context-unverified' }),
    ]);
  });

  test.each(['ngClass.sm="[all:unset]"', 'ngStyle.sm="all:unset"'])(
    'preserves universal responsive %s ownership beside responsive layout',
    authority => {
      const source = `<div fxLayout.sm="row" ${authority}></div>`;
      const result = migrate(source);

      expect(result.output).toBe(source);
      expect(result.results).toEqual([
        expect.objectContaining({ status: 'review', code: 'context-unverified' }),
        expect.objectContaining({ status: 'review', code: 'context-unverified' }),
      ]);
    },
  );

  test('lets responsive ngStyle own an exact overlapping ngClass display candidate', () => {
    const result = migrate('<div ngClass.sm="hidden" ngStyle.sm="display:block"></div>');

    expect(result.output).toBe(
      '<div class="[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:[display:block]"></div>',
    );
    expect(result.results.every(item => item.status === 'converted')).toBe(true);
  });

  test('preserves partially overlapping responsive class and style display families', () => {
    const source = '<div ngClass.lt-md="hidden" ngStyle.lt-sm="display:block"></div>';
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toEqual([
      expect.objectContaining({ status: 'review', code: 'context-unverified' }),
      expect.objectContaining({ status: 'review', code: 'context-unverified' }),
    ]);
  });

  test('preserves responsive style display conversion beside an unresolved class family', () => {
    const source = '<div ngClass.sm="card" ngStyle.sm="display:block"></div>';
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toEqual([
      expect.objectContaining({ status: 'review', code: 'tailwind-candidate-unverified' }),
      expect.objectContaining({ status: 'review', code: 'context-unverified' }),
    ]);
  });

  test('preserves responsive style property ownership beside an unresolved class family', () => {
    const source = '<div ngClass.sm="card" ngStyle.sm="color:red"></div>';
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toEqual([
      expect.objectContaining({ status: 'review', code: 'tailwind-candidate-unverified' }),
      expect.objectContaining({ status: 'review', code: 'context-unverified' }),
    ]);
  });

  test('lets exact responsive hiding own an ngClass display candidate', () => {
    const result = migrate('<div ngClass.sm="hidden" fxHide.sm></div>');

    expect(result.output).toBe(
      '<div class="[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:hidden"></div>',
    );
    expect(result.results.every(item => item.status === 'converted')).toBe(true);
  });

  test.each(['ngClass.sm="[all:unset]"', 'ngStyle.sm="all:unset"'])(
    'preserves universal responsive %s ownership beside responsive visibility',
    authority => {
      const source = `<div ${authority} fxHide.sm></div>`;
      const result = migrate(source);

      expect(result.output).toBe(source);
      expect(result.results).toEqual([
        expect.objectContaining({ status: 'review', code: 'context-unverified' }),
        expect.objectContaining({ status: 'review', code: 'context-unverified' }),
      ]);
    },
  );

  test('preserves visibility when an unresolved responsive class may control display', () => {
    const source = '<div ngClass.sm="card" fxHide.sm></div>';
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toEqual([
      expect.objectContaining({ status: 'review', code: 'tailwind-candidate-unverified' }),
      expect.objectContaining({ status: 'review', code: 'context-unverified' }),
    ]);
  });

  test.each(['block', 'none'])(
    'preserves overlapping responsive ngStyle display:%s and visibility inline writers',
    display => {
      const source = `<div ngStyle.sm="display:${display}" fxHide.sm></div>`;
      const result = migrate(source);

      expect(result.output).toBe(source);
      expect(result.results).toEqual([
        expect.objectContaining({ status: 'review', code: 'context-unverified' }),
        expect.objectContaining({ status: 'review', code: 'context-unverified' }),
      ]);
    },
  );

  test.each([
    ['exact class', 'ngClass.sm="block"', 'display-restoration-unverified'],
    ['conditional class', 'ngClass.sm="hover:block"', 'display-restoration-unverified'],
    ['theme-conditional class', 'ngClass.sm="dark:block"', 'display-restoration-unverified'],
    ['exact style', 'ngStyle.sm="display:block"', 'context-unverified'],
  ])('preserves %s display when visibility restoration depends on initialization', (_case, authority, expectedCode) => {
    const source = `<div ${authority} fxShow="false" fxShow.sm></div>`;
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results.every(item => item.status === 'review')).toBe(true);
    expect(result.results).toContainEqual(expect.objectContaining({ status: 'review', code: expectedCode }));
  });

  test.each([
    ['exact', 'block'],
    ['inner variant', 'hover:block'],
  ])('preserves %s all-shown responsive class display initialization', (_case, className) => {
    const source = `<span ngClass.sm="${className}" fxShow.sm></span>`;
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toEqual([
      expect.objectContaining({ status: 'review', code: 'context-unverified' }),
      expect.objectContaining({ status: 'review', code: 'display-restoration-unverified' }),
    ]);
  });

  test('keeps disjoint responsive class display and all-shown visibility independent', () => {
    const result = migrate('<span ngClass.sm="block" fxShow.md></span>');

    expect(result.output).toBe(
      '<span class="[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:block"></span>',
    );
    expect(result.results.every(item => item.status === 'converted')).toBe(true);
  });

  test('preserves an extended display when it cannot restore the exact shown range', () => {
    const source = '<div ngClass.gt-xs="block" fxShow="false" fxShow.sm></div>';
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toEqual([
      expect.objectContaining({ status: 'review', code: 'context-unverified' }),
      expect.objectContaining({ status: 'review', code: 'display-restoration-unverified' }),
      expect.objectContaining({ status: 'review', code: 'display-restoration-unverified' }),
    ]);
  });

  test.each(['none', 'var(--display-mode)'])(
    'preserves responsive ngStyle display:%s when visibility must show the element',
    display => {
      const source = `<div ngStyle.sm="display:${display}" fxShow="false" fxShow.sm></div>`;
      const result = migrate(source);

      expect(result.output).toBe(source);
      expect(result.results).toEqual([
        expect.objectContaining({ status: 'review', code: 'context-unverified' }),
        expect.objectContaining({ status: 'review', code: 'context-unverified' }),
        expect.objectContaining({ status: 'review', code: 'context-unverified' }),
      ]);
    },
  );

  test.each([
    ['visibility hiding', 'fxHide.sm'],
    ['visibility showing', 'fxShow="false" fxShow.sm'],
    ['responsive layout', 'fxLayout.sm="row"'],
    ['responsive style', 'ngStyle.sm="display:block"'],
  ])('preserves important responsive display ownership beside %s', (_case, authority) => {
    const source = `<div ngClass.sm="!hidden" ${authority}></div>`;
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results.every(item => item.status === 'review')).toBe(true);
    expect(result.results.map(item => (item.status === 'converted' ? undefined : item.code))).toContain(
      'context-unverified',
    );
  });

  test('preserves visibility when an unresolved responsive style may control display', () => {
    const source = '<div ngStyle.sm="display:url(card.png)" fxHide.sm></div>';
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toEqual([
      expect.objectContaining({ status: 'review', code: 'style-value-unverified' }),
      expect.objectContaining({ status: 'review', code: 'display-restoration-unverified' }),
    ]);
  });

  test('keeps visibility independent from an unresolved non-display responsive style', () => {
    const result = migrate('<div ngStyle.sm="background-image:url(card.png)" fxHide.sm></div>');

    expect(result.output).toBe(
      '<div ngStyle.sm="background-image:url(card.png)" class="[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:hidden"></div>',
    );
    expect(result.results).toEqual([
      expect.objectContaining({ status: 'review', code: 'style-value-unverified' }),
      expect.objectContaining({ status: 'converted' }),
    ]);
  });

  test('retains the extended intrinsic diagnostic before closing display dependencies', () => {
    const source = '<div ngClass.sm="card" ngClass.md="flex" fxHide.sm></div>';
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toEqual([
      expect.objectContaining({ status: 'review', code: 'tailwind-candidate-unverified' }),
      expect.objectContaining({ status: 'review', code: 'context-unverified' }),
      expect.objectContaining({ status: 'review', code: 'context-unverified' }),
    ]);
  });

  test('orders extended output independently of attribute source order', () => {
    const forward = migrate('<div ngClass.sm="flex items-center" ngStyle.xs="color:red"></div>');
    const reverse = migrate('<div ngStyle.xs="color:red" ngClass.sm="flex items-center"></div>');

    expect(reverse.output).toBe(forward.output);
    expect(reverse.results.every(item => item.status === 'converted')).toBe(true);
  });

  test('removes empty and byte-identical extended output without an unnecessary class edit', () => {
    const result = migrate(
      '<div class="[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:flex" ngClass.sm="flex" ngStyle.sm=""></div>',
    );

    expect(result.output).toBe(
      '<div class="[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:flex"></div>',
    );
    expect(result.edits).toHaveLength(2);
    expect(result.edits.every(edit => !edit.inputId.endsWith(':classes'))).toBe(true);
  });

  test('produces no edits when exact extended output is migrated a second time', () => {
    const first = migrate('<div ngClass.sm="flex" ngStyle.lt-md="color:red"></div>');
    const second = migrate(first.output);

    expect(first.results.every(item => item.status === 'converted')).toBe(true);
    expect(second.output).toBe(first.output);
    expect(second.edits).toEqual([]);
    expect(second.results).toEqual([]);
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

  test.each([
    ['nested max-only ranges', '<div fxLayout.lt-md="row" fxHide.lt-sm></div>'],
    ['crossing min/max ranges', '<div fxLayout.gt-xs="row" fxHide.lt-md></div>'],
  ])('preserves coupled directives for unsafe partial layout/visibility overlap across %s', (_case, source) => {
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toEqual([
      expect.objectContaining({ status: 'review', code: 'context-unverified' }),
      expect.objectContaining({ status: 'review', code: 'context-unverified' }),
    ]);
  });

  test.each([
    ['literal class', 'class.sm="hidden"', 'semantic-unsupported', 'context-unverified'],
    ['literal style', 'style.sm="display:block"', 'semantic-unsupported', 'display-restoration-unverified'],
    ['bound ngClass', '[ngClass.sm]="classes"', 'dynamic-binding', 'bound-class'],
    ['bind ngClass', 'bind-ngClass.sm="classes"', 'dynamic-binding', 'bound-class'],
    ['bound class target', '[class.sm]="flag"', 'dynamic-binding', 'bound-class'],
    ['bind class target', 'bind-class.sm="flag"', 'dynamic-binding', 'bound-class'],
    ['bound ngStyle', '[ngStyle.sm]="styles"', 'dynamic-binding', 'display-restoration-unverified'],
    ['bind ngStyle', 'bind-ngStyle.sm="styles"', 'dynamic-binding', 'display-restoration-unverified'],
    ['bound style target', '[style.sm]="value"', 'dynamic-binding', 'display-restoration-unverified'],
    ['bind style target', 'bind-style.sm="value"', 'dynamic-binding', 'display-restoration-unverified'],
  ])(
    'preserves generated hiding beside unsupported responsive %s authority',
    (_case, authority, authorityCode, visibilityCode) => {
      const source = `<div ${authority} fxHide.sm></div>`;
      const result = migrate(source);

      expect(result.output).toBe(source);
      expect(result.results).toEqual([
        expect.objectContaining({ status: expect.not.stringMatching('converted'), code: authorityCode }),
        expect.objectContaining({ status: 'review', code: visibilityCode }),
      ]);
    },
  );

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
