import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { AdapterFactory } from '../../src/adapter/adapter.factory';
import type { ConversionAdapterSession } from '../../src/adapter/conversion-adapter.session';
import { TemplateAnalyzer } from '../../src/analyzer/template.analyzer';
import { ConversionPlanner } from '../../src/planner/conversion-planner';
import type { FileMigratorDependencies } from '../../src/migrator/file.migrator';
import { Migrator, type MigratorDependencies } from '../../src/migrator/migrator';
import type { MigrationMode } from '../../src/migrator/migration-mode';
import { StylesheetPlanner } from '../../src/migrator/stylesheet.planner';
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

    expect(planCounts).toEqual({
      discoveryPasses: 1,
      templatesDiscovered: 2,
      templateReads: 2,
      initialParses: 2,
      validationParses: 4,
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

    expect(writeCounts).toEqual({
      discoveryPasses: 1,
      templatesDiscovered: 2,
      templateReads: 2,
      initialParses: 2,
      validationParses: 4,
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

    expect(tailwindCounts).toEqual({
      discoveryPasses: 1,
      templatesDiscovered: 1,
      templateReads: 2,
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

    expect(cssCounts).toEqual({
      discoveryPasses: 1,
      templatesDiscovered: 2,
      templateReads: 6,
      initialParses: 2,
      validationParses: 4,
      renderedTemplates: 2,
      stylesheetReads: 1,
      projectWrites: 0,
    } satisfies MigrationWorkloadCounts);
  });
});

async function executeSingleFile(
  session: ConversionAdapterSession,
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
  session: ConversionAdapterSession,
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
  await new Migrator(
    session,
    input,
    output,
    () => 0,
    transaction,
    stylesheetPlanner,
    countingMigratorDependencies(counts),
  ).migrate({ mode, ...(stylesheetPath ? { stylesheetPath } : {}) });
}

function countingMigratorDependencies(counts: MigrationWorkloadCounts): MigratorDependencies {
  const referenceParser = new AngularTemplateParser();
  return {
    onDiscoveryPass: () => {
      counts.discoveryPasses++;
    },
    fileMigratorDependencies: () => {
      counts.templatesDiscovered++;
      return countingFileDependencies(counts);
    },
    readTemplate: async target => {
      const contents = await readFile(target, 'utf8');
      counts.templateReads++;
      return contents;
    },
    parser: {
      parse: (source, fileName) => {
        counts.validationParses++;
        return referenceParser.parse(source, fileName);
      },
    },
  };
}

function countingFileDependencies(counts: MigrationWorkloadCounts): FileMigratorDependencies {
  const parser = new AngularTemplateParser();
  const analyzer = new TemplateAnalyzer();
  const planner = new ConversionPlanner();
  let parsedInitialTemplate = false;

  return {
    readTemplate: async target => {
      const contents = await readFile(target, 'utf8');
      counts.templateReads++;
      return contents;
    },
    parser: {
      parse: (source, fileName) => {
        if (parsedInitialTemplate) counts.validationParses++;
        else counts.initialParses++;
        parsedInitialTemplate = true;
        return parser.parse(source, fileName);
      },
    },
    analyzer,
    planner: {
      plan: (...args) => {
        counts.renderedTemplates++;
        return planner.plan(...args);
      },
    },
  };
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
  return {
    discoveryPasses: 0,
    templatesDiscovered: 0,
    templateReads: 0,
    initialParses: 0,
    validationParses: 0,
    renderedTemplates: 0,
    stylesheetReads: 0,
    projectWrites: 0,
  };
}

function tailwindSession(): ConversionAdapterSession {
  return AdapterFactory.createSession('tailwind');
}

async function writeFolderInputs(input: string): Promise<void> {
  await mkdir(join(input, 'nested'), { recursive: true });
  await writeFile(join(input, 'card.html'), '<div fxLayout="row"></div>', 'utf8');
  await writeFile(join(input, 'nested', 'panel.html'), '<div fxLayout="column"></div>', 'utf8');
}
