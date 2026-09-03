import type { ConversionResult } from '../analyzer/conversion-result';
import type { FileMigrationResult } from '../migrator/file-migration-result';
import { MigrationReportBuilder } from './migration-report.builder';

function locatedResult(
  inputPath: string,
  status: 'converted' | 'review' | 'unsupported',
  offset: number,
): ConversionResult {
  const input = {
    id: `${inputPath}:${offset}`,
    fileName: inputPath,
    elementId: `${offset}`,
    sourceName: status === 'converted' ? 'fxLayout' : 'fxFlex',
    directive: status === 'converted' ? ('fxLayout' as const) : ('fxFlex' as const),
    value: status === 'converted' ? 'row' : 'basis',
    binding: 'literal' as const,
    breakpoint: undefined,
    source: { start: offset, end: offset + 10 },
    nameSource: { start: offset, end: offset + 8 },
  };

  if (status === 'converted') return { status, input };

  return {
    status,
    input,
    code: status === 'review' ? 'dynamic-binding' : 'target-unsupported',
    reason: `${status} reason`,
    suggestion: `${status} suggestion`,
  };
}

function file(
  inputPath: string,
  outputPath: string,
  changed: boolean,
  results: readonly ConversionResult[],
): FileMigrationResult {
  return { inputPath, outputPath, changed, results };
}

describe('MigrationReportBuilder', () => {
  test('aggregates sorted POSIX file reports without leaking internal paths or fields', () => {
    const inputRoot = '/private/checkout/templates';
    const outputRoot = '/private/checkout/generated';
    const report = new MigrationReportBuilder().build(inputRoot, outputRoot, 'tailwind', true, 125, [
      file('/private/checkout/templates/nested/b.html', '/private/checkout/generated/nested/b.html', false, [
        locatedResult('/private/checkout/templates/nested/b.html', 'review', 30),
        locatedResult('/private/checkout/templates/nested/b.html', 'unsupported', 45),
      ]),
      file('/private/checkout/templates/a.html', '/private/checkout/generated/a.html', true, [
        locatedResult('/private/checkout/templates/a.html', 'converted', 5),
      ]),
    ]);

    expect(report.files.map(item => item.path)).toEqual(['a.html', 'nested/b.html']);
    expect(report.summary).toEqual({
      filesScanned: 2,
      filesChanged: 1,
      converted: 1,
      review: 1,
      unsupported: 1,
      invalid: 0,
      parseErrors: 0,
    });
    expect(report.files[0]?.results).toEqual([
      { status: 'converted', directive: 'fxLayout', sourceName: 'fxLayout', offset: 5 },
    ]);
    expect(report.files[1]?.results).toEqual([
      {
        status: 'review',
        directive: 'fxFlex',
        sourceName: 'fxFlex',
        offset: 30,
        code: 'dynamic-binding',
        reason: 'review reason',
        suggestion: 'review suggestion',
      },
      {
        status: 'unsupported',
        directive: 'fxFlex',
        sourceName: 'fxFlex',
        offset: 45,
        code: 'target-unsupported',
        reason: 'unsupported reason',
        suggestion: 'unsupported suggestion',
      },
    ]);

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain(inputRoot);
    expect(serialized).not.toContain(outputRoot);
    for (const result of report.files.flatMap(item => item.results)) {
      expect(result).not.toHaveProperty('fileName');
      expect(result).not.toHaveProperty('elementId');
      expect(result).not.toHaveProperty('id');
      expect(result).not.toHaveProperty('source');
      expect(result).not.toHaveProperty('nameSource');
      expect(result).not.toHaveProperty('valueSource');
    }
  });

  test('normalizes Windows paths and maps parse diagnostics to stable offsets', () => {
    const inputRoot = String.raw`C:\workspace\templates`;
    const outputRoot = String.raw`D:\artifacts\templates`;
    const inputPath = String.raw`C:\workspace\templates\nested\broken.html`;
    const report = new MigrationReportBuilder().build(inputRoot, outputRoot, 'tailwind', false, 7.9, [
      file(inputPath, String.raw`D:\artifacts\templates\nested\broken.html`, false, [
        {
          status: 'parse-error',
          fileName: inputPath,
          code: 'template-parse-error',
          reason: 'Unexpected closing tag',
          source: { start: 17, end: 23 },
        },
      ]),
    ]);

    expect(report.files).toEqual([
      {
        path: 'nested/broken.html',
        changed: false,
        results: [
          {
            status: 'parse-error',
            offset: 17,
            code: 'template-parse-error',
            reason: 'Unexpected closing tag',
          },
        ],
      },
    ]);
    expect(report.summary.parseErrors).toBe(1);
    expect(report.application).toEqual({ status: 'skipped', reason: 'parse-errors' });
    expect(report.durationMs).toBe(7);
    expect(JSON.stringify(report)).not.toContain(inputRoot);
    expect(JSON.stringify(report)).not.toContain(outputRoot);
  });

  test('normalizes files under a relative Windows folder root', () => {
    const report = new MigrationReportBuilder().build('templates', 'generated', 'tailwind', false, 0, [
      file(String.raw`templates\nested\a.html`, String.raw`generated\nested\a.html`, false, []),
    ]);

    expect(report.files.map(item => item.path)).toEqual(['nested/a.html']);
  });

  test('sorts report paths by UTF-16 code units instead of the host locale', () => {
    const report = new MigrationReportBuilder().build('/templates', '/generated', 'tailwind', false, 0, [
      file('/templates/ä.html', '/generated/ä.html', false, []),
      file('/templates/a.html', '/generated/a.html', false, []),
      file('/templates/Z.html', '/generated/Z.html', false, []),
    ]);

    expect(report.files.map(item => item.path)).toEqual(['Z.html', 'a.html', 'ä.html']);
  });

  test('uses a basename for single-file input', () => {
    const inputPath = '/private/checkout/card.component.html';
    const report = new MigrationReportBuilder().build(
      inputPath,
      '/private/output/card.component.html',
      'tailwind',
      false,
      0,
      [file(inputPath, '/private/output/card.component.html', false, [])],
    );

    expect(report.files[0]?.path).toBe('card.component.html');
    expect(JSON.stringify(report)).not.toContain('/private/checkout');
    expect(JSON.stringify(report)).not.toContain('/private/output');
  });

  test.each(['created', 'updated', 'removed', 'unchanged'] as const)(
    'reports a %s CSS stylesheet without including it in template totals',
    change => {
      const inputRoot = '/private/checkout/templates';
      const report = new MigrationReportBuilder().build(inputRoot, inputRoot, 'css', false, 0, [], {
        path: `${inputRoot}/flex-layout-migration.css`,
        change,
      });

      expect(report.target).toBe('css');
      expect(report.stylesheet).toEqual({ path: 'flex-layout-migration.css', change });
      expect(report.summary).toEqual({
        filesScanned: 0,
        filesChanged: 0,
        converted: 0,
        review: 0,
        unsupported: 0,
        invalid: 0,
        parseErrors: 0,
      });
    },
  );

  test('keeps the serialized Tailwind report byte-compatible without a stylesheet field', () => {
    const report = new MigrationReportBuilder().build('input.html', 'output.html', 'tailwind', true, 12, [
      file('input.html', 'output.html', false, []),
    ]);

    expect(JSON.stringify(report)).toBe(
      '{"schemaVersion":1,"target":"tailwind","dryRun":true,"input":"input.html","output":"output.html","durationMs":12,"summary":{"filesScanned":1,"filesChanged":0,"converted":0,"review":0,"unsupported":0,"invalid":0,"parseErrors":0},"files":[{"path":"input.html","changed":false,"results":[]}]}',
    );
    expect(report).not.toHaveProperty('stylesheet');
  });
});
