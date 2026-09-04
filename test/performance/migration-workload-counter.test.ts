import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { AdapterFactory } from '../../src/adapter/adapter.factory';
import { TemplateAnalyzer } from '../../src/analyzer/template.analyzer';
import { ConversionPlanner } from '../../src/planner/conversion-planner';
import { Migrator } from '../../src/migrator/migrator';
import type { MigrationMode } from '../../src/migrator/migration-mode';
import { StylesheetPlanner } from '../../src/migrator/stylesheet.planner';
import { AnalyzeProjectStage } from '../../src/pipeline/analyze/analyze-project.stage';
import { DiscoverProjectStage } from '../../src/pipeline/discover/discover-project.stage';
import { CurrentMigrationPipeline, type MigratorFactory } from '../../src/pipeline/current-migration.pipeline';
import type { AnalyzeStage, DiscoverStage, RenderStage, ValidateStage } from '../../src/pipeline/migration-pipeline';
import { migrationInvocation } from '../../src/pipeline/project-manifest';
import { RenderProjectStage, type RenderTemplatePlanner } from '../../src/pipeline/render/render-project.stage';
import { CssReferenceCollector } from '../../src/pipeline/validate/css-reference.collector';
import { TemplateProposalValidator } from '../../src/pipeline/validate/template-proposal.validator';
import { ValidateProjectStage } from '../../src/pipeline/validate/validate-project.stage';
import type { ConversionRenderer } from '../../src/render/conversion-renderer';
import type { RenderSession } from '../../src/render/render-session';
import { AngularTemplateParser } from '../../src/template/angular-template.parser';
import type { MigrationTransaction } from '../../src/transaction/migration-transaction';

interface MigrationWorkloadCounts {
  discoveryPasses: number;
  templatesDiscovered: number;
  templateReads: number;
  initialParses: number;
  validationParses: number;
  renderedTemplates: number;
  stylesheetReads: number;
  projectWrites: number;
}

interface MigrationWorkloadEvidence {
  readonly analyzedPaths: string[];
  readonly changedTemplatePaths: string[];
  readonly destinationReadPaths: string[];
  readonly discoveredPaths: string[];
  readonly discoveredOutputPaths: string[];
  readonly initialParsePaths: string[];
  readonly originalReadPaths: string[];
  readonly referenceParsePaths: string[];
  readonly validationParsePaths: string[];
  convertedFamilies: number;
  parsedTemplates: number;
  semanticPlanningPasses: number;
  targetRenders: number;
  targetSessionFinalizations: number;
}

const workloadEvidence = new WeakMap<MigrationWorkloadCounts, MigrationWorkloadEvidence>();

describe('migration workload counters', () => {
  let temporaryDirectory: string;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'migration-workload-'));
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  test('records the current baseline for single-file Tailwind plan and write modes', async () => {
    const planCounts = emptyCounts();
    const planInput = join(temporaryDirectory, 'plan', 'input.html');
    const planOutput = join(temporaryDirectory, 'plan', 'output.html');
    await mkdir(dirname(planInput), { recursive: true });
    await writeFile(planInput, '<div fxLayout="row"></div>', 'utf8');

    await executeSingleFile(tailwindSession(), planInput, planOutput, 'plan', planCounts);

    expectSingleOwnerEvidence(planCounts);

    expect(planCounts).toEqual({
      discoveryPasses: 1,
      templatesDiscovered: 1,
      templateReads: 1,
      initialParses: 1,
      validationParses: 1,
      renderedTemplates: 1,
      stylesheetReads: 0,
      projectWrites: 0,
    } satisfies MigrationWorkloadCounts);

    const writeCounts = emptyCounts();
    const writeInput = join(temporaryDirectory, 'write', 'input.html');
    const writeOutput = join(temporaryDirectory, 'write', 'output.html');
    await mkdir(dirname(writeInput), { recursive: true });
    await writeFile(writeInput, '<div fxLayout="row"></div>', 'utf8');

    await executeSingleFile(tailwindSession(), writeInput, writeOutput, 'write', writeCounts);

    expectSingleOwnerEvidence(writeCounts);

    expect(writeCounts).toEqual({
      discoveryPasses: 1,
      templatesDiscovered: 1,
      templateReads: 1,
      initialParses: 1,
      validationParses: 1,
      renderedTemplates: 1,
      stylesheetReads: 0,
      projectWrites: 1,
    } satisfies MigrationWorkloadCounts);
  });

  test('records the current baseline for folder CSS plan and write modes', async () => {
    const planCounts = emptyCounts();
    const planInput = join(temporaryDirectory, 'plan', 'input');
    const planOutput = join(temporaryDirectory, 'plan', 'output');
    const planStylesheet = join(temporaryDirectory, 'plan', 'flex-layout.css');
    await writeFolderInputs(planInput);

    await executeFolderCss(planInput, planOutput, planStylesheet, 'plan', planCounts);

    expectSingleOwnerEvidence(planCounts);

    expect(planCounts).toEqual({
      discoveryPasses: 1,
      templatesDiscovered: 2,
      templateReads: 2,
      initialParses: 2,
      validationParses: 2,
      renderedTemplates: 2,
      stylesheetReads: 0,
      projectWrites: 0,
    } satisfies MigrationWorkloadCounts);

    const writeCounts = emptyCounts();
    const writeInput = join(temporaryDirectory, 'write', 'input');
    const writeOutput = join(temporaryDirectory, 'write', 'output');
    const writeStylesheet = join(temporaryDirectory, 'write', 'flex-layout.css');
    await writeFolderInputs(writeInput);

    await executeFolderCss(writeInput, writeOutput, writeStylesheet, 'write', writeCounts);

    expectSingleOwnerEvidence(writeCounts);

    expect(writeCounts).toEqual({
      discoveryPasses: 1,
      templatesDiscovered: 2,
      templateReads: 2,
      initialParses: 2,
      validationParses: 2,
      renderedTemplates: 2,
      stylesheetReads: 0,
      projectWrites: 3,
    } satisfies MigrationWorkloadCounts);
  });

  test('records repeated planning work in the current unchanged-rerun baseline', async () => {
    const tailwindInput = join(temporaryDirectory, 'tailwind', 'input.html');
    const tailwindOutput = join(temporaryDirectory, 'tailwind', 'output.html');
    await mkdir(dirname(tailwindInput), { recursive: true });
    await writeFile(tailwindInput, '<div fxLayout="row"></div>', 'utf8');
    await executeSingleFile(tailwindSession(), tailwindInput, tailwindOutput, 'write', emptyCounts());
    const tailwindCounts = emptyCounts();

    await executeSingleFile(tailwindSession(), tailwindInput, tailwindOutput, 'write', tailwindCounts);

    expectSingleOwnerEvidence(tailwindCounts);

    expect(tailwindCounts).toEqual({
      discoveryPasses: 1,
      templatesDiscovered: 1,
      templateReads: 1,
      initialParses: 1,
      validationParses: 1,
      renderedTemplates: 1,
      stylesheetReads: 0,
      projectWrites: 0,
    } satisfies MigrationWorkloadCounts);

    const cssInput = join(temporaryDirectory, 'css', 'input');
    const cssOutput = join(temporaryDirectory, 'css', 'output');
    const cssStylesheet = join(temporaryDirectory, 'css', 'flex-layout.css');
    await writeFolderInputs(cssInput);
    await executeFolderCss(cssInput, cssOutput, cssStylesheet, 'write', emptyCounts());
    const cssCounts = emptyCounts();

    await executeFolderCss(cssInput, cssOutput, cssStylesheet, 'write', cssCounts);

    expectSingleOwnerEvidence(cssCounts);

    expect(cssCounts).toEqual({
      discoveryPasses: 1,
      templatesDiscovered: 2,
      templateReads: 2,
      initialParses: 2,
      validationParses: 2,
      renderedTemplates: 2,
      stylesheetReads: 1,
      projectWrites: 0,
    } satisfies MigrationWorkloadCounts);
  });

  test('does not analyze or validation-reparse a template whose initial parse fails', async () => {
    const counts = emptyCounts();
    const input = join(temporaryDirectory, 'parse-error', 'input.html');
    const output = join(temporaryDirectory, 'parse-error', 'output.html');
    await mkdir(dirname(input), { recursive: true });
    await writeFile(input, '<div', 'utf8');

    await executeSingleFile(tailwindSession(), input, output, 'plan', counts);

    const evidence = evidenceFor(counts);
    expect(evidence.originalReadPaths).toEqual(evidence.discoveredPaths);
    expect(evidence.initialParsePaths).toEqual(evidence.discoveredPaths);
    expect(evidence.analyzedPaths).toEqual([]);
    expect(evidence.changedTemplatePaths).toEqual([]);
    expect(evidence.validationParsePaths).toEqual([]);
    expectRenderOwnership(counts);
  });

  test('does not validation-reparse an unchanged template proposal', async () => {
    const counts = emptyCounts();
    const input = join(temporaryDirectory, 'unchanged', 'input.html');
    const output = join(temporaryDirectory, 'unchanged', 'output.html');
    await mkdir(dirname(input), { recursive: true });
    await writeFile(input, '<div class="card"></div>', 'utf8');

    await executeSingleFile(tailwindSession(), input, output, 'plan', counts);

    expectSingleOwnerEvidence(counts, false);
    expect(evidenceFor(counts).changedTemplatePaths).toEqual([]);
  });
});

async function executeSingleFile(
  session: RenderSession,
  input: string,
  output: string,
  mode: 'plan' | 'write',
  counts: MigrationWorkloadCounts,
): Promise<void> {
  await executeMigration(session, input, output, mode, counts);
}

async function executeFolderCss(
  input: string,
  output: string,
  stylesheetPath: string,
  mode: 'plan' | 'write',
  counts: MigrationWorkloadCounts,
): Promise<void> {
  await executeMigration(AdapterFactory.createSession('css'), input, output, mode, counts, stylesheetPath);
}

async function executeMigration(
  session: RenderSession,
  input: string,
  output: string,
  mode: MigrationMode,
  counts: MigrationWorkloadCounts,
  stylesheetPath?: string,
): Promise<void> {
  const transaction = transactionDouble(counts);
  const stylesheetPlanner = new StylesheetPlanner({
    lstat,
    readFile: async target => {
      counts.stylesheetReads++;
      return readFile(target, 'utf8');
    },
  });
  const discover = countingDiscoverStage(counts);
  const analyze = countingAnalyzeStage(counts);
  const render = countingRenderStage(session, counts);
  const validate = countingValidateStage(counts, stylesheetPlanner);
  const createMigrator: MigratorFactory = validated => new Migrator(validated, () => 0, transaction);
  await new CurrentMigrationPipeline(render, discover, analyze, createMigrator, () => 0, validate).run(
    migrationInvocation({
      inputPath: input,
      outputPath: output,
      options: { mode, ...(stylesheetPath ? { stylesheetPath } : {}) },
    }),
  );
}

function countingDiscoverStage(counts: MigrationWorkloadCounts): DiscoverStage {
  const discover = new DiscoverProjectStage();
  return {
    async run(invocation) {
      counts.discoveryPasses++;
      const manifest = await discover.run(invocation);
      counts.templatesDiscovered += manifest.templates.length;
      evidenceFor(counts).discoveredPaths.push(...manifest.templates.map(template => template.inputPath));
      evidenceFor(counts).discoveredOutputPaths.push(...manifest.templates.map(template => template.outputPath));
      return manifest;
    },
  };
}

function countingAnalyzeStage(counts: MigrationWorkloadCounts): AnalyzeStage {
  const parser = new AngularTemplateParser();
  const analyzer = new TemplateAnalyzer();
  return new AnalyzeProjectStage(
    {
      async read(target) {
        const contents = await readFile(target, 'utf8');
        counts.templateReads++;
        evidenceFor(counts).originalReadPaths.push(target);
        return contents;
      },
    },
    {
      parse(source, fileName) {
        counts.initialParses++;
        evidenceFor(counts).initialParsePaths.push(fileName);
        return parser.parse(source, fileName);
      },
    },
    {
      analyze(fileName, elements) {
        evidenceFor(counts).analyzedPaths.push(fileName);
        return analyzer.analyze(fileName, elements);
      },
    },
  );
}

function countingRenderStage(session: RenderSession, counts: MigrationWorkloadCounts): RenderStage {
  const planner = new ConversionPlanner();
  const evidence = evidenceFor(counts);
  const templatePlanner: RenderTemplatePlanner = {
    plan(template, renderer, options) {
      evidence.semanticPlanningPasses++;
      counts.renderedTemplates++;
      return planner.plan(template.source, template.parseResult.elements, template.inputs, renderer, options);
    },
  };
  const countedSession: RenderSession = {
    renderer: countingRenderer(session.renderer, () => evidence.targetRenders++),
    finalize() {
      evidence.targetSessionFinalizations++;
      return session.finalize();
    },
  };
  const render = new RenderProjectStage(countedSession, templatePlanner);
  return {
    async run(analyzed) {
      evidence.parsedTemplates += analyzed.templates.filter(template => template.status === 'parsed').length;
      const rendered = await render.run(analyzed);
      evidence.convertedFamilies += rendered.files
        .flatMap(file => file.results)
        .filter(result => result.status === 'converted').length;
      return rendered;
    },
  };
}

function countingValidateStage(counts: MigrationWorkloadCounts, stylesheetPlanner: StylesheetPlanner): ValidateStage {
  const validationParser = new AngularTemplateParser();
  const referenceParser = new AngularTemplateParser();
  const evidence = evidenceFor(counts);
  const destinationTemplates = {
    async read(target: string) {
      const contents = await readFile(target, 'utf8');
      evidence.destinationReadPaths.push(target);
      return contents;
    },
  };
  const validate = new ValidateProjectStage(
    new TemplateProposalValidator(
      {
        parse(source, fileName) {
          counts.validationParses++;
          evidence.validationParsePaths.push(fileName);
          return validationParser.parse(source, fileName);
        },
      },
      destinationTemplates,
    ),
    new CssReferenceCollector(
      {
        parse(source, fileName) {
          evidence.referenceParsePaths.push(fileName);
          return referenceParser.parse(source, fileName);
        },
      },
      destinationTemplates,
    ),
    stylesheetPlanner,
  );
  return {
    async run(rendered) {
      const validated = await validate.run(rendered);
      evidence.changedTemplatePaths.push(
        ...validated.plan.files.filter(file => file.changed).map(file => file.outputPath),
      );
      return validated;
    },
  };
}

function countingRenderer(renderer: ConversionRenderer, onRender: () => void): ConversionRenderer {
  return Object.freeze({
    ...renderer,
    render(plan: Parameters<ConversionRenderer['render']>[0], context: Parameters<ConversionRenderer['render']>[1]) {
      onRender();
      return renderer.render(plan, context);
    },
  });
}

function transactionDouble(counts: MigrationWorkloadCounts) {
  return {
    preflight: vi.fn<MigrationTransaction['preflight']>().mockResolvedValue(undefined),
    apply: vi.fn<MigrationTransaction['apply']>().mockImplementation(async plan => {
      for (const artifact of plan.artifacts) {
        counts.projectWrites++;
        if (artifact.proposed.status === 'absent') {
          await rm(artifact.path, { force: true });
          continue;
        }
        await mkdir(dirname(artifact.path), { recursive: true });
        await writeFile(artifact.path, artifact.proposed.contents, 'utf8');
      }
    }),
  };
}

function emptyCounts(): MigrationWorkloadCounts {
  const counts = {
    discoveryPasses: 0,
    templatesDiscovered: 0,
    templateReads: 0,
    initialParses: 0,
    validationParses: 0,
    renderedTemplates: 0,
    stylesheetReads: 0,
    projectWrites: 0,
  };
  workloadEvidence.set(counts, {
    analyzedPaths: [],
    changedTemplatePaths: [],
    destinationReadPaths: [],
    discoveredPaths: [],
    discoveredOutputPaths: [],
    initialParsePaths: [],
    originalReadPaths: [],
    referenceParsePaths: [],
    validationParsePaths: [],
    convertedFamilies: 0,
    parsedTemplates: 0,
    semanticPlanningPasses: 0,
    targetRenders: 0,
    targetSessionFinalizations: 0,
  });
  return counts;
}

function evidenceFor(counts: MigrationWorkloadCounts): MigrationWorkloadEvidence {
  const evidence = workloadEvidence.get(counts);
  if (evidence === undefined) throw new Error('Workload evidence must be initialized with emptyCounts().');
  return evidence;
}

function expectSingleOwnerEvidence(counts: MigrationWorkloadCounts, hasChangedProposal = true): void {
  const evidence = evidenceFor(counts);
  expect(evidence.originalReadPaths).toEqual(evidence.discoveredPaths);
  expect(evidence.initialParsePaths).toEqual(evidence.discoveredPaths);
  expect(evidence.analyzedPaths).toEqual(evidence.discoveredPaths);
  expect(evidence.validationParsePaths).toEqual(hasChangedProposal ? evidence.discoveredOutputPaths : []);
  expectRenderOwnership(counts);
}

function expectRenderOwnership(counts: MigrationWorkloadCounts): void {
  const evidence = evidenceFor(counts);
  expect(evidence.semanticPlanningPasses).toBe(evidence.parsedTemplates);
  expect(evidence.targetSessionFinalizations).toBe(1);
  expect(evidence.targetRenders).toBe(evidence.convertedFamilies);
}

function tailwindSession(): RenderSession {
  return AdapterFactory.createSession('tailwind');
}

async function writeFolderInputs(input: string): Promise<void> {
  await mkdir(join(input, 'nested'), { recursive: true });
  await writeFile(join(input, 'card.html'), '<div fxLayout="row"></div>', 'utf8');
  await writeFile(join(input, 'nested', 'panel.html'), '<div fxLayout="column"></div>', 'utf8');
}
