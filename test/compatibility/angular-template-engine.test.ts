import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { TailwindAdapter } from '../../src/adapter/tailwind/tailwind.adapter';
import { TemplateAnalyzer } from '../../src/analyzer/template.analyzer';
import { SourceEditor } from '../../src/edit/source-editor';
import { ConversionPlanner } from '../../src/planner/conversion-planner';
import { AngularTemplateParser } from '../../src/template/angular-template.parser';

const fixtureDirectory = new URL('../fixtures/compatibility/', import.meta.url);

function migrate(source: string, fileName = 'fixture.html') {
  const parsed = new AngularTemplateParser().parse(source, fileName);
  if (parsed.status !== 'parsed') throw new Error(parsed.diagnostics.map(item => item.message).join('\n'));
  const inputs = new TemplateAnalyzer().analyze(fileName, parsed.elements);
  const plan = new ConversionPlanner().plan(source, parsed.elements, inputs, new TailwindAdapter());
  const edited = new SourceEditor().apply(source, plan.edits);
  if (edited.status !== 'applied') throw new Error(edited.diagnostics.map(item => item.message).join('\n'));
  return { output: edited.output, results: plan.results };
}

async function fixture(name: string, kind: 'input' | 'expected'): Promise<string> {
  const url = new URL(`${name}.${kind}.html`, fixtureDirectory);
  return readFile(fileURLToPath(url), 'utf8');
}

describe('Angular template engine compatibility', () => {
  test.each(['static', 'angular-syntax', 'unresolved'])('matches the %s fixture and is idempotent', async name => {
    const input = await fixture(name, 'input');
    const expected = await fixture(name, 'expected');

    const first = migrate(input, `${name}.html`);
    expect(first.output).toBe(expected);
    const second = migrate(first.output, `${name}.html`);
    expect(second.output).toBe(expected);
    if (name !== 'unresolved') expect(second.results).toEqual([]);
  });

  test('preserves CRLF and unrelated bytes', () => {
    const input = '<div data-label="a &amp; b" fxLayout="row">\r\n  {{ value | async }}\r\n</div>\r\n';

    expect(migrate(input).output).toBe(
      '<div data-label="a &amp; b" class="flex flex-row box-border">\r\n  {{ value | async }}\r\n</div>\r\n',
    );
  });

  test('classifies every unresolved syntax family without modifying it', async () => {
    const input = await fixture('unresolved', 'input');
    const result = migrate(input);

    expect(result.results.map(item => item.status)).toEqual(['review', 'review', 'review', 'unsupported', 'review']);
  });
});
