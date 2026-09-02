import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConversionAdapter } from '../adapter/conversion-adapter';
import { TailwindAdapter } from '../adapter/tailwind/tailwind.adapter';
import { Migrator } from './migrator';

describe('Migrator', () => {
  let temporaryDirectory: string;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'migrator-'));
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  test('returns a timed dry-run report without writing a changed file', async () => {
    const inputPath = join(temporaryDirectory, 'input', 'card.html');
    const outputPath = join(temporaryDirectory, 'output', 'card.html');
    await mkdir(join(temporaryDirectory, 'input'), { recursive: true });
    await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');
    const clockValues = [1000, 1125];
    const now = () => clockValues.shift() ?? 1125;

    const report = await new Migrator(new TailwindAdapter(), inputPath, outputPath, now).migrate({ dryRun: true });

    expect(report).toMatchObject({
      schemaVersion: 1,
      target: 'tailwind',
      dryRun: true,
      durationMs: 125,
      summary: {
        filesScanned: 1,
        filesChanged: 1,
        converted: 1,
        review: 0,
        unsupported: 0,
        invalid: 0,
        parseErrors: 0,
      },
    });
    expect(report.files).toEqual([
      {
        path: 'card.html',
        changed: true,
        results: [{ status: 'converted', directive: 'fxLayout', sourceName: 'fxLayout', offset: 5 }],
      },
    ]);
    await expect(access(outputPath)).rejects.toThrow();
  });

  test('applies planned template artifacts after a successful Tailwind migration', async () => {
    const inputPath = join(temporaryDirectory, 'input', 'card.html');
    const outputPath = join(temporaryDirectory, 'output', 'card.html');
    await mkdir(join(temporaryDirectory, 'input'), { recursive: true });
    await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');

    const report = await new Migrator(new TailwindAdapter(), inputPath, outputPath, () => 0).migrate({
      dryRun: false,
    });

    expect(report.summary).toMatchObject({ filesScanned: 1, filesChanged: 1, converted: 1 });
    expect(await readFile(outputPath, 'utf8')).toBe('<div class="flex flex-row box-border"></div>');
  });

  test('aggregates every nested folder template into the application report', async () => {
    const inputPath = join(temporaryDirectory, 'input');
    const outputPath = join(temporaryDirectory, 'output');
    await mkdir(join(inputPath, 'nested'), { recursive: true });
    await writeFile(join(inputPath, 'a.html'), '<div fxLayout="column"></div>', 'utf8');
    await writeFile(join(inputPath, 'nested', 'b.html'), '<div class="card"></div>', 'utf8');

    const report = await new Migrator(new TailwindAdapter(), inputPath, outputPath, () => 20).migrate({ dryRun: true });

    expect(report.files.map(file => ({ path: file.path, changed: file.changed }))).toEqual([
      { path: 'a.html', changed: true },
      { path: 'nested/b.html', changed: false },
    ]);
    expect(report.summary).toMatchObject({ filesScanned: 2, filesChanged: 1, converted: 1 });
  });

  test('does not apply any planned template artifact when a folder contains a parse error', async () => {
    const inputPath = join(temporaryDirectory, 'input');
    const outputPath = join(temporaryDirectory, 'output');
    await mkdir(inputPath, { recursive: true });
    await writeFile(join(inputPath, 'a-convert.html'), '<div fxLayout="row"></div>', 'utf8');
    await writeFile(join(inputPath, 'z-invalid.html'), '<span fxLayout="row" />', 'utf8');

    const report = await new Migrator(new TailwindAdapter(), inputPath, outputPath, () => 0).migrate({
      dryRun: false,
    });

    expect(report.summary).toMatchObject({ filesScanned: 2, filesChanged: 1, parseErrors: 1 });
    await expect(access(outputPath)).rejects.toThrow();
  });

  test('rejects unsupported file extensions', async () => {
    const inputPath = join(temporaryDirectory, 'styles.css');
    await writeFile(inputPath, '.card {}', 'utf8');

    await expect(
      new Migrator(new TailwindAdapter(), inputPath, inputPath, () => 0).migrate({ dryRun: false }),
    ).rejects.toThrow(`Unsupported file type: ${inputPath}`);
  });

  test('rejects unsupported targets before creating or changing output', async () => {
    const inputPath = join(temporaryDirectory, 'input.html');
    const missingOutputPath = join(temporaryDirectory, 'new', 'output.html');
    const existingOutputPath = join(temporaryDirectory, 'existing.html');
    await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');
    await writeFile(existingOutputPath, 'preserve me', 'utf8');
    const cssAdapter: ConversionAdapter = {
      name: 'css',
      plan: input => ({ status: 'converted', input, classNames: ['must-not-be-written'] }),
    };

    await expect(new Migrator(cssAdapter, inputPath, missingOutputPath, () => 0).migrate()).rejects.toThrow(
      'Unsupported migration target: css',
    );
    await expect(access(missingOutputPath)).rejects.toThrow();

    await expect(new Migrator(cssAdapter, inputPath, existingOutputPath, () => 0).migrate()).rejects.toThrow(
      'Unsupported migration target: css',
    );
    expect(await readFile(existingOutputPath, 'utf8')).toBe('preserve me');
  });
});
