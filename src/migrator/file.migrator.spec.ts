import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IConverter } from '../converter/converter';
import { FileMigrator } from './file.migrator';

describe('FileMigrator', () => {
  let temporaryDirectory: string;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'flex-layout-codemod-'));
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  test('migrates a template through the converter and writes the result', async () => {
    const input = join(temporaryDirectory, 'input.html');
    const output = join(temporaryDirectory, 'output', 'result.html');
    await writeFile(input, '<div fxFlex="100%"></div>', 'utf8');

    const converter = {
      canConvert: vi.fn(() => true),
      prepare: vi.fn(() => ({ usesPropertyBinding: false })),
      convert: vi.fn((_attribute, _values, element) => element.addClass('flex-full')),
      getAllAttributes: vi.fn(() => ['fxFlex']),
      isSupportedFileExtension: vi.fn(() => true),
      getPrettierConfig: vi.fn(() => ({ parser: 'angular' as const })),
    } as unknown as IConverter;

    await new FileMigrator(converter, input, output).migrate();

    expect(converter.getAllAttributes).toHaveBeenCalledOnce();
    expect(converter.canConvert).toHaveBeenCalledWith('fxFlex', false);
    expect(converter.convert).toHaveBeenCalledOnce();
    const migrated = await readFile(output, 'utf8');
    expect(migrated).toContain('class="flex-full"');
    expect(migrated).not.toContain('fxFlex');
  });
});
