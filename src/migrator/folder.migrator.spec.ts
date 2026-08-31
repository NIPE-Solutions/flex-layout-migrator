import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TailwindAdapter } from '../adapter/tailwind/tailwind.adapter';
import { FolderMigrator } from './folder.migrator';

describe('FolderMigrator', () => {
  let temporaryDirectory: string;
  let inputFolder: string;
  let outputFolder: string;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'folder-migrator-'));
    inputFolder = join(temporaryDirectory, 'input');
    outputFolder = join(temporaryDirectory, 'output');
    await mkdir(join(inputFolder, 'nested'), { recursive: true });
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  test('returns one ordered file result per HTML template, including unchanged templates', async () => {
    await writeFile(join(inputFolder, 'z-changed.html'), '<div fxLayout="row"></div>', 'utf8');
    await writeFile(join(inputFolder, 'nested', 'b-unchanged.html'), '<div class="card"></div>', 'utf8');
    await writeFile(join(inputFolder, 'notes.txt'), '<div fxLayout="column"></div>', 'utf8');

    const results = await new FolderMigrator(new TailwindAdapter(), inputFolder, outputFolder).migrate({
      write: false,
    });

    expect(results.map(result => result.inputPath)).toEqual([
      join(inputFolder, 'nested', 'b-unchanged.html'),
      join(inputFolder, 'z-changed.html'),
    ]);
    expect(
      results.map(result => ({ changed: result.changed, statuses: result.results.map(item => item.status) })),
    ).toEqual([
      { changed: false, statuses: [] },
      { changed: true, statuses: ['converted'] },
    ]);
    await expect(access(outputFolder)).rejects.toThrow();
  });
});
