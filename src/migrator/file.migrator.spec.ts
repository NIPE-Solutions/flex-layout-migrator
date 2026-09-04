import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AdapterFactory } from '../adapter/adapter.factory';
import { TemplateAnalyzer } from '../analyzer/template.analyzer';
import { AnalyzeProjectStage } from '../pipeline/analyze/analyze-project.stage';
import { ApplyProjectStage } from '../pipeline/apply/apply-project.stage';
import { DiscoverProjectStage } from '../pipeline/discover/discover-project.stage';
import { CurrentMigrationPipeline, type MigratorFactory } from '../pipeline/current-migration.pipeline';
import { migrationInvocation } from '../pipeline/project-manifest';
import { RenderProjectStage, type RenderTemplatePlanner } from '../pipeline/render/render-project.stage';
import { TemplateProposalValidator } from '../pipeline/validate/template-proposal.validator';
import { ValidateProjectStage } from '../pipeline/validate/validate-project.stage';
import { ConversionPlanner } from '../planner/conversion-planner';
import { AngularTemplateParser } from '../template/angular-template.parser';
import type { MigrationTransaction } from '../transaction/migration-transaction';
import { Migrator } from './migrator';

describe('production analyzed-file handoff', () => {
  let temporaryDirectory: string;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'analyzed-file-handoff-'));
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  test('reads, initially parses, and analyzes once before rendering the exact analyzed template', async () => {
    const inputPath = join(temporaryDirectory, 'input.html');
    const outputPath = join(temporaryDirectory, 'output.html');
    const source = '<div fxLayout="row"></div>';
    await writeFile(inputPath, source, 'utf8');
    const session = AdapterFactory.createSession('tailwind');
    const sourceReads: string[] = [];
    const initialParses: string[] = [];
    const analyzedPaths: string[] = [];
    const renderedSources: string[] = [];
    const validationParses: string[] = [];
    const destinationReads: string[] = [];
    const parser = new AngularTemplateParser();
    const analyzer = new TemplateAnalyzer();
    const planner = new ConversionPlanner();
    const analyze = new AnalyzeProjectStage(
      {
        async read(filePath) {
          sourceReads.push(filePath);
          return readFile(filePath, 'utf8');
        },
      },
      {
        parse(contents, fileName) {
          initialParses.push(fileName);
          return parser.parse(contents, fileName);
        },
      },
      {
        analyze(fileName, elements) {
          analyzedPaths.push(fileName);
          return analyzer.analyze(fileName, elements);
        },
      },
    );
    const destinationTemplates = {
      async read(filePath: string) {
        destinationReads.push(filePath);
        return readFile(filePath, 'utf8');
      },
    };
    const templatePlanner: RenderTemplatePlanner = {
      plan(template, renderer, options) {
        renderedSources.push(template.source);
        return planner.plan(template.source, template.parseResult.elements, template.inputs, renderer, options);
      },
    };
    const validator = new TemplateProposalValidator(
      {
        parse(contents, fileName) {
          validationParses.push(fileName);
          return parser.parse(contents, fileName);
        },
      },
      destinationTemplates,
    );
    const render = new RenderProjectStage(session, templatePlanner);
    const validate = new ValidateProjectStage(validator);
    const transaction = transactionDouble();
    const createMigrator: MigratorFactory = applied => new Migrator(applied, () => 0);
    const invocation = migrationInvocation({ inputPath, outputPath, options: { mode: 'plan' } });

    const report = await new CurrentMigrationPipeline(
      render,
      new DiscoverProjectStage(),
      analyze,
      createMigrator,
      Date.now,
      validate,
      mode => new ApplyProjectStage(mode, transaction),
    ).run(invocation);

    expect(report).toMatchObject({
      application: { status: 'skipped', reason: 'plan-only' },
      summary: { filesScanned: 1, filesChanged: 1, converted: 1, parseErrors: 0 },
    });
    expect(sourceReads).toEqual([inputPath]);
    expect(initialParses).toEqual([inputPath]);
    expect(analyzedPaths).toEqual([inputPath]);
    expect(renderedSources).toEqual([source]);
    expect(validationParses).toEqual([outputPath]);
    expect(destinationReads).toEqual([outputPath]);
    expect(transaction.preflight).toHaveBeenCalledOnce();
    expect(transaction.apply).not.toHaveBeenCalled();
    await expect(access(outputPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

function transactionDouble() {
  return {
    preflight: vi.fn<MigrationTransaction['preflight']>().mockResolvedValue(undefined),
    apply: vi.fn<MigrationTransaction['apply']>().mockResolvedValue(undefined),
  };
}
