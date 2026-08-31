import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IConverter } from '../converter/converter';
import { TailwindCssConverter } from '../converter/tailwind/tailwind.converter';
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

  test('migrates a template through the converter and writes the result', async () => {
    await writeFile(input, '<div fxFlex="100%"></div>', 'utf8');

    const converter = {
      canConvert: vi.fn(() => true),
      prepare: vi.fn(() => ({ usesPropertyBinding: false })),
      convert: vi.fn((_attribute, _values, element) => element.addClass('flex-full')),
      getAllAttributes: vi.fn(() => ['fxFlex']),
      isSupportedFileExtension: vi.fn(() => true),
      getPrettierConfig: vi.fn(() => ({ parser: 'angular' as const })),
    } as unknown as IConverter;

    const migrator = new FileMigrator(converter, input, output);
    await migrator.migrate();

    expect(converter.canConvert).toHaveBeenCalledWith('fxFlex', false);
    expect(converter.convert).toHaveBeenCalledOnce();
    const migrated = await readFile(output, 'utf8');
    expect(migrated).toContain('class="flex-full"');
    expect(migrated).not.toContain('fxFlex');
    expect(migrator.getResults()).toEqual([
      expect.objectContaining({
        status: 'converted',
        input: expect.objectContaining({ directive: 'fxFlex', value: '100%' }),
      }),
    ]);
  });

  test('preserves dynamic bindings instead of approximating them', async () => {
    await writeFile(input, '<div [fxFlex]="basis"></div>', 'utf8');
    const migrator = new FileMigrator(new TailwindCssConverter(), input, output);

    await migrator.migrate();

    expect(await readFile(output, 'utf8')).toContain('[fxFlex]="basis"');
    expect(migrator.getResults()).toContainEqual(
      expect.objectContaining({
        status: 'review',
        code: 'dynamic-binding',
      }),
    );
  });

  test('preserves recognized inputs unsupported by the adapter', async () => {
    await writeFile(input, '<div fxShow="false"></div>', 'utf8');
    const migrator = new FileMigrator(new TailwindCssConverter(), input, output);

    await migrator.migrate();

    expect(await readFile(output, 'utf8')).toContain('fxShow="false"');
    expect(migrator.getResults()).toContainEqual(
      expect.objectContaining({
        status: 'unsupported',
        code: 'target-unsupported',
      }),
    );
  });

  test('preserves responsive inputs until exact media queries are implemented', async () => {
    await writeFile(input, '<div fxLayout.sm="row"></div>', 'utf8');
    const migrator = new FileMigrator(new TailwindCssConverter(), input, output);

    await migrator.migrate();

    expect(await readFile(output, 'utf8')).toContain('fxLayout.sm="row"');
    expect(migrator.getResults()).toContainEqual(
      expect.objectContaining({
        status: 'review',
        code: 'breakpoint-unverified',
      }),
    );
  });

  test('preserves custom breakpoints for review', async () => {
    await writeFile(input, '<div fxLayout.cinema="row"></div>', 'utf8');
    const migrator = new FileMigrator(new TailwindCssConverter(), input, output);

    await migrator.migrate();

    expect(await readFile(output, 'utf8')).toContain('fxLayout.cinema="row"');
    expect(migrator.getResults()).toContainEqual(
      expect.objectContaining({
        status: 'review',
        code: 'custom-breakpoint',
      }),
    );
  });
});
