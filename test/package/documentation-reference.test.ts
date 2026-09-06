import { readFile } from 'node:fs/promises';

import type { OwnedCssRule } from '../../src/adapter/css/css-artifact.model';
import { serializeOwnedCssBlock } from '../../src/adapter/css/stylesheet/owned-css-block.serializer';
import { mergeOwnedStylesheet } from '../../src/adapter/css/stylesheet/owned-stylesheet.merger';
import type { ConversionResult } from '../../src/analyzer/conversion-result';
import type { FlexLayoutDirective } from '../../src/analyzer/flex-layout.catalog';
import { previewTemplate } from '../../src/browser/template-preview';
import type { FileMigrationResult } from '../../src/migrator/file-migration-result';
import type { MigrationReport, ReportResult } from '../../src/report/migration-report';
import { MigrationReportBuilder } from '../../src/report/migration-report.builder';
import { verifiedExamples } from '../../website/src/content/example-reference';
import { reportReference } from '../../website/src/content/report-reference';

describe('documentation reference production parity', () => {
  test('executes every verified example through the production browser preview', () => {
    for (const example of verifiedExamples) {
      const result = previewTemplate(example.input);
      const publicResults = result.results.map(item =>
        item.status === 'converted' ? { status: item.status } : { status: item.status, code: item.code },
      );

      expect(result.html, example.id).toBe(example.expectedOutput);
      expect(result.css, example.id).toBe(example.expectedCss);
      expect(publicResults, example.id).toEqual(example.expectedResults);
    }
  });

  test('rebuilds every report example through the production schema-2 builder', () => {
    for (const example of reportReference.examples) {
      expect(rebuild(example.value), example.id).toEqual(example.value);
    }
  });

  test('binds rerun guidance to the production merger retaining unmatched owned CSS', async () => {
    const ownedRule = (hex: string): OwnedCssRule => ({
      owner: 'flex-layout-codemod',
      id: hex.repeat(64),
      className: `flm-${hex.repeat(64)}`,
      family: 'layout',
      declarations: [{ property: 'display', value: 'flex' }],
      context: { priority: 0 },
    });
    const retainedRule = ownedRule('a');
    const incomingRule = ownedRule('b');
    const existing = serializeOwnedCssBlock([retainedRule, incomingRule], '\n');

    expect(mergeOwnedStylesheet(existing, [incomingRule])).toEqual({ changed: false, output: existing });
    expect(mergeOwnedStylesheet(existing, [])).toEqual({ changed: false, output: existing });

    const guidance = await readFile(new URL('../../website/content/safety/reruns.md', import.meta.url), 'utf8');
    expect(guidance).toContain('retains unmatched valid owned rules');
    expect(guidance).toContain('do not garbage-collect stale owned CSS or remove its file');
    expect(guidance).toContain('no complete-project pruning mode');
    expect(guidance).not.toContain('removal when no owned rules remain');
  });
});

function rebuild(report: MigrationReport): MigrationReport {
  const files = report.files.map(file => ({
    inputPath: file.path === report.input ? report.input : `${report.input}/${file.path}`,
    outputPath: file.path === report.output ? report.output : `${report.output}/${file.path}`,
    changed: file.changed,
    results: file.results.map(result => conversionResult(report.input, result)),
  })) satisfies readonly FileMigrationResult[];

  return new MigrationReportBuilder().build(
    report.input,
    report.output,
    report.target,
    report.mode,
    report.application,
    report.durationMs,
    files,
    report.stylesheet,
  );
}

function conversionResult(fileName: string, result: ReportResult): ConversionResult {
  if (result.status === 'parse-error') {
    return {
      status: result.status,
      fileName,
      code: result.code,
      reason: result.reason,
      source: { start: result.offset, end: result.offset + 1 },
    };
  }

  const input = {
    id: `${fileName}:${result.offset}`,
    fileName,
    elementId: String(result.offset),
    sourceName: result.sourceName,
    directive: result.directive as FlexLayoutDirective,
    value: '',
    binding: 'literal' as const,
    breakpoint: undefined,
    source: { start: result.offset, end: result.offset + 1 },
    nameSource: { start: result.offset, end: result.offset + 1 },
  };
  if (result.status === 'converted') return { status: result.status, input };
  return {
    status: result.status,
    input,
    code: result.code,
    reason: result.reason,
    suggestion: result.suggestion,
  };
}
