import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TailwindAdapter } from '../adapter/tailwind/tailwind.adapter';
import type { AtomicFileWriter } from '../lib/atomic-file.writer';
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

  test('migrates a static template and returns source-ordered results', async () => {
    await writeFile(input, '<div fxLayout="column" fxLayoutGap="4"></div>', 'utf8');

    const results = await new FileMigrator(new TailwindAdapter(), input, output).migrate();

    expect(await readFile(output, 'utf8')).toBe('<div class="flex flex-col gap-4"></div>');
    expect(results.map(result => result.status)).toEqual(['converted', 'converted']);
  });

  test.each([
    ['<div [fxFlex]="basis"></div>', 'dynamic-binding'],
    ['<div fxLayout.sm="row"></div>', 'breakpoint-unverified'],
    ['<div fxLayout.cinema="row"></div>', 'custom-breakpoint'],
  ])('preserves unresolved input %s', async (source, code) => {
    await writeFile(input, source, 'utf8');
    const writer = { write: vi.fn() } as unknown as AtomicFileWriter;

    const results = await new FileMigrator(new TailwindAdapter(), input, output, writer).migrate();

    expect(writer.write).not.toHaveBeenCalled();
    expect(results).toContainEqual(expect.objectContaining({ status: 'review', code }));
  });

  test('returns parse diagnostics and does not write malformed templates', async () => {
    await writeFile(input, '<span fxLayout="row" />', 'utf8');
    const writer = { write: vi.fn() } as unknown as AtomicFileWriter;

    const results = await new FileMigrator(new TailwindAdapter(), input, output, writer).migrate();

    expect(writer.write).not.toHaveBeenCalled();
    expect(results).toContainEqual(expect.objectContaining({ status: 'parse-error', code: 'template-parse-error' }));
  });

  test('does not create output when a valid template needs no edits', async () => {
    await writeFile(input, '<div class="card"></div>', 'utf8');

    const results = await new FileMigrator(new TailwindAdapter(), input, output).migrate();

    expect(results).toEqual([]);
    await expect(access(output)).rejects.toThrow();
  });

  test('is idempotent when rerun in place', async () => {
    await writeFile(input, '<div fxLayout="row"></div>', 'utf8');
    const migrator = new FileMigrator(new TailwindAdapter(), input, input);

    expect((await migrator.migrate()).map(result => result.status)).toEqual(['converted']);
    const once = await readFile(input, 'utf8');
    expect(await migrator.migrate()).toEqual([]);
    expect(await readFile(input, 'utf8')).toBe(once);
  });
});
