import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TailwindAdapter } from '../adapter/tailwind/tailwind.adapter';
import { FileMigrator } from './file.migrator';

describe('FileMigrator', () => {
  let temporaryDirectory: string;
  let input: string;
  let output: string;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'flex-layout-codemod-'));
    input = join(temporaryDirectory, 'input.html');
    output = join(temporaryDirectory, 'output', 'result.html');
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  test('returns a changed result and writes a static template by default', async () => {
    await writeFile(input, '<div fxLayout="column" fxLayoutGap="4"></div>', 'utf8');

    const result = await new FileMigrator(new TailwindAdapter(), input, output).migrate();

    expect(await readFile(output, 'utf8')).toBe('<div class="flex flex-col box-border gap-4"></div>');
    expect(result).toMatchObject({ inputPath: input, outputPath: output, changed: true });
    expect(result.results.map(item => item.status)).toEqual(['converted', 'converted']);
  });

  test('returns conversion results without writing in dry-run mode', async () => {
    await writeFile(input, '<div fxLayout="row"></div>', 'utf8');

    const result = await new FileMigrator(new TailwindAdapter(), input, output).migrate({ write: false });

    expect(result).toMatchObject({ inputPath: input, outputPath: output, changed: true });
    expect(result.results.map(item => item.status)).toEqual(['converted']);
    await expect(access(output)).rejects.toThrow();
  });

  test.each([
    ['<div [fxFlex]="basis"></div>', 'dynamic-binding'],
    ['<div fxLayout.sm="row"></div>', 'breakpoint-unverified'],
    ['<div fxLayout.cinema="row"></div>', 'custom-breakpoint'],
  ])('returns unchanged for unresolved input %s', async (source, code) => {
    await writeFile(input, source, 'utf8');

    const result = await new FileMigrator(new TailwindAdapter(), input, output).migrate();

    expect(result.changed).toBe(false);
    expect(result.results).toContainEqual(expect.objectContaining({ status: 'review', code }));
    await expect(access(output)).rejects.toThrow();
  });

  test('returns an unchanged parse diagnostic and does not write malformed templates', async () => {
    await writeFile(input, '<span fxLayout="row" />', 'utf8');

    const result = await new FileMigrator(new TailwindAdapter(), input, output).migrate();

    expect(result.changed).toBe(false);
    expect(result.results).toContainEqual(
      expect.objectContaining({ status: 'parse-error', code: 'template-parse-error' }),
    );
    await expect(access(output)).rejects.toThrow();
  });

  test('returns unchanged and does not create output when a valid template needs no edits', async () => {
    await writeFile(input, '<div class="card"></div>', 'utf8');

    const result = await new FileMigrator(new TailwindAdapter(), input, output).migrate();

    expect(result.changed).toBe(false);
    expect(result.results).toEqual([]);
    await expect(access(output)).rejects.toThrow();
  });

  test('is idempotent when rerun in place', async () => {
    await writeFile(input, '<div fxLayout="row"></div>', 'utf8');
    const migrator = new FileMigrator(new TailwindAdapter(), input, input);

    expect((await migrator.migrate()).results.map(result => result.status)).toEqual(['converted']);
    const once = await readFile(input, 'utf8');
    expect(await migrator.migrate()).toMatchObject({ changed: false, results: [] });
    expect(await readFile(input, 'utf8')).toBe(once);
  });
});
