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

  test('preserves inputs the adapter does not support', () => {
    const source = '<div fxShow="false"></div>';

    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toContainEqual(
      expect.objectContaining({ status: 'unsupported', code: 'target-unsupported' }),
    );
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

  test('preserves base and responsive fxFlex inputs as one unresolved group', () => {
    const source = '<div fxFlex="50" fxFlex.sm="100"></div>';
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toEqual([
      expect.objectContaining({ status: 'review', code: 'context-unverified' }),
      expect.objectContaining({ status: 'review', code: 'breakpoint-unverified' }),
    ]);
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

  test('preserves a base layout required by unresolved responsive alignment', () => {
    const source = '<div fxLayout="column" fxLayoutAlign.sm="center end"></div>';
    const result = migrate(source);

    expect(result.output).toBe(source);
    expect(result.results).toEqual([
      expect.objectContaining({ status: 'review', code: 'context-unverified' }),
      expect.objectContaining({ status: 'review', code: 'breakpoint-unverified' }),
    ]);
  });
});
