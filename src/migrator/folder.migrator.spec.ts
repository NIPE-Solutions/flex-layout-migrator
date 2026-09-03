import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TailwindAdapter } from '../adapter/tailwind/tailwind.adapter';
import { TemplateAnalyzer } from '../analyzer/template.analyzer';
import { ConversionPlanner } from '../planner/conversion-planner';
import { AngularTemplateParser } from '../template/angular-template.parser';
import type { FileMigratorDependencies } from './file.migrator';
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

  test('returns one ordered immutable file plan per HTML template without creating outputs', async () => {
    await writeFile(join(inputFolder, 'z-changed.html'), '<div fxLayout="row"></div>', 'utf8');
    await writeFile(join(inputFolder, 'nested', 'b-unchanged.html'), '<div class="card"></div>', 'utf8');
    await writeFile(join(inputFolder, 'notes.txt'), '<div fxLayout="column"></div>', 'utf8');

    const plans = await new FolderMigrator(new TailwindAdapter(), inputFolder, outputFolder).plan();

    expect(Object.isFrozen(plans)).toBe(true);
    expect(plans.map(plan => plan.file.inputPath)).toEqual([
      join(inputFolder, 'nested', 'b-unchanged.html'),
      join(inputFolder, 'z-changed.html'),
    ]);
    expect(
      plans.map(plan => ({ changed: plan.file.changed, statuses: plan.file.results.map(item => item.status) })),
    ).toEqual([
      { changed: false, statuses: [] },
      { changed: true, statuses: ['converted'] },
    ]);
    expect(plans[1]?.artifact?.proposed).toEqual({
      status: 'present',
      contents: '<div class="flex flex-row box-border"></div>',
    });
    await expect(access(outputFolder)).rejects.toThrow();
  });

  test('creates one injected dependency lifecycle per discovered template', async () => {
    await writeFile(join(inputFolder, 'changed.html'), '<div fxLayout="row"></div>', 'utf8');
    await writeFile(join(inputFolder, 'nested', 'unchanged.html'), '<div class="card"></div>', 'utf8');
    const readTemplate = vi.fn(async (filePath: string) => readFile(filePath, 'utf8'));
    const dependencies: FileMigratorDependencies = {
      readTemplate,
      parser: new AngularTemplateParser(),
      analyzer: new TemplateAnalyzer(),
      planner: new ConversionPlanner(),
    };
    const parse = vi.spyOn(dependencies.parser, 'parse');
    const analyze = vi.spyOn(dependencies.analyzer, 'analyze');
    const renderPlan = vi.spyOn(dependencies.planner, 'plan');
    const dependencyFactory = vi.fn(() => dependencies);
    const onDiscoveryPass = vi.fn();

    const plans = await new FolderMigrator(
      new TailwindAdapter(),
      inputFolder,
      outputFolder,
      [],
      dependencyFactory,
      onDiscoveryPass,
    ).plan();

    expect(plans.map(plan => plan.file.changed)).toEqual([true, false]);
    expect(onDiscoveryPass).toHaveBeenCalledOnce();
    expect(dependencyFactory).toHaveBeenCalledTimes(2);
    expect(readTemplate).toHaveBeenCalledTimes(3);
    expect(readTemplate.mock.calls.map(([filePath]) => filePath)).toEqual([
      join(inputFolder, 'changed.html'),
      join(outputFolder, 'changed.html'),
      join(inputFolder, 'nested', 'unchanged.html'),
    ]);
    expect(parse).toHaveBeenCalledTimes(3);
    expect(analyze).toHaveBeenCalledTimes(2);
    expect(renderPlan).toHaveBeenCalledOnce();
  });

  test('orders discovered templates by UTF-16 code units instead of the host locale', async () => {
    await writeFile(join(inputFolder, 'ä.html'), '<div></div>', 'utf8');
    await writeFile(join(inputFolder, 'a.html'), '<div></div>', 'utf8');
    await writeFile(join(inputFolder, 'Z.html'), '<div></div>', 'utf8');

    const plans = await new FolderMigrator(new TailwindAdapter(), inputFolder, outputFolder).plan();

    expect(plans.map(plan => plan.file.inputPath)).toEqual([
      join(inputFolder, 'Z.html'),
      join(inputFolder, 'a.html'),
      join(inputFolder, 'ä.html'),
    ]);
  });

  test('keeps every earlier output untouched when a later template has a parse error', async () => {
    await writeFile(join(inputFolder, 'a-convert.html'), '<div fxLayout="row"></div>', 'utf8');
    await writeFile(join(inputFolder, 'z-invalid.html'), '<span fxLayout="row" />', 'utf8');

    const plans = await new FolderMigrator(new TailwindAdapter(), inputFolder, outputFolder).plan();

    expect(plans.map(plan => plan.file.changed)).toEqual([true, false]);
    expect(plans[0]?.artifact).toMatchObject({ kind: 'template' });
    expect(plans[1]?.file.results).toContainEqual(expect.objectContaining({ status: 'parse-error' }));
    await expect(access(outputFolder)).rejects.toThrow();
  });
});
