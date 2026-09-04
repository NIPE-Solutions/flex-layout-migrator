import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { AdapterFactory } from '../adapter/adapter.factory';
import type { OwnedCssReferences } from '../adapter/css/stylesheet/owned-stylesheet.merger';
import { AnalyzeProjectStage } from '../pipeline/analyze/analyze-project.stage';
import { analyzedProject } from '../pipeline/analyzed-project';
import { ApplyProjectStage } from '../pipeline/apply/apply-project.stage';
import { DiscoverProjectStage } from '../pipeline/discover/discover-project.stage';
import type { TemplateParser } from '../pipeline/analyze/template-parser.port';
import { migrationInvocation, projectManifest } from '../pipeline/project-manifest';
import { RenderProjectStage } from '../pipeline/render/render-project.stage';
import { CssReferenceCollector } from '../pipeline/validate/css-reference.collector';
import { TemplateProposalValidator } from '../pipeline/validate/template-proposal.validator';
import { ValidateProjectStage } from '../pipeline/validate/validate-project.stage';
import type { ConversionRenderer } from '../render/conversion-renderer';
import type { RenderSession } from '../render/render-session';
import { AngularTemplateParser } from '../template/angular-template.parser';
import type { MigrationTransaction } from '../transaction/migration-transaction';
import type { DestinationTemplateSource } from './destination-template-source';
import { Migrator, type MigrationOptions } from './migrator';
import type { StylesheetPlanner } from './stylesheet.planner';

interface ValidationDependencies {
  readonly destinationTemplates: DestinationTemplateSource;
  readonly referenceParser: TemplateParser;
}

describe('Migrator', () => {
  let temporaryDirectory: string;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'migrator-'));
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  test('builds application work from the canonical validated plan without rendering again', async () => {
    const inputPath = join(temporaryDirectory, 'input.html');
    const outputPath = join(temporaryDirectory, 'output.html');
    await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');
    const invocation = migrationInvocation({ inputPath, outputPath, options: { mode: 'plan' } });
    const manifest = await new DiscoverProjectStage().run(invocation);
    const analyzed = await new AnalyzeProjectStage().run(manifest);
    let renderCalls = 0;
    const session = countingRenderSession(tailwindSession(), () => renderCalls++);
    const rendered = await new RenderProjectStage(session).run(analyzed);
    const callsAfterRenderStage = renderCalls;
    const validated = await new ValidateProjectStage().run(rendered);

    const applied = await new ApplyProjectStage('plan', transactionDouble()).run(validated);
    const report = await new Migrator(applied, () => 0).migrate({ mode: 'plan' });

    expect(report.files).toEqual([
      {
        path: 'input.html',
        changed: true,
        results: [{ status: 'converted', directive: 'fxLayout', sourceName: 'fxLayout', offset: 5 }],
      },
    ]);
    expect(callsAfterRenderStage).toBeGreaterThan(0);
    expect(renderCalls).toBe(callsAfterRenderStage);
  });

  test('reuses analyzed source when collecting native CSS references for an unchanged in-place template', async () => {
    const generatedClass = `flm-${'a'.repeat(64)}`;
    const inputPath = join(temporaryDirectory, 'input.html');
    const stylesheetPath = join(temporaryDirectory, 'flex-layout-migration.css');
    await writeFile(inputPath, `<div class="${generatedClass}"></div>`, 'utf8');
    const invocation = migrationInvocation({
      inputPath,
      outputPath: inputPath,
      options: { mode: 'plan', stylesheetPath },
    });
    const manifest = await new DiscoverProjectStage().run(invocation);
    const analyzed = await new AnalyzeProjectStage().run(manifest);
    const readDestination = vi.fn(async () => {
      throw new Error('An unchanged in-place template must reuse analyzed source.');
    });
    const stylesheetPlanner = {
      plan: vi.fn<StylesheetPlanner['plan']>().mockResolvedValue(undefined),
    };
    const dependencies: ValidationDependencies = {
      destinationTemplates: { read: readDestination },
      referenceParser: new AngularTemplateParser(),
    };
    const rendered = await new RenderProjectStage(AdapterFactory.createSession('css')).run(analyzed);
    const validated = await new ValidateProjectStage(
      new TemplateProposalValidator(new AngularTemplateParser(), dependencies.destinationTemplates),
      new CssReferenceCollector(dependencies.referenceParser, dependencies.destinationTemplates),
      stylesheetPlanner,
    ).run(rendered);

    const applied = await new ApplyProjectStage('plan', transactionDouble()).run(validated);
    await new Migrator(applied, () => 0).migrate({
      mode: 'plan',
      stylesheetPath,
    });

    expect(readDestination).not.toHaveBeenCalled();
    const references = stylesheetPlanner.plan.mock.calls[0]?.[2] as OwnedCssReferences;
    expect([...references.classNames]).toEqual([generatedClass]);
    expect(references.complete).toBe(true);
  });

  test('propagates an error only at a canonicalized distinct-destination source read boundary', async () => {
    const invocation = migrationInvocation({
      inputPath: 'relative-fixtures/input',
      outputPath: 'relative-fixtures/output',
      options: { mode: 'plan', stylesheetPath: 'relative-fixtures/flex.css' },
    });
    const inputPath = join(invocation.canonicalInputPath, 'nested', 'card.html');
    const outputPath = join(invocation.canonicalOutputPath, 'nested', 'card.html');
    const manifest = projectManifest({ invocation, templates: [{ inputPath, outputPath }] });
    const analyzed = analyzedProject({
      manifest,
      templates: [
        {
          status: 'parsed',
          file: manifest.templates[0]!,
          source: '<div></div>',
          parseResult: { status: 'parsed', elements: [] },
          inputs: [],
        },
      ],
    });
    const cause = new Error('destination cause');
    const message = `EACCES: permission denied, open '${outputPath}'`;
    const error = Object.assign(new TypeError(message, { cause }), {
      code: 'EACCES',
      errno: -13,
      syscall: 'open',
      path: outputPath,
    });
    const destinationTemplates = { read: vi.fn(async () => Promise.reject(error)) };
    const dependencies: ValidationDependencies = {
      destinationTemplates,
      referenceParser: new AngularTemplateParser(),
    };
    const stylesheetPlanner = { plan: vi.fn<StylesheetPlanner['plan']>() };
    const rendered = await new RenderProjectStage(AdapterFactory.createSession('css')).run(analyzed);
    const validate = new ValidateProjectStage(
      new TemplateProposalValidator(new AngularTemplateParser(), dependencies.destinationTemplates),
      new CssReferenceCollector(dependencies.referenceParser, dependencies.destinationTemplates),
      stylesheetPlanner,
    );

    const rejected = await rejectedNodeIoError(validate.run(rendered));

    expect(rejected).toBe(error);
    expect(rejected).toBeInstanceOf(TypeError);
    expect(rejected.message).toBe(message);
    expect(rejected.path).toBe(outputPath);
    expect(rejected.code).toBe('EACCES');
    expect(rejected.cause).toBe(cause);
    expect(destinationTemplates.read).toHaveBeenCalledWith(outputPath);
    expect(stylesheetPlanner.plan).not.toHaveBeenCalled();
  });

  test('defaults to a timed plan-only report without writing a changed file', async () => {
    const inputPath = join(temporaryDirectory, 'input', 'card.html');
    const outputPath = join(temporaryDirectory, 'output', 'card.html');
    await mkdir(join(temporaryDirectory, 'input'), { recursive: true });
    await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');
    const clockValues = [1000, 1125];
    const now = () => clockValues.shift() ?? 1125;

    const report = await migrationFromPaths(tailwindSession(), inputPath, outputPath, now).migrate();

    expect(report).toMatchObject({
      schemaVersion: 2,
      target: 'tailwind',
      mode: 'plan',
      application: { status: 'skipped', reason: 'plan-only' },
      durationMs: 125,
      summary: {
        filesScanned: 1,
        filesChanged: 1,
        converted: 1,
        review: 0,
        unsupported: 0,
        invalid: 0,
        parseErrors: 0,
      },
    });
    expect(report.files).toEqual([
      {
        path: 'card.html',
        changed: true,
        results: [{ status: 'converted', directive: 'fxLayout', sourceName: 'fxLayout', offset: 5 }],
      },
    ]);
    await expect(access(outputPath)).rejects.toThrow();
  });

  test('preflights the complete plan without applying it in plan mode', async () => {
    const inputPath = join(temporaryDirectory, 'input', 'card.html');
    const outputPath = join(temporaryDirectory, 'output', 'card.html');
    await mkdir(join(temporaryDirectory, 'input'), { recursive: true });
    await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');
    const transaction = transactionDouble();

    const report = await migrationFromPaths(tailwindSession(), inputPath, outputPath, () => 0, transaction).migrate({
      mode: 'plan',
    });

    expect(transaction.preflight).toHaveBeenCalledOnce();
    expect(transaction.preflight).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'tailwind',
        artifacts: [expect.objectContaining({ path: outputPath, kind: 'template' })],
      }),
    );
    expect(transaction.apply).not.toHaveBeenCalled();
    expect(report).toMatchObject({
      mode: 'plan',
      application: { status: 'skipped', reason: 'plan-only' },
    });
    await expect(access(outputPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('plans a changed single file from relative paths', async () => {
    const inputPath = join(temporaryDirectory, 'input', 'card.html');
    const outputPath = join(temporaryDirectory, 'output', 'card.html');
    await mkdir(join(temporaryDirectory, 'input'), { recursive: true });
    await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');

    const report = await migrationFromPaths(
      tailwindSession(),
      relative(process.cwd(), inputPath),
      relative(process.cwd(), outputPath),
      () => 0,
    ).migrate({ mode: 'plan' });

    expect(report.summary).toMatchObject({ filesScanned: 1, filesChanged: 1, converted: 1 });
    expect({ input: report.input, output: report.output, filePath: report.files[0]?.path }).toEqual({
      input: 'card.html',
      output: '../output/card.html',
      filePath: 'card.html',
    });
    await expect(access(outputPath)).rejects.toThrow();
  });

  test('applies planned template artifacts after a successful Tailwind migration', async () => {
    const inputPath = join(temporaryDirectory, 'input', 'card.html');
    const outputPath = join(temporaryDirectory, 'output', 'card.html');
    await mkdir(join(temporaryDirectory, 'input'), { recursive: true });
    await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');

    const report = await migrationFromPaths(tailwindSession(), inputPath, outputPath, () => 0).migrate({
      mode: 'write',
    });

    expect(report.summary).toMatchObject({ filesScanned: 1, filesChanged: 1, converted: 1 });
    expect(await readFile(outputPath, 'utf8')).toBe('<div class="flex flex-row box-border"></div>');
  });

  test('delegates one complete write plan to the transaction', async () => {
    const inputPath = join(temporaryDirectory, 'input', 'card.html');
    const outputPath = join(temporaryDirectory, 'output', 'card.html');
    await mkdir(join(temporaryDirectory, 'input'), { recursive: true });
    await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');
    const transaction = transactionDouble();

    const report = await migrationFromPaths(tailwindSession(), inputPath, outputPath, () => 0, transaction).migrate({
      mode: 'write',
    });

    expect(report.summary.filesChanged).toBe(1);
    expect(transaction.preflight).toHaveBeenCalledOnce();
    expect(transaction.apply).toHaveBeenCalledOnce();
    expect(transaction.apply).toHaveBeenCalledWith(transaction.preflight.mock.calls[0]?.[0]);
    expect(report).toMatchObject({ mode: 'write', application: { status: 'applied' } });
  });

  test('aggregates every nested folder template into the application report', async () => {
    const inputPath = join(temporaryDirectory, 'input');
    const outputPath = join(temporaryDirectory, 'output');
    await mkdir(join(inputPath, 'nested'), { recursive: true });
    await writeFile(join(inputPath, 'a.html'), '<div fxLayout="column"></div>', 'utf8');
    await writeFile(join(inputPath, 'nested', 'b.html'), '<div class="card"></div>', 'utf8');

    const report = await migrationFromPaths(tailwindSession(), inputPath, outputPath, () => 20).migrate({
      mode: 'plan',
    });

    expect(report.files.map(file => ({ path: file.path, changed: file.changed }))).toEqual([
      { path: 'a.html', changed: true },
      { path: 'nested/b.html', changed: false },
    ]);
    expect(report.summary).toMatchObject({ filesScanned: 2, filesChanged: 1, converted: 1 });
  });

  test('applies changed folder templates from relative paths', async () => {
    const inputPath = join(temporaryDirectory, 'input');
    const outputPath = join(temporaryDirectory, 'output');
    await mkdir(join(inputPath, 'nested'), { recursive: true });
    await writeFile(join(inputPath, 'card.html'), '<div fxLayout="row"></div>', 'utf8');
    await writeFile(join(inputPath, 'nested', 'panel.html'), '<div fxLayout="column"></div>', 'utf8');

    const report = await migrationFromPaths(
      tailwindSession(),
      relative(process.cwd(), inputPath),
      relative(process.cwd(), outputPath),
      () => 0,
    ).migrate({ mode: 'write' });

    expect(report.summary).toMatchObject({ filesScanned: 2, filesChanged: 2, converted: 2 });
    expect(await readFile(join(outputPath, 'card.html'), 'utf8')).toBe('<div class="flex flex-row box-border"></div>');
    expect(await readFile(join(outputPath, 'nested', 'panel.html'), 'utf8')).toBe(
      '<div class="flex flex-col box-border"></div>',
    );
  });

  test('does not apply any planned template artifact when a folder contains a parse error', async () => {
    const inputPath = join(temporaryDirectory, 'input');
    const outputPath = join(temporaryDirectory, 'output');
    await mkdir(inputPath, { recursive: true });
    await writeFile(join(inputPath, 'a-convert.html'), '<div fxLayout="row"></div>', 'utf8');
    await writeFile(join(inputPath, 'z-invalid.html'), '<span fxLayout="row" />', 'utf8');

    const report = await migrationFromPaths(tailwindSession(), inputPath, outputPath, () => 0).migrate({
      mode: 'write',
    });

    expect(report.summary).toMatchObject({ filesScanned: 2, filesChanged: 1, parseErrors: 1 });
    expect(report.application).toEqual({ status: 'skipped', reason: 'parse-errors' });
    await expect(access(outputPath)).rejects.toThrow();
  });

  test('returns the complete parse-error report without invoking transaction preflight or apply', async () => {
    const inputPath = join(temporaryDirectory, 'input');
    const outputPath = join(temporaryDirectory, 'output');
    await mkdir(inputPath, { recursive: true });
    await writeFile(join(inputPath, 'a-convert.html'), '<div fxLayout="row"></div>', 'utf8');
    await writeFile(join(inputPath, 'z-invalid.html'), '<span fxLayout="row" />', 'utf8');
    const transaction = transactionDouble();

    const report = await migrationFromPaths(tailwindSession(), inputPath, outputPath, () => 0, transaction).migrate({
      mode: 'write',
    });

    expect(report.summary).toMatchObject({ filesScanned: 2, filesChanged: 1, parseErrors: 1 });
    expect(transaction.preflight).not.toHaveBeenCalled();
    expect(transaction.apply).not.toHaveBeenCalled();
    await expect(access(outputPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('reports plan-only for parse errors without invoking transaction preflight or apply', async () => {
    const inputPath = join(temporaryDirectory, 'input');
    const outputPath = join(temporaryDirectory, 'output');
    await mkdir(inputPath, { recursive: true });
    await writeFile(join(inputPath, 'invalid.html'), '<span fxLayout="row" />', 'utf8');
    const transaction = transactionDouble();

    const report = await migrationFromPaths(tailwindSession(), inputPath, outputPath, () => 0, transaction).migrate({
      mode: 'plan',
    });

    expect(report).toMatchObject({
      mode: 'plan',
      application: { status: 'skipped', reason: 'plan-only' },
      summary: { parseErrors: 1 },
    });
    expect(transaction.preflight).not.toHaveBeenCalled();
    expect(transaction.apply).not.toHaveBeenCalled();
    await expect(access(outputPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('produces identical proposed migration results in plan and write modes', async () => {
    const inputPath = join(temporaryDirectory, 'input.html');
    const planOutputPath = join(temporaryDirectory, 'plan-output.html');
    const writeOutputPath = join(temporaryDirectory, 'write-output.html');
    await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');

    const planReport = await migrationFromPaths(tailwindSession(), inputPath, planOutputPath, () => 0).migrate({
      mode: 'plan',
    });
    const writeReport = await migrationFromPaths(tailwindSession(), inputPath, writeOutputPath, () => 0).migrate({
      mode: 'write',
    });

    expect(proposedReport(planReport)).toEqual(proposedReport(writeReport));
    await expect(access(planOutputPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(writeOutputPath, 'utf8')).resolves.toBe('<div class="flex flex-row box-border"></div>');
  });

  test('reports a valid unchanged write plan as applied after preflight and skips apply', async () => {
    const inputPath = join(temporaryDirectory, 'plain.html');
    const outputPath = join(temporaryDirectory, 'plain-output.html');
    await writeFile(inputPath, '<div class="card"></div>', 'utf8');
    const transaction = transactionDouble();

    const report = await migrationFromPaths(tailwindSession(), inputPath, outputPath, () => 0, transaction).migrate({
      mode: 'write',
    });

    expect(transaction.preflight).toHaveBeenCalledWith(expect.objectContaining({ artifacts: [] }));
    expect(transaction.apply).not.toHaveBeenCalled();
    expect(report).toMatchObject({ mode: 'write', application: { status: 'applied' } });
  });

  test('rejects unsupported file extensions', async () => {
    const inputPath = join(temporaryDirectory, 'styles.css');
    await writeFile(inputPath, '.card {}', 'utf8');

    await expect(
      migrationFromPaths(tailwindSession(), inputPath, inputPath, () => 0).migrate({ mode: 'write' }),
    ).rejects.toThrow(`Unsupported file type: ${inputPath}`);
  });

  test('preflights one complete CSS template and stylesheet plan in plan mode', async () => {
    const inputPath = join(temporaryDirectory, 'input.html');
    const outputPath = join(temporaryDirectory, 'output.html');
    const stylesheetPath = join(temporaryDirectory, 'flex-layout-migration.css');
    await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');
    const transaction = transactionDouble();

    const report = await migrationFromPaths(
      AdapterFactory.createSession('css'),
      inputPath,
      outputPath,
      () => 0,
      transaction,
    ).migrate({ mode: 'plan', stylesheetPath });

    expect(report).toMatchObject({
      target: 'css',
      mode: 'plan',
      application: { status: 'skipped', reason: 'plan-only' },
      summary: { filesScanned: 1, filesChanged: 1, converted: 1 },
      stylesheet: { path: 'flex-layout-migration.css', change: 'created' },
    });
    expect(transaction.preflight).toHaveBeenCalledOnce();
    expect(transaction.preflight).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'css',
        artifacts: expect.arrayContaining([
          expect.objectContaining({ kind: 'template', path: outputPath }),
          expect.objectContaining({ kind: 'stylesheet', path: stylesheetPath }),
        ]),
      }),
    );
    expect(transaction.apply).not.toHaveBeenCalled();
    await expect(access(outputPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(stylesheetPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('applies CSS template and stylesheet artifacts through one transaction', async () => {
    const inputPath = join(temporaryDirectory, 'input.html');
    const outputPath = join(temporaryDirectory, 'output.html');
    const stylesheetPath = join(temporaryDirectory, 'flex-layout-migration.css');
    await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');

    const report = await migrationFromPaths(
      AdapterFactory.createSession('css'),
      inputPath,
      outputPath,
      () => 0,
    ).migrate({
      mode: 'write',
      stylesheetPath,
    });

    expect(report.stylesheet).toEqual({ path: 'flex-layout-migration.css', change: 'created' });
    const migrated = await readFile(outputPath, 'utf8');
    const generatedClass = migrated.match(/class="(flm-[a-f0-9]+)"/)?.[1];
    expect(generatedClass).toBeDefined();
    expect(await readFile(stylesheetPath, 'utf8')).toContain(`.${generatedClass} {`);
  });

  test('reports an unchanged stylesheet when the generated rules are already current', async () => {
    const inputPath = join(temporaryDirectory, 'input.html');
    const outputPath = join(temporaryDirectory, 'output.html');
    const stylesheetPath = join(temporaryDirectory, 'flex-layout-migration.css');
    await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');
    await migrationFromPaths(AdapterFactory.createSession('css'), inputPath, outputPath, () => 0).migrate({
      mode: 'write',
      stylesheetPath,
    });

    const report = await migrationFromPaths(
      AdapterFactory.createSession('css'),
      inputPath,
      outputPath,
      () => 0,
    ).migrate({
      mode: 'write',
      stylesheetPath,
    });

    expect(report.stylesheet).toEqual({ path: 'flex-layout-migration.css', change: 'unchanged' });
  });

  test('reports and applies a stylesheet update when generated rules change', async () => {
    const inputPath = join(temporaryDirectory, 'input.html');
    const outputPath = join(temporaryDirectory, 'output.html');
    const stylesheetPath = join(temporaryDirectory, 'flex-layout-migration.css');
    await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');
    await migrationFromPaths(AdapterFactory.createSession('css'), inputPath, outputPath, () => 0).migrate({
      mode: 'write',
      stylesheetPath,
    });
    const originalStylesheet = await readFile(stylesheetPath, 'utf8');
    await writeFile(inputPath, '<div fxLayout="column"></div>', 'utf8');

    const report = await migrationFromPaths(
      AdapterFactory.createSession('css'),
      inputPath,
      outputPath,
      () => 0,
    ).migrate({
      mode: 'write',
      stylesheetPath,
    });

    expect(report.stylesheet).toEqual({ path: 'flex-layout-migration.css', change: 'updated' });
    expect(await readFile(stylesheetPath, 'utf8')).not.toBe(originalStylesheet);
  });

  test('retains generated CSS referenced by an unchanged distinct destination template', async () => {
    const inputPath = join(temporaryDirectory, 'input.html');
    const outputPath = join(temporaryDirectory, 'output.html');
    const stylesheetPath = join(temporaryDirectory, 'flex-layout-migration.css');
    await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');
    await migrationFromPaths(AdapterFactory.createSession('css'), inputPath, outputPath, () => 0).migrate({
      mode: 'write',
      stylesheetPath,
    });
    await writeFile(inputPath, '<div></div>', 'utf8');

    const report = await migrationFromPaths(
      AdapterFactory.createSession('css'),
      inputPath,
      outputPath,
      () => 0,
    ).migrate({
      mode: 'write',
      stylesheetPath,
    });

    expect(report.stylesheet).toEqual({ path: 'flex-layout-migration.css', change: 'unchanged' });
    await expect(access(stylesheetPath)).resolves.toBeUndefined();
  });

  test('retains rules from templates outside a later single-file invocation sharing the stylesheet', async () => {
    const firstTemplate = join(temporaryDirectory, 'first.html');
    const secondTemplate = join(temporaryDirectory, 'second.html');
    const stylesheetPath = join(temporaryDirectory, 'flex-layout-migration.css');
    await writeFile(firstTemplate, '<div fxLayout="row"></div>', 'utf8');
    await writeFile(secondTemplate, '<div fxLayout="column"></div>', 'utf8');

    await migrationFromPaths(AdapterFactory.createSession('css'), firstTemplate, firstTemplate, () => 0).migrate({
      mode: 'write',
      stylesheetPath,
    });
    const firstClass = (await readFile(firstTemplate, 'utf8')).match(/flm-[a-f0-9]{64}/u)?.[0];
    expect(firstClass).toBeDefined();

    await migrationFromPaths(AdapterFactory.createSession('css'), secondTemplate, secondTemplate, () => 0).migrate({
      mode: 'write',
      stylesheetPath,
    });
    const secondClass = (await readFile(secondTemplate, 'utf8')).match(/flm-[a-f0-9]{64}/u)?.[0];
    expect(secondClass).toBeDefined();
    expect(secondClass).not.toBe(firstClass);

    const stylesheet = await readFile(stylesheetPath, 'utf8');
    expect(stylesheet).toContain(`.${firstClass} {`);
    expect(stylesheet).toContain(`.${secondClass} {`);
  });

  test('retains a live owned rule referenced through literal ngClass', async () => {
    const inputPath = join(temporaryDirectory, 'input.html');
    const stylesheetPath = join(temporaryDirectory, 'flex-layout-migration.css');
    await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');
    await migrationFromPaths(AdapterFactory.createSession('css'), inputPath, inputPath, () => 0).migrate({
      mode: 'write',
      stylesheetPath,
    });
    const generatedClass = (await readFile(inputPath, 'utf8')).match(/flm-[a-f0-9]{64}/u)?.[0];
    expect(generatedClass).toBeDefined();
    const stylesheetBefore = await readFile(stylesheetPath, 'utf8');
    await writeFile(inputPath, `<div ngClass="${generatedClass}"></div>`, 'utf8');

    const report = await migrationFromPaths(AdapterFactory.createSession('css'), inputPath, inputPath, () => 0).migrate(
      {
        mode: 'write',
        stylesheetPath,
      },
    );

    expect(report.stylesheet).toEqual({ path: 'flex-layout-migration.css', change: 'unchanged' });
    expect(await readFile(stylesheetPath, 'utf8')).toBe(stylesheetBefore);
  });

  test.each([
    ['literal', `ngClass="flm-${'a'.repeat(64)}"`, [`flm-${'a'.repeat(64)}`]],
    ['property binding', '[ngClass]="classes"', []],
    ['bind syntax', 'bind-ngClass="classes"', []],
    ['responsive literal', `ngClass.sm="flm-${'a'.repeat(64)}"`, [`flm-${'a'.repeat(64)}`]],
    ['responsive property binding', '[ngClass.sm]="classes"', []],
  ] as const)(
    'marks %s ngClass authority incomplete and extracts only exact literal tokens',
    async (_label, source, tokens) => {
      const inputPath = join(temporaryDirectory, 'input.html');
      const stylesheetPath = join(temporaryDirectory, 'flex-layout-migration.css');
      const transaction = transactionDouble();
      const stylesheetPlanner = {
        plan: vi.fn<StylesheetPlanner['plan']>().mockResolvedValue(undefined),
      };
      await writeFile(inputPath, `<div ${source}></div>`, 'utf8');

      await migrationFromPaths(
        AdapterFactory.createSession('css'),
        inputPath,
        inputPath,
        () => 0,
        transaction,
        stylesheetPlanner,
      ).migrate({ mode: 'plan', stylesheetPath });

      const references = stylesheetPlanner.plan.mock.calls[0]?.[2] as OwnedCssReferences;
      expect(references.complete).toBe(false);
      expect([...references.classNames]).toEqual(tokens);
    },
  );

  test('retains unmatched generated CSS without an explicit complete pruning scope', async () => {
    const inputPath = join(temporaryDirectory, 'input.html');
    const outputPath = join(temporaryDirectory, 'output.html');
    const stylesheetPath = join(temporaryDirectory, 'flex-layout-migration.css');
    await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');
    await migrationFromPaths(AdapterFactory.createSession('css'), inputPath, outputPath, () => 0).migrate({
      mode: 'write',
      stylesheetPath,
    });
    await writeFile(inputPath, '<div></div>', 'utf8');
    await writeFile(outputPath, '<div></div>', 'utf8');

    const report = await migrationFromPaths(
      AdapterFactory.createSession('css'),
      inputPath,
      outputPath,
      () => 0,
    ).migrate({
      mode: 'write',
      stylesheetPath,
    });

    expect(report.stylesheet).toEqual({ path: 'flex-layout-migration.css', change: 'unchanged' });
    await expect(access(stylesheetPath)).resolves.toBeUndefined();
  });

  test.each(['class="%s {{ extra }}"', '[class]="extra"', '[className]="extra"', 'bind-className="extra"'])(
    'preserves owned CSS when an in-place class reference is interpolation or binding uncertain',
    async classAttribute => {
      const inputPath = join(temporaryDirectory, 'input.html');
      const stylesheetPath = join(temporaryDirectory, 'flex-layout-migration.css');
      await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');
      await migrationFromPaths(AdapterFactory.createSession('css'), inputPath, inputPath, () => 0).migrate({
        mode: 'write',
        stylesheetPath,
      });
      const generatedClass = (await readFile(inputPath, 'utf8')).match(/flm-[a-f0-9]{64}/u)?.[0];
      expect(generatedClass).toBeDefined();
      await writeFile(inputPath, `<div ${classAttribute.replace('%s', generatedClass as string)}></div>`, 'utf8');

      const report = await migrationFromPaths(
        AdapterFactory.createSession('css'),
        inputPath,
        inputPath,
        () => 0,
      ).migrate({
        mode: 'write',
        stylesheetPath,
      });

      expect(report.stylesheet).toEqual({ path: 'flex-layout-migration.css', change: 'unchanged' });
    },
  );

  test('retains and validates a statically named generated class binding', async () => {
    const inputPath = join(temporaryDirectory, 'input.html');
    const stylesheetPath = join(temporaryDirectory, 'flex-layout-migration.css');
    await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');
    await migrationFromPaths(AdapterFactory.createSession('css'), inputPath, inputPath, () => 0).migrate({
      mode: 'write',
      stylesheetPath,
    });
    const generatedClass = (await readFile(inputPath, 'utf8')).match(/flm-[a-f0-9]{64}/u)?.[0];
    expect(generatedClass).toBeDefined();
    await writeFile(inputPath, `<div [class.${generatedClass}]="enabled"></div>`, 'utf8');

    const report = await migrationFromPaths(AdapterFactory.createSession('css'), inputPath, inputPath, () => 0).migrate(
      {
        mode: 'write',
        stylesheetPath,
      },
    );

    expect(report.stylesheet).toEqual({ path: 'flex-layout-migration.css', change: 'unchanged' });
  });

  test('fails closed for a statically named generated class binding without an owned rule', async () => {
    const inputPath = join(temporaryDirectory, 'input.html');
    const stylesheetPath = join(temporaryDirectory, 'flex-layout-migration.css');
    await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');
    await migrationFromPaths(AdapterFactory.createSession('css'), inputPath, inputPath, () => 0).migrate({
      mode: 'write',
      stylesheetPath,
    });
    await writeFile(inputPath, `<div [class.flm-${'f'.repeat(64)}]="enabled"></div>`, 'utf8');

    await expect(
      migrationFromPaths(AdapterFactory.createSession('css'), inputPath, inputPath, () => 0).migrate({
        mode: 'write',
        stylesheetPath,
      }),
    ).rejects.toMatchObject({ code: 'stylesheet-ownership-invalid' });
  });

  test('retains a generated class named through bind-class syntax', async () => {
    const inputPath = join(temporaryDirectory, 'input.html');
    const stylesheetPath = join(temporaryDirectory, 'flex-layout-migration.css');
    await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');
    await migrationFromPaths(AdapterFactory.createSession('css'), inputPath, inputPath, () => 0).migrate({
      mode: 'write',
      stylesheetPath,
    });
    const generatedClass = (await readFile(inputPath, 'utf8')).match(/flm-[a-f0-9]{64}/u)?.[0];
    expect(generatedClass).toBeDefined();
    await writeFile(inputPath, `<div bind-class.${generatedClass}="enabled"></div>`, 'utf8');

    const report = await migrationFromPaths(AdapterFactory.createSession('css'), inputPath, inputPath, () => 0).migrate(
      {
        mode: 'write',
        stylesheetPath,
      },
    );

    expect(report.stylesheet).toEqual({ path: 'flex-layout-migration.css', change: 'unchanged' });
  });

  test('fails closed for an unknown generated class named through bind-class syntax', async () => {
    const inputPath = join(temporaryDirectory, 'input.html');
    const stylesheetPath = join(temporaryDirectory, 'flex-layout-migration.css');
    await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');
    await migrationFromPaths(AdapterFactory.createSession('css'), inputPath, inputPath, () => 0).migrate({
      mode: 'write',
      stylesheetPath,
    });
    await writeFile(inputPath, `<div bind-class.flm-${'f'.repeat(64)}="enabled"></div>`, 'utf8');

    await expect(
      migrationFromPaths(AdapterFactory.createSession('css'), inputPath, inputPath, () => 0).migrate({
        mode: 'write',
        stylesheetPath,
      }),
    ).rejects.toMatchObject({ code: 'stylesheet-ownership-invalid' });
  });

  test.each([`flm-${'a'.repeat(64)}-modifier`, `handwritten-flm-${'f'.repeat(64)}`])(
    'does not treat a boundary-adjacent handwritten class name as a generated authority',
    async className => {
      const inputPath = join(temporaryDirectory, 'input.html');
      const stylesheetPath = join(temporaryDirectory, 'flex-layout-migration.css');
      await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');
      await migrationFromPaths(AdapterFactory.createSession('css'), inputPath, inputPath, () => 0).migrate({
        mode: 'write',
        stylesheetPath,
      });
      await writeFile(inputPath, `<div class="${className}"></div>`, 'utf8');

      const report = await migrationFromPaths(
        AdapterFactory.createSession('css'),
        inputPath,
        inputPath,
        () => 0,
      ).migrate({
        mode: 'write',
        stylesheetPath,
      });

      expect(report.stylesheet).toEqual({ path: 'flex-layout-migration.css', change: 'unchanged' });
    },
  );

  test('fails closed when a static generated-looking class has no owned rule', async () => {
    const inputPath = join(temporaryDirectory, 'input.html');
    const stylesheetPath = join(temporaryDirectory, 'flex-layout-migration.css');
    await writeFile(inputPath, '<div fxLayout="row"></div>', 'utf8');
    await migrationFromPaths(AdapterFactory.createSession('css'), inputPath, inputPath, () => 0).migrate({
      mode: 'write',
      stylesheetPath,
    });
    await writeFile(inputPath, `<div class="flm-${'f'.repeat(64)}"></div>`, 'utf8');

    await expect(
      migrationFromPaths(AdapterFactory.createSession('css'), inputPath, inputPath, () => 0).migrate({
        mode: 'write',
        stylesheetPath,
      }),
    ).rejects.toMatchObject({ code: 'stylesheet-ownership-invalid' });
  });

  test('finalizes CSS after planning every folder template', async () => {
    const inputPath = join(temporaryDirectory, 'input');
    const outputPath = join(temporaryDirectory, 'output');
    const stylesheetPath = join(temporaryDirectory, 'flex-layout-migration.css');
    await mkdir(inputPath);
    await writeFile(join(inputPath, 'a.html'), '<div fxLayout="row"></div>', 'utf8');
    await writeFile(join(inputPath, 'b.html'), '<div fxLayout="column"></div>', 'utf8');

    const report = await migrationFromPaths(
      AdapterFactory.createSession('css'),
      inputPath,
      outputPath,
      () => 0,
    ).migrate({
      mode: 'plan',
      stylesheetPath,
    });

    expect(report.summary).toMatchObject({ filesScanned: 2, filesChanged: 2, converted: 2 });
    expect(report.stylesheet).toEqual({ path: '../flex-layout-migration.css', change: 'created' });
  });

  test('returns a complete CSS parse-error report without preflighting or applying the plan', async () => {
    const inputPath = join(temporaryDirectory, 'input');
    const outputPath = join(temporaryDirectory, 'output');
    const stylesheetPath = join(temporaryDirectory, 'flex-layout-migration.css');
    await mkdir(inputPath);
    await writeFile(join(inputPath, 'a.html'), '<div fxLayout="row"></div>', 'utf8');
    await writeFile(join(inputPath, 'z.html'), '<span fxLayout="row" />', 'utf8');
    const transaction = transactionDouble();

    const report = await migrationFromPaths(
      AdapterFactory.createSession('css'),
      inputPath,
      outputPath,
      () => 0,
      transaction,
    ).migrate({ mode: 'write', stylesheetPath });

    expect(report).toMatchObject({
      target: 'css',
      application: { status: 'skipped', reason: 'parse-errors' },
      summary: { filesScanned: 2, filesChanged: 1, converted: 1, parseErrors: 1 },
      stylesheet: { path: '../flex-layout-migration.css', change: 'created' },
    });
    expect(transaction.preflight).not.toHaveBeenCalled();
    expect(transaction.apply).not.toHaveBeenCalled();
    await expect(access(outputPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(stylesheetPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

function tailwindSession() {
  return AdapterFactory.createSession('tailwind');
}

function migrationFromPaths(
  session: RenderSession,
  inputPath: string,
  outputPath: string,
  now?: () => number,
  transaction?: Pick<MigrationTransaction, 'preflight' | 'apply'>,
  stylesheetPlanner?: Pick<StylesheetPlanner, 'plan'>,
  dependencies?: ValidationDependencies,
): Pick<Migrator, 'migrate'> {
  return {
    async migrate(options: MigrationOptions = { mode: 'plan' }) {
      const invocation = migrationInvocation({ inputPath, outputPath, options });
      const manifest = await new DiscoverProjectStage().run(invocation);
      const analyzed = await new AnalyzeProjectStage().run(manifest);
      const rendered = await new RenderProjectStage(session).run(analyzed);
      const templateValidator = new TemplateProposalValidator(
        new AngularTemplateParser(),
        dependencies?.destinationTemplates,
      );
      const cssReferences = new CssReferenceCollector(
        dependencies?.referenceParser,
        dependencies?.destinationTemplates,
      );
      const validated = await new ValidateProjectStage(templateValidator, cssReferences, stylesheetPlanner).run(
        rendered,
      );
      const applied = await new ApplyProjectStage(options.mode, transaction).run(validated);
      return new Migrator(applied, now).migrate(options);
    },
  };
}

function countingRenderSession(session: RenderSession, onRender: () => void): RenderSession {
  const renderer: ConversionRenderer = Object.freeze({
    ...session.renderer,
    render(plan: Parameters<ConversionRenderer['render']>[0], context: Parameters<ConversionRenderer['render']>[1]) {
      onRender();
      return session.renderer.render(plan, context);
    },
  });
  return Object.freeze({ renderer, finalize: () => session.finalize() });
}

function transactionDouble() {
  return {
    preflight: vi.fn<MigrationTransaction['preflight']>().mockResolvedValue(undefined),
    apply: vi.fn<MigrationTransaction['apply']>().mockResolvedValue(undefined),
  };
}

async function rejectedNodeIoError(action: Promise<unknown>): Promise<Error & NodeJS.ErrnoException> {
  try {
    await action;
  } catch (error: unknown) {
    if (error instanceof Error) return error;
    throw new Error('Expected an Error rejection.', { cause: error });
  }
  throw new Error('Expected the action to reject.');
}

function proposedReport(report: Awaited<ReturnType<Migrator['migrate']>>) {
  return {
    target: report.target,
    files: report.files,
    summary: report.summary,
    stylesheet: report.stylesheet,
  };
}
