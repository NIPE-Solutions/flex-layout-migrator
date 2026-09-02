import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { TailwindAdapter } from '../../src/adapter/tailwind/tailwind.adapter';
import { TemplateAnalyzer } from '../../src/analyzer/template.analyzer';
import type { ConversionResult } from '../../src/analyzer/conversion-result';
import { SourceEditor } from '../../src/edit/source-editor';
import { ConversionPlanner } from '../../src/planner/conversion-planner';
import { AngularTemplateParser } from '../../src/template/angular-template.parser';

const fixtureDirectory = new URL('../fixtures/compatibility/', import.meta.url);
const standardAliases = [
  'xs',
  'sm',
  'md',
  'lg',
  'xl',
  'lt-sm',
  'lt-md',
  'lt-lg',
  'lt-xl',
  'gt-xs',
  'gt-sm',
  'gt-md',
  'gt-lg',
] as const;

function migrate(source: string, fileName = 'fixture.html') {
  const parsed = new AngularTemplateParser().parse(source, fileName);
  if (parsed.status !== 'parsed') throw new Error(parsed.diagnostics.map(item => item.message).join('\n'));
  const inputs = new TemplateAnalyzer().analyze(fileName, parsed.elements);
  const plan = new ConversionPlanner().plan(source, parsed.elements, inputs, new TailwindAdapter());
  const edited = new SourceEditor().apply(source, plan.edits);
  if (edited.status !== 'applied') throw new Error(edited.diagnostics.map(item => item.message).join('\n'));
  return { output: edited.output, results: plan.results, editCount: plan.edits.length };
}

function unresolvedCodes(results: readonly ConversionResult[]): readonly string[] {
  return results.flatMap(result => (result.status === 'converted' ? [] : [result.code]));
}

function resultCounts(results: readonly ConversionResult[]) {
  const counts = { converted: 0, review: 0, unsupported: 0, invalid: 0, parseError: 0 };
  for (const result of results) {
    if (result.status === 'parse-error') counts.parseError += 1;
    else counts[result.status] += 1;
  }
  return counts;
}

function diagnosticCounts(results: readonly ConversionResult[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const code of unresolvedCodes(results)) counts[code] = (counts[code] ?? 0) + 1;
  return counts;
}

function equivalentResults(results: readonly ConversionResult[]) {
  return results
    .map(result =>
      result.status === 'parse-error'
        ? { status: result.status, code: result.code }
        : {
            status: result.status,
            sourceName: result.input.sourceName,
            code: result.status === 'converted' ? undefined : result.code,
          },
    )
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function extendedOccurrenceCounts(results: readonly ConversionResult[]) {
  const counts = { converted: 0, preserved: 0 };
  for (const result of results) {
    if (result.status === 'parse-error') continue;
    if (!['class', 'ngClass', 'style', 'ngStyle'].includes(result.input.directive)) continue;
    if (result.status === 'converted') counts.converted += 1;
    else counts.preserved += 1;
  }
  return counts;
}

async function fixture(name: string, kind: 'input' | 'expected'): Promise<string> {
  const url = new URL(`${name}.${kind}.html`, fixtureDirectory);
  return readFile(fileURLToPath(url), 'utf8');
}

describe('Angular template engine compatibility', () => {
  const preservedCodes: Record<string, readonly string[]> = {
    responsive: [
      'responsive-precedence-unverified',
      'responsive-precedence-unverified',
      'dynamic-binding',
      'breakpoint-unverified',
      'breakpoint-unverified',
      'custom-breakpoint',
      'class-conflict',
      'context-unverified',
      'context-unverified',
      'semantic-unsupported',
      'context-unverified',
    ],
    unresolved: [
      'dynamic-binding',
      'custom-breakpoint',
      'bound-class',
      'context-unverified',
      'semantic-unsupported',
      'semantic-unsupported',
      'dynamic-binding',
      'context-unverified',
    ],
    visibility: [
      'responsive-precedence-unverified',
      'responsive-precedence-unverified',
      'responsive-precedence-unverified',
      'responsive-precedence-unverified',
      'class-conflict',
      'display-restoration-unverified',
      'display-restoration-unverified',
      'display-restoration-unverified',
      'display-restoration-unverified',
      'display-restoration-unverified',
      'display-restoration-unverified',
      'display-restoration-unverified',
      'display-restoration-unverified',
      'bound-class',
      'bound-class',
      'dynamic-binding',
      'dynamic-binding',
      'context-unverified',
      'breakpoint-unverified',
      'breakpoint-unverified',
      'custom-breakpoint',
      'dynamic-binding',
      'context-unverified',
      'dynamic-binding',
      'class-conflict',
      'context-unverified',
      'context-unverified',
    ],
  };

  test('matches the Grid fixture byte-for-byte with stable public totals and idempotence', async () => {
    const input = await fixture('grid', 'input');
    const expected = await fixture('grid', 'expected');

    const first = migrate(input, 'grid.html');
    expect(first.output).toBe(expected);
    expect(resultCounts(first.results)).toEqual({
      converted: 13,
      review: 2,
      unsupported: 0,
      invalid: 0,
      parseError: 0,
    });
    expect(diagnosticCounts(first.results)).toEqual({ 'dynamic-binding': 1, 'breakpoint-unverified': 1 });

    const second = migrate(first.output, 'grid.html');
    expect(second.output).toBe(expected);
    expect(second.editCount).toBe(0);
    expect(resultCounts(second.results)).toEqual({
      converted: 0,
      review: 2,
      unsupported: 0,
      invalid: 0,
      parseError: 0,
    });
  });

  test.each(['static', 'angular-syntax', 'responsive', 'unresolved', 'visibility'])(
    'matches the %s fixture and is idempotent',
    async name => {
      const input = await fixture(name, 'input');
      const expected = await fixture(name, 'expected');

      const first = migrate(input, `${name}.html`);
      expect(first.output).toBe(expected);
      const second = migrate(first.output, `${name}.html`);
      expect(second.output).toBe(expected);
      expect(second.editCount).toBe(0);
      expect(unresolvedCodes(first.results)).toEqual(preservedCodes[name] ?? []);
      expect(unresolvedCodes(second.results)).toEqual(preservedCodes[name] ?? []);
    },
  );

  test('preserves CRLF and unrelated bytes', () => {
    const input = '<div data-label="a &amp; b" fxLayout="row">\r\n  {{ value | async }}\r\n</div>\r\n';

    expect(migrate(input).output).toBe(
      '<div data-label="a &amp; b" class="flex flex-row box-border">\r\n  {{ value | async }}\r\n</div>\r\n',
    );
  });

  test('emits the same canonical responsive family for equivalent attribute orders', () => {
    const baseFirst = migrate('<div fxLayout="row" fxLayout.sm="column" fxLayout.md="row"></div>');
    const responsiveFirst = migrate('<div fxLayout.md="row" fxLayout="row" fxLayout.sm="column"></div>');

    expect(baseFirst.output).toBe(responsiveFirst.output);
    expect(equivalentResults(baseFirst.results)).toEqual(equivalentResults(responsiveFirst.results));
  });

  test('emits the same composed visibility family for equivalent attribute orders', () => {
    const layoutFirst = migrate('<div fxLayout="row" fxShow="false" fxShow.sm></div>');
    const visibilityFirst = migrate('<div fxShow.sm fxShow="false" fxLayout="row"></div>');

    expect(layoutFirst.output).toBe(visibilityFirst.output);
    expect(equivalentResults(layoutFirst.results)).toEqual(equivalentResults(visibilityFirst.results));
  });

  test('reports the exact visibility compatibility totals and diagnostic histogram', async () => {
    const result = migrate(await fixture('visibility', 'input'), 'visibility.html');
    const convertedVisibilityNames = new Set(
      result.results.flatMap(item =>
        item.status === 'converted' && (item.input.directive === 'fxShow' || item.input.directive === 'fxHide')
          ? [item.input.sourceName]
          : [],
      ),
    );

    expect(resultCounts(result.results)).toEqual({
      converted: 48,
      review: 27,
      unsupported: 0,
      invalid: 0,
      parseError: 0,
    });
    expect(diagnosticCounts(result.results)).toEqual({
      'responsive-precedence-unverified': 4,
      'class-conflict': 2,
      'display-restoration-unverified': 8,
      'bound-class': 2,
      'dynamic-binding': 4,
      'context-unverified': 4,
      'breakpoint-unverified': 2,
      'custom-breakpoint': 1,
    });
    expect([...convertedVisibilityNames]).toEqual(
      expect.arrayContaining([
        'fxHide.xs',
        'fxHide.sm',
        'fxHide.md',
        'fxHide.lg',
        'fxHide.xl',
        'fxHide.lt-sm',
        'fxHide.lt-md',
        'fxHide.lt-lg',
        'fxHide.lt-xl',
        'fxHide.gt-xs',
        'fxHide.gt-sm',
        'fxHide.gt-md',
        'fxHide.gt-lg',
      ]),
    );
  });

  test('classifies every unresolved syntax family without modifying it', async () => {
    const input = await fixture('unresolved', 'input');
    const result = migrate(input);

    expect(unresolvedCodes(result.results)).toEqual(preservedCodes.unresolved);
  });

  test('matches the extended responsive fixture byte-for-byte and reports occurrence coverage', async () => {
    const input = await fixture('extended-responsive', 'input');
    const expected = await fixture('extended-responsive', 'expected');

    const first = migrate(input, 'extended-responsive.html');
    expect(first.output).toBe(expected);
    expect(resultCounts(first.results)).toEqual({
      converted: 43,
      review: 41,
      unsupported: 0,
      invalid: 0,
      parseError: 0,
    });
    expect(diagnosticCounts(first.results)).toEqual({
      'responsive-precedence-unverified': 4,
      'class-conflict': 9,
      'tailwind-candidate-unverified': 4,
      'dynamic-binding': 4,
      'semantic-unsupported': 2,
      'custom-breakpoint': 1,
      'breakpoint-unverified': 3,
      'style-value-unverified': 6,
      'context-unverified': 5,
      'display-restoration-unverified': 2,
      'bound-class': 1,
    });
    expect(extendedOccurrenceCounts(first.results)).toEqual({ converted: 41, preserved: 37 });

    for (const directive of ['ngClass', 'ngStyle'] as const) {
      const convertedAliases = new Set(
        first.results.flatMap(result =>
          result.status === 'converted' && result.input.directive === directive && result.input.breakpoint
            ? [result.input.breakpoint]
            : [],
        ),
      );
      expect(convertedAliases).toEqual(new Set(standardAliases));
    }

    const second = migrate(first.output, 'extended-responsive.html');
    expect(second.output).toBe(expected);
    expect(second.editCount).toBe(0);
    expect(extendedOccurrenceCounts(second.results)).toEqual({ converted: 0, preserved: 37 });
  });

  test('emits equivalent multi-state class and style families independently of source attribute order', () => {
    const canonicalOrder = migrate(
      '<div ngClass.xs="flex" ngClass.sm="grid" ngClass.gt-xs="grid" ngStyle.xs="color:red" ngStyle.sm="font-size.px:14" ngStyle.gt-xs="font-size.px:14"></div>',
      'extended-order.html',
    );
    const reverseOrder = migrate(
      '<div ngStyle.gt-xs="font-size.px:14" ngStyle.sm="font-size.px:14" ngStyle.xs="color:red" ngClass.gt-xs="grid" ngClass.sm="grid" ngClass.xs="flex"></div>',
      'extended-order.html',
    );

    expect(canonicalOrder.results).toHaveLength(6);
    expect(canonicalOrder.results.every(result => result.status === 'converted')).toBe(true);
    expect(reverseOrder.output).toBe(canonicalOrder.output);
    expect(equivalentResults(reverseOrder.results)).toEqual(equivalentResults(canonicalOrder.results));
  });
});
