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
});
