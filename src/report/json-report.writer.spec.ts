import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConversionResult } from '../analyzer/conversion-result';
import type { LocatedFlexLayoutInput } from '../analyzer/flex-layout-attribute.analyzer';
import type { FileMigrationResult } from '../migrator/file-migration-result';
import { MigrationReportBuilder } from './migration-report.builder';
import { JsonReportWriter } from './json-report.writer';

function convertedResult(fileName: string): ConversionResult {
  const input: LocatedFlexLayoutInput = {
    id: `${fileName}:12`,
    fileName,
    elementId: 'internal-element',
    sourceName: 'fxLayout',
    directive: 'fxLayout',
    value: 'row',
    binding: 'literal',
    breakpoint: undefined,
    source: { start: 12, end: 20 },
    nameSource: { start: 12, end: 20 },
  };

  return {
    status: 'converted',
    input,
  };
}

function reviewResult(fileName: string): ConversionResult {
  const input: LocatedFlexLayoutInput = {
    id: `${fileName}:31`,
    fileName,
    elementId: 'internal-element',
    sourceName: 'fxFlexAlign.gt-xs',
    directive: 'fxFlexAlign',
    value: 'end',
    binding: 'literal',
    breakpoint: 'gt-xs',
    source: { start: 31, end: 49 },
    nameSource: { start: 31, end: 47 },
  };

  return {
    status: 'review',
    input,
    code: 'responsive-precedence-unverified',
    reason: 'Overlapping responsive ranges emit different utilities for the same directive family.',
    suggestion: 'Simplify overlapping responsive declarations or migrate the family manually.',
  };
}

function visibilityReviewResult(
  fileName: string,
  sourceName: 'fxShow' | 'fxShow.sm',
  offset: number,
): ConversionResult {
  const input: LocatedFlexLayoutInput = {
    id: `${fileName}:${offset}`,
    fileName,
    elementId: 'visibility-element',
    sourceName,
    directive: 'fxShow',
    value: sourceName === 'fxShow' ? 'false' : '',
    binding: 'literal',
    breakpoint: sourceName === 'fxShow' ? undefined : 'sm',
    source: { start: offset, end: offset + sourceName.length },
    nameSource: { start: offset, end: offset + sourceName.length },
  };

  return {
    status: 'review',
    input,
    code: 'display-restoration-unverified',
    reason: 'The visible display value cannot be proven from one unambiguous source.',
    suggestion: 'Provide one unambiguous visible display value or migrate this visibility family manually.',
  };
}

function extendedReviewResult(
  fileName: string,
  directive: 'ngClass' | 'ngStyle',
  code: 'tailwind-candidate-unverified' | 'style-value-unverified',
  offset: number,
): ConversionResult {
  const sourceName = `${directive}.sm`;
  const input: LocatedFlexLayoutInput = {
    id: `${fileName}:${offset}`,
    fileName,
    elementId: 'extended-element',
    sourceName,
    directive,
    value: directive === 'ngClass' ? 'dashboard-panel' : 'background-image:url(card.png)',
    binding: 'literal',
    breakpoint: 'sm',
    source: { start: offset, end: offset + sourceName.length },
    nameSource: { start: offset, end: offset + sourceName.length },
  };

  return {
    status: 'review',
    input,
    code,
    reason:
      directive === 'ngClass'
        ? 'The class may be application-defined or supplied by a Tailwind plugin.'
        : 'The declaration cannot be sanitized and encoded exactly.',
    suggestion: 'Review this occurrence and migrate it manually when its project-specific behavior is known.',
  };
}

function file(inputPath: string): FileMigrationResult {
  return {
    inputPath,
    outputPath: inputPath.replace('/templates/', '/generated/'),
    changed: true,
    results: [convertedResult(inputPath)],
  };
}

describe('JsonReportWriter', () => {
  test('writes a portable versioned report with stable JSON formatting', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'json-report-writer-'));
    const inputRoot = '/private/checkout/templates';
    const outputRoot = '/private/checkout/generated';
    const report = new MigrationReportBuilder().build(inputRoot, outputRoot, 'tailwind', true, 12.9, [
      file(`${inputRoot}/nested/card.component.html`),
    ]);
    const target = join(directory, 'reports', 'migration.json');

    try {
      await new JsonReportWriter().write(target, report);

      const contents = await readFile(target, 'utf8');
      expect(JSON.parse(contents)).toEqual(report);
      expect(contents).toBe(`${JSON.stringify(report, null, 2)}\n`);
      expect(contents).toContain('  "schemaVersion": 1,');
      expect(report.files[0]?.path).toBe('nested/card.component.html');
      expect(contents).not.toContain(inputRoot);
      expect(contents).not.toContain(outputRoot);
      expect(contents).not.toContain(`${String.fromCharCode(0x1b)}[`);
      expect(contents).not.toContain('elementId');
      expect(contents).not.toContain('fileName');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('propagates atomic writer failures', async () => {
    const failure = new Error('report failed');
    const writer = { write: vi.fn().mockRejectedValue(failure) };
    const report = new MigrationReportBuilder().build('templates', 'generated', 'tailwind', false, 0, []);

    await expect(new JsonReportWriter(writer).write('report.json', report)).rejects.toThrow('report failed');
    expect(writer.write).toHaveBeenCalledOnce();
  });

  test('preserves responsive safety diagnostic codes in the public report', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'json-report-writer-'));
    const inputRoot = '/private/checkout/templates';
    const outputRoot = '/private/checkout/generated';
    const inputPath = `${inputRoot}/card.component.html`;
    const report = new MigrationReportBuilder().build(inputRoot, outputRoot, 'tailwind', false, 0, [
      {
        ...file(inputPath),
        changed: false,
        results: [reviewResult(inputPath)],
      },
    ]);

    const target = join(directory, 'reports', 'migration.json');

    try {
      await new JsonReportWriter().write(target, report);

      expect(JSON.parse(await readFile(target, 'utf8'))).toMatchObject({
        summary: { converted: 0, review: 1 },
        files: [
          {
            results: [
              {
                status: 'review',
                sourceName: 'fxFlexAlign.gt-xs',
                code: 'responsive-precedence-unverified',
              },
            ],
          },
        ],
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('preserves exact visibility restoration diagnostics and counts in the public report', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'json-report-writer-'));
    const inputRoot = '/private/checkout/templates';
    const outputRoot = '/private/checkout/generated';
    const inputPath = `${inputRoot}/visibility.component.html`;
    const report = new MigrationReportBuilder().build(inputRoot, outputRoot, 'tailwind', false, 0, [
      {
        ...file(inputPath),
        changed: false,
        results: [visibilityReviewResult(inputPath, 'fxShow', 12), visibilityReviewResult(inputPath, 'fxShow.sm', 27)],
      },
    ]);
    const target = join(directory, 'reports', 'migration.json');

    try {
      await new JsonReportWriter().write(target, report);

      expect(JSON.parse(await readFile(target, 'utf8'))).toMatchObject({
        summary: {
          filesScanned: 1,
          filesChanged: 0,
          converted: 0,
          review: 2,
          unsupported: 0,
          invalid: 0,
          parseErrors: 0,
        },
        files: [
          {
            changed: false,
            results: [
              {
                status: 'review',
                sourceName: 'fxShow',
                code: 'display-restoration-unverified',
              },
              {
                status: 'review',
                sourceName: 'fxShow.sm',
                code: 'display-restoration-unverified',
              },
            ],
          },
        ],
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('preserves responsive class and style review diagnostics as occurrence-level report results', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'json-report-writer-'));
    const inputRoot = '/private/checkout/templates';
    const outputRoot = '/private/checkout/generated';
    const inputPath = `${inputRoot}/extended.component.html`;
    const report = new MigrationReportBuilder().build(inputRoot, outputRoot, 'tailwind', false, 0, [
      {
        ...file(inputPath),
        changed: false,
        results: [
          extendedReviewResult(inputPath, 'ngClass', 'tailwind-candidate-unverified', 12),
          extendedReviewResult(inputPath, 'ngStyle', 'style-value-unverified', 54),
        ],
      },
    ]);
    const target = join(directory, 'reports', 'migration.json');

    try {
      await new JsonReportWriter().write(target, report);

      expect(JSON.parse(await readFile(target, 'utf8'))).toMatchObject({
        summary: { converted: 0, review: 2, unsupported: 0, invalid: 0, parseErrors: 0 },
        files: [
          {
            results: [
              {
                status: 'review',
                directive: 'ngClass',
                sourceName: 'ngClass.sm',
                code: 'tailwind-candidate-unverified',
              },
              {
                status: 'review',
                directive: 'ngStyle',
                sourceName: 'ngStyle.sm',
                code: 'style-value-unverified',
              },
            ],
          },
        ],
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
