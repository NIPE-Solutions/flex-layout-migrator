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

    expect(await readFile(output, 'utf8')).toBe('<div class="flex flex-col box-border gap-[4px]"></div>');
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
    ['<div fxLayout.cinema="row"></div>', 'custom-breakpoint'],
  ])('returns unchanged for unresolved input %s', async (source, code) => {
    await writeFile(input, source, 'utf8');

    const result = await new FileMigrator(new TailwindAdapter(), input, output).migrate();

    expect(result.changed).toBe(false);
    expect(result.results).toContainEqual(expect.objectContaining({ status: 'review', code }));
    await expect(access(output)).rejects.toThrow();
  });

  test('writes exact standard responsive variants without unresolved diagnostics', async () => {
    await writeFile(input, '<div fxLayout.sm="row"></div>', 'utf8');

    const result = await new FileMigrator(new TailwindAdapter(), input, output).migrate();

    expect(await readFile(output, 'utf8')).toBe(
      '<div class="[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:flex [@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:flex-row [@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:box-border"></div>',
    );
    expect(result.results.map(item => item.status)).toEqual(['converted']);
  });

  test('returns exact public results for mixed converted and unresolved visibility inputs', async () => {
    await writeFile(
      input,
      '<div fxHide></div>\n<div class="block" fxShow="false" fxShow.sm></div>\n<div fxShow="false" fxShow.sm></div>\n<div [fxHide]="hidden"></div>',
      'utf8',
    );

    const result = await new FileMigrator(new TailwindAdapter(), input, output).migrate();

    expect(await readFile(output, 'utf8')).toBe(
      '<div class="hidden"></div>\n<div class="block hidden [@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:block"></div>\n<div fxShow="false" fxShow.sm></div>\n<div [fxHide]="hidden"></div>',
    );
    expect(
      result.results.map(item => ({
        status: item.status,
        sourceName: item.status === 'parse-error' ? undefined : item.input.sourceName,
        code: item.status === 'converted' || item.status === 'parse-error' ? undefined : item.code,
      })),
    ).toEqual([
      { status: 'converted', sourceName: 'fxHide', code: undefined },
      { status: 'converted', sourceName: 'fxShow', code: undefined },
      { status: 'converted', sourceName: 'fxShow.sm', code: undefined },
      { status: 'review', sourceName: 'fxShow', code: 'display-restoration-unverified' },
      { status: 'review', sourceName: 'fxShow.sm', code: 'display-restoration-unverified' },
      { status: 'review', sourceName: '[fxHide]', code: 'dynamic-binding' },
    ]);
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
