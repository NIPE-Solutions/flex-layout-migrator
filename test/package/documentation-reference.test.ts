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
