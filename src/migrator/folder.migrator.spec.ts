import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AdapterFactory } from '../adapter/adapter.factory';
import { AnalyzeProjectStage } from '../pipeline/analyze/analyze-project.stage';
import { ApplyProjectStage } from '../pipeline/apply/apply-project.stage';
import { DiscoverProjectStage } from '../pipeline/discover/discover-project.stage';
import { MigrationPipeline } from '../pipeline/migration-pipeline';
import { MigrationRunner } from '../pipeline/migration-runner';
import { migrationInvocation } from '../pipeline/project-manifest';
import { RenderProjectStage, type RenderTemplatePlanner } from '../pipeline/render/render-project.stage';
import { ValidateProjectStage } from '../pipeline/validate/validate-project.stage';
import { ConversionPlanner } from '../planner/conversion-planner';
import type { MigrationTransaction } from '../transaction/migration-transaction';

describe('folder migration pipeline', () => {
  let temporaryDirectory: string;
  let inputFolder: string;
  let outputFolder: string;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'folder-analyzed-project-'));
    inputFolder = join(temporaryDirectory, 'input');
    outputFolder = join(temporaryDirectory, 'output');
    await mkdir(join(inputFolder, 'Z'), { recursive: true });
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  test('renders nested templates once in the authoritative manifest order without creating outputs', async () => {
    await writeFile(join(inputFolder, 'a.html'), '<div fxLayout="row"></div>', 'utf8');
    await writeFile(join(inputFolder, 'Z', 'nested.html'), '<div class="card"></div>', 'utf8');
    await writeFile(join(inputFolder, 'notes.txt'), '<div fxLayout="column"></div>', 'utf8');
    const invocation = migrationInvocation({
      inputPath: inputFolder,
      outputPath: outputFolder,
      options: { mode: 'plan' },
    });
    let discoveredPaths: readonly string[] = [];
    const discover = new DiscoverProjectStage();
    const renderedPaths: string[] = [];
    const planner = new ConversionPlanner();
    const templatePlanner: RenderTemplatePlanner = {
      plan(template, renderer, options) {
        renderedPaths.push(template.file.inputPath);
        return planner.plan(template.source, template.parseResult.elements, template.inputs, renderer, options);
      },
    };
    const report = await new MigrationRunner(
      new MigrationPipeline(
        {
          async run(received) {
            const manifest = await discover.run(received);
            discoveredPaths = manifest.templates.map(template => template.inputPath);
            return manifest;
          },
        },
        new AnalyzeProjectStage(),
        new RenderProjectStage(AdapterFactory.createSession('tailwind'), templatePlanner),
        new ValidateProjectStage(),
        new ApplyProjectStage('plan', transactionDouble()),
      ),
      undefined,
      () => 0,
    ).run(invocation);

    expect(discoveredPaths).toEqual([join(inputFolder, 'Z', 'nested.html'), join(inputFolder, 'a.html')]);
    expect(renderedPaths).toEqual(discoveredPaths);
    expect(report.files.map(file => ({ path: file.path, changed: file.changed }))).toEqual([
      { path: 'Z/nested.html', changed: false },
      { path: 'a.html', changed: true },
    ]);
    await expect(access(outputFolder)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('keeps every planned artifact unapplied when a later analyzed template has a parse error', async () => {
    await writeFile(join(inputFolder, 'a-convert.html'), '<div fxLayout="row"></div>', 'utf8');
    await writeFile(join(inputFolder, 'z-invalid.html'), '<span fxLayout="row" />', 'utf8');
    const invocation = migrationInvocation({
      inputPath: inputFolder,
      outputPath: outputFolder,
      options: { mode: 'write' },
    });
    const transaction = transactionDouble();
    const report = await new MigrationRunner(
      new MigrationPipeline(
        new DiscoverProjectStage(),
        new AnalyzeProjectStage(),
        new RenderProjectStage(AdapterFactory.createSession('tailwind')),
        new ValidateProjectStage(),
        new ApplyProjectStage('write', transaction),
      ),
      undefined,
      () => 0,
    ).run(invocation);

    expect(report).toMatchObject({
      application: { status: 'skipped', reason: 'parse-errors' },
      summary: { filesScanned: 2, filesChanged: 1, converted: 1, parseErrors: 1 },
    });
    expect(transaction.preflight).not.toHaveBeenCalled();
    expect(transaction.apply).not.toHaveBeenCalled();
    await expect(access(outputFolder)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

function transactionDouble() {
  return {
    preflight: vi.fn<MigrationTransaction['preflight']>().mockResolvedValue(undefined),
    apply: vi.fn<MigrationTransaction['apply']>().mockResolvedValue(undefined),
  };
}
