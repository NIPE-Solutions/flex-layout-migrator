import { TailwindAdapter } from '../adapter/tailwind/tailwind.adapter';
import { TemplateAnalyzer } from '../analyzer/template.analyzer';
import { ConversionPlanner } from '../planner/conversion-planner';
import { analyzedProject, type AnalyzedTemplate } from '../pipeline/analyzed-project';
import { projectManifest } from '../pipeline/project-manifest';
import { AngularTemplateParser } from '../template/angular-template.parser';
import type { TemplateParser } from '../pipeline/analyze/template-parser.port';
import { AnalyzedFileMigrator, type AnalyzedFileMigratorDependencies } from './analyzed-file.migrator';

describe('AnalyzedFileMigrator', () => {
  test('renders parsed analysis without rereading, reparsing, or reanalyzing original source', async () => {
    const analyzed = parsedAnalysis(
      '<div fxLayout="row"></div>',
      '/project/templates/../card.html',
      '/project/output/./card.html',
    );
    const readDestination = vi.fn().mockRejectedValue(enoent());
    const validationParser = validationParserDouble();
    const planner = new ConversionPlanner();
    const renderPlan = vi.spyOn(planner, 'plan');
    const adapter = new TailwindAdapter();

    const plan = await new AnalyzedFileMigrator(
      adapter,
      analyzed,
      {
        validationParser,
        planner,
      },
      { read: readDestination },
    ).plan({ responsiveImages: false });

    expect(plan.file).toMatchObject({
      inputPath: analyzed.file.inputPath,
      outputPath: analyzed.file.outputPath,
      changed: true,
      results: [expect.objectContaining({ status: 'converted' })],
    });
    expect(plan.artifact?.proposed).toEqual({
      status: 'present',
      contents: '<div class="flex flex-row box-border"></div>',
    });
    expect(readDestination).toHaveBeenCalledOnce();
    expect(readDestination).toHaveBeenCalledWith(analyzed.file.outputPath);
    expect(readDestination).not.toHaveBeenCalledWith(analyzed.file.inputPath);
    expect(validationParser.parse).toHaveBeenCalledOnce();
    expect(validationParser.parse).toHaveBeenCalledWith(
      '<div class="flex flex-row box-border"></div>',
      analyzed.file.outputPath,
    );
    expect(renderPlan).toHaveBeenCalledOnce();
    expect(renderPlan).toHaveBeenCalledWith(analyzed.source, analyzed.parseResult.elements, analyzed.inputs, adapter, {
      responsiveImages: false,
    });
  });

  test('maps an analyzed parse error without calling planner or validation parser', async () => {
    const analyzed = parseErrorAnalysis('/project/input.html', '/project/output.html');
    const readDestination = vi.fn();
    const validationParser = validationParserDouble();
    const planner = new ConversionPlanner();
    const renderPlan = vi.spyOn(planner, 'plan');

    const plan = await new AnalyzedFileMigrator(
      new TailwindAdapter(),
      analyzed,
      {
        validationParser,
        planner,
      },
      { read: readDestination },
    ).plan();

    expect(plan.file).toEqual({
      inputPath: analyzed.file.inputPath,
      outputPath: analyzed.file.outputPath,
      changed: false,
      results: [
        {
          status: 'parse-error',
          fileName: analyzed.file.inputPath,
          code: 'template-parse-error',
          reason: 'Unexpected closing block',
          source: { start: 7, end: 9 },
        },
      ],
    });
    expect(plan.artifact).toBeUndefined();
    expect(readDestination).not.toHaveBeenCalled();
    expect(renderPlan).not.toHaveBeenCalled();
    expect(validationParser.parse).not.toHaveBeenCalled();
  });

  test('skips planning, destination reads, and validation when analyzed inputs are empty', async () => {
    const analyzed = parsedAnalysis('<div class="card"></div>');
    const dependencies = dependenciesDouble();
    const renderPlan = vi.spyOn(dependencies.planner, 'plan');

    const plan = await testMigrator(analyzed, dependencies).plan();

    expect(plan.file).toEqual({
      inputPath: analyzed.file.inputPath,
      outputPath: analyzed.file.outputPath,
      changed: false,
      results: [],
    });
    expect(plan.artifact).toBeUndefined();
    expect(renderPlan).not.toHaveBeenCalled();
    expect(dependencies.destinationTemplates.read).not.toHaveBeenCalled();
    expect(dependencies.validationParser.parse).not.toHaveBeenCalled();
  });

  test('reuses analyzed source as the original state for an in-place responsive image migration', async () => {
    const source = '<img src="base.png" src.sm="small.png">';
    const analyzed = parsedAnalysis(source, '/project/image.html', '/project/image.html');
    const dependencies = dependenciesDouble();

    const plan = await testMigrator(analyzed, dependencies).plan({
      responsiveImages: true,
    });

    expect(plan.artifact?.original).toEqual({ status: 'present', contents: source });
    expect(plan.artifact?.proposed).toEqual({
      status: 'present',
      contents:
        '<picture><source media="screen and (min-width: 600px) and (max-width: 959.98px)" srcset="small.png"><img src="base.png"></picture>',
    });
    expect(dependencies.destinationTemplates.read).not.toHaveBeenCalled();
    expect(dependencies.validationParser.parse).toHaveBeenCalledOnce();
  });

  test('reads one distinct destination and records its existing state', async () => {
    const analyzed = parsedAnalysis('<div fxLayout="column"></div>');
    const dependencies = dependenciesDouble();
    dependencies.destinationTemplates.read.mockResolvedValue('<div class="old"></div>');

    const plan = await testMigrator(analyzed, dependencies).plan();

    expect(plan.file.changed).toBe(true);
    expect(plan.artifact?.original).toEqual({ status: 'present', contents: '<div class="old"></div>' });
    expect(dependencies.destinationTemplates.read).toHaveBeenCalledOnce();
    expect(dependencies.destinationTemplates.read).toHaveBeenCalledWith(analyzed.file.outputPath);
    expect(dependencies.validationParser.parse).toHaveBeenCalledOnce();
  });

  test('returns unchanged when one distinct destination already equals the proposed template', async () => {
    const analyzed = parsedAnalysis('<div fxLayout="column"></div>');
    const dependencies = dependenciesDouble();
    dependencies.destinationTemplates.read.mockResolvedValue('<div class="flex flex-col box-border"></div>');

    const plan = await testMigrator(analyzed, dependencies).plan();

    expect(plan.file.changed).toBe(false);
    expect(plan.file.results).toEqual([expect.objectContaining({ status: 'converted' })]);
    expect(plan.artifact).toBeUndefined();
    expect(dependencies.destinationTemplates.read).toHaveBeenCalledOnce();
    expect(dependencies.validationParser.parse).toHaveBeenCalledOnce();
  });

  test('maps one changed-output validation failure without reading the destination', async () => {
    const analyzed = parsedAnalysis('<div fxLayout="row"></div>');
    const dependencies = dependenciesDouble();
    dependencies.validationParser.parse.mockReturnValue({
      status: 'parse-error',
      diagnostics: [{ message: 'Injected generated failure', source: { start: 3, end: 6 } }],
    });

    const plan = await testMigrator(analyzed, dependencies).plan();

    expect(plan.file).toEqual({
      inputPath: analyzed.file.inputPath,
      outputPath: analyzed.file.outputPath,
      changed: false,
      results: [
        {
          status: 'parse-error',
          fileName: analyzed.file.outputPath,
          code: 'generated-template-parse-error',
          reason: 'Injected generated failure',
          source: { start: 3, end: 6 },
        },
      ],
    });
    expect(plan.artifact).toBeUndefined();
    expect(dependencies.validationParser.parse).toHaveBeenCalledOnce();
    expect(dependencies.destinationTemplates.read).not.toHaveBeenCalled();
  });
});

function parsedAnalysis(
  source: string,
  inputPath = '/project/input.html',
  outputPath = '/project/output.html',
): Extract<AnalyzedTemplate, { readonly status: 'parsed' }> {
  const manifest = projectManifest({
    invocation: { inputPath, outputPath, options: { mode: 'plan' } },
    templates: [{ inputPath, outputPath }],
  });
  const file = manifest.templates[0];
  if (file === undefined) throw new Error('Expected one manifest template.');
  const parseResult = new AngularTemplateParser().parse(source, file.inputPath);
  if (parseResult.status !== 'parsed') throw new Error('Expected fixture to parse.');
  const project = analyzedProject({
    manifest,
    templates: [
      {
        status: 'parsed',
        file,
        source,
        parseResult,
        inputs: new TemplateAnalyzer().analyze(file.inputPath, parseResult.elements),
      },
    ],
  });
  const analyzed = project.templates[0];
  if (analyzed?.status !== 'parsed') throw new Error('Expected parsed analysis.');
  return analyzed;
}

function parseErrorAnalysis(
  inputPath: string,
  outputPath: string,
): Extract<AnalyzedTemplate, { status: 'parse-error' }> {
  const manifest = projectManifest({
    invocation: { inputPath, outputPath, options: { mode: 'plan' } },
    templates: [{ inputPath, outputPath }],
  });
  const file = manifest.templates[0];
  if (file === undefined) throw new Error('Expected one manifest template.');
  const project = analyzedProject({
    manifest,
    templates: [
      {
        status: 'parse-error',
        file,
        source: '<broken>',
        parseResult: {
          status: 'parse-error',
          diagnostics: [{ message: 'Unexpected closing block', source: { start: 7, end: 9 } }],
        },
      },
    ],
  });
  const analyzed = project.templates[0];
  if (analyzed?.status !== 'parse-error') throw new Error('Expected parse-error analysis.');
  return analyzed;
}

function dependenciesDouble(): AnalyzedFileMigratorDependencies & {
  readonly destinationTemplates: {
    readonly read: ReturnType<typeof vi.fn<(path: string) => Promise<string>>>;
  };
  readonly validationParser: { readonly parse: ReturnType<typeof vi.fn<TemplateParser['parse']>> };
} {
  return {
    destinationTemplates: { read: vi.fn().mockRejectedValue(enoent()) },
    validationParser: validationParserDouble(),
    planner: new ConversionPlanner(),
  };
}

function testMigrator(
  analyzed: AnalyzedTemplate,
  dependencies: ReturnType<typeof dependenciesDouble>,
): AnalyzedFileMigrator {
  return new AnalyzedFileMigrator(new TailwindAdapter(), analyzed, dependencies, dependencies.destinationTemplates);
}

function validationParserDouble(): { readonly parse: ReturnType<typeof vi.fn<TemplateParser['parse']>> } {
  const parser = new AngularTemplateParser();
  return { parse: vi.fn((source, fileName) => parser.parse(source, fileName)) };
}

function enoent(): NodeJS.ErrnoException {
  return Object.assign(new Error('missing destination'), { code: 'ENOENT' });
}
