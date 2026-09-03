import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TailwindAdapter } from '../adapter/tailwind/tailwind.adapter';
import { TemplateAnalyzer } from '../analyzer/template.analyzer';
import { ConversionPlanner } from '../planner/conversion-planner';
import { AngularTemplateParser } from '../template/angular-template.parser';
import { FileMigrator, type FileMigratorDependencies } from './file.migrator';
import { fileMigrationPlan, migrationPlan, plannedOutputArtifact } from './migration-plan';

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

  test('creates immutable changed output artifacts', () => {
    const input = {
      kind: 'template' as const,
      path: '/project/card.html',
      original: { status: 'present' as const, contents: 'before' },
      proposed: { status: 'present' as const, contents: 'after' },
    };

    const artifact = plannedOutputArtifact(input);

    expect(Object.isFrozen(artifact)).toBe(true);
    expect(Object.isFrozen(artifact.original)).toBe(true);
    expect(Object.isFrozen(artifact.proposed)).toBe(true);
    expect(() => plannedOutputArtifact({ ...input, proposed: input.original })).toThrow('changed states');
    expect(() => plannedOutputArtifact({ ...input, path: 'card.html' })).toThrow('absolute');
    expect(() => plannedOutputArtifact({ ...input, proposed: { status: 'absent' } })).toThrow('template');

    const createdStylesheet = plannedOutputArtifact({
      kind: 'stylesheet',
      path: '/project/flex.css',
      original: { status: 'absent' },
      proposed: { status: 'present', contents: '.flex {}' },
    });
    const removedStylesheet = plannedOutputArtifact({
      kind: 'stylesheet',
      path: '/project/old.css',
      original: { status: 'present', contents: '.old {}' },
      proposed: { status: 'absent' },
    });
    const filePlan = fileMigrationPlan({
      file: { inputPath: '/project/card.html', outputPath: '/project/card.html', changed: true, results: [] },
      artifact,
    });
    const invocationPlan = migrationPlan({
      target: 'tailwind',
      files: [filePlan.file],
      artifacts: [createdStylesheet, removedStylesheet],
    });

    expect(createdStylesheet.original).toEqual({ status: 'absent' });
    expect(removedStylesheet.proposed).toEqual({ status: 'absent' });
    expect(Object.isFrozen(filePlan)).toBe(true);
    expect(Object.isFrozen(filePlan.file)).toBe(true);
    expect(Object.isFrozen(filePlan.file.results)).toBe(true);
    expect(Object.isFrozen(invocationPlan)).toBe(true);
    expect(Object.isFrozen(invocationPlan.files)).toBe(true);
    expect(Object.isFrozen(invocationPlan.files[0])).toBe(true);
    expect(Object.isFrozen(invocationPlan.artifacts)).toBe(true);
    expect(Object.isFrozen(invocationPlan.artifacts[0])).toBe(true);
  });

  test('returns an immutable artifact for a changed static template without writing it', async () => {
    await writeFile(input, '<div fxLayout="column" fxLayoutGap="4"></div>', 'utf8');

    const plan = await new FileMigrator(new TailwindAdapter(), input, output).plan();

    expect(plan.artifact).toMatchObject({
      kind: 'template',
      path: output,
      original: { status: 'absent' },
      proposed: { status: 'present', contents: '<div class="flex flex-col box-border gap-[4px]"></div>' },
    });
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.file)).toBe(true);
    expect(Object.isFrozen(plan.artifact)).toBe(true);
    await expect(access(output)).rejects.toThrow();
    expect(plan.file).toMatchObject({ inputPath: input, outputPath: output, changed: true });
    expect(plan.file.results.map(item => item.status)).toEqual(['converted', 'converted']);
  });

  test('uses one injected dependency lifecycle for a changed template', async () => {
    const source = '<div fxLayout="row"></div>';
    await writeFile(input, source, 'utf8');
    const parser = new AngularTemplateParser();
    const analyzer = new TemplateAnalyzer();
    const planner = new ConversionPlanner();
    const dependencies = {
      readTemplate: vi.fn(async (filePath: string) => readFile(filePath, 'utf8')),
      parser,
      analyzer,
      planner,
    } satisfies FileMigratorDependencies;
    const parse = vi.spyOn(parser, 'parse');
    const analyze = vi.spyOn(analyzer, 'analyze');
    const renderPlan = vi.spyOn(planner, 'plan');

    const plan = await new FileMigrator(new TailwindAdapter(), input, output, undefined, dependencies).plan();

    expect(plan.file.changed).toBe(true);
    expect(dependencies.readTemplate).toHaveBeenCalledTimes(2);
    expect(dependencies.readTemplate).toHaveBeenNthCalledWith(1, input);
    expect(dependencies.readTemplate).toHaveBeenNthCalledWith(2, output);
    expect(parse).toHaveBeenCalledTimes(2);
    expect(parse).toHaveBeenNthCalledWith(1, source, input);
    expect(parse).toHaveBeenNthCalledWith(2, '<div class="flex flex-row box-border"></div>', output);
    expect(analyze).toHaveBeenCalledOnce();
    expect(renderPlan).toHaveBeenCalledOnce();
  });

  test('skips rendering and validation when injected dependencies find no migration inputs', async () => {
    const source = '<div class="card"></div>';
    await writeFile(input, source, 'utf8');
    const parser = new AngularTemplateParser();
    const analyzer = new TemplateAnalyzer();
    const planner = new ConversionPlanner();
    const dependencies = {
      readTemplate: vi.fn(async (filePath: string) => readFile(filePath, 'utf8')),
      parser,
      analyzer,
      planner,
    } satisfies FileMigratorDependencies;
    const parse = vi.spyOn(parser, 'parse');
    const analyze = vi.spyOn(analyzer, 'analyze');
    const renderPlan = vi.spyOn(planner, 'plan');

    const plan = await new FileMigrator(new TailwindAdapter(), input, output, undefined, dependencies).plan();

    expect(plan.file.changed).toBe(false);
    expect(dependencies.readTemplate).toHaveBeenCalledOnce();
    expect(parse).toHaveBeenCalledOnce();
    expect(parse).toHaveBeenCalledWith(source, input);
    expect(analyze).toHaveBeenCalledOnce();
    expect(renderPlan).not.toHaveBeenCalled();
  });

  test('plans an enabled responsive image without changing an in-place input', async () => {
    await writeFile(input, '<img src="base.png" src.sm="small.png">', 'utf8');
    const migrator = new FileMigrator(new TailwindAdapter(), input, input);

    const first = await migrator.plan({ responsiveImages: true });

    expect(first.file.changed).toBe(true);
    expect(first.artifact?.original).toEqual({
      status: 'present',
      contents: '<img src="base.png" src.sm="small.png">',
    });
    expect(first.artifact?.proposed).toEqual({
      status: 'present',
      contents:
        '<picture><source media="screen and (min-width: 600px) and (max-width: 959.98px)" srcset="small.png"><img src="base.png"></picture>',
    });
    expect(await readFile(input, 'utf8')).toBe('<img src="base.png" src.sm="small.png">');
  });

  test('records an existing distinct destination and returns no artifact once it is exact', async () => {
    await writeFile(input, '<div fxLayout="row"></div>', 'utf8');
    await mkdir(join(temporaryDirectory, 'output'));
    await writeFile(output, '<div class="old"></div>', 'utf8');
    const migrator = new FileMigrator(new TailwindAdapter(), input, output);

    const first = await migrator.plan();

    expect(first.file.changed).toBe(true);
    expect(first.artifact?.original).toEqual({ status: 'present', contents: '<div class="old"></div>' });
    expect(first.artifact?.proposed).toEqual({
      status: 'present',
      contents: '<div class="flex flex-row box-border"></div>',
    });
    const proposed = first.artifact?.proposed;
    if (!proposed || proposed.status !== 'present') throw new Error('Expected a proposed template artifact.');
    await writeFile(output, proposed.contents, 'utf8');

    const second = await migrator.plan();
    expect(second.file.changed).toBe(false);
    expect(second.artifact).toBeUndefined();
  });

  test('does not create an artifact when the complete generated template fails reparsing', async () => {
    await writeFile(input, '<div fxLayout="row"></div>', 'utf8');
    let calls = 0;
    const parser = {
      parse: (source: string) => {
        calls++;
        if (calls === 1) return new AngularTemplateParser().parse(source, input);
        return {
          status: 'parse-error' as const,
          diagnostics: [{ message: 'injected generated failure', source: { start: 0, end: 1 } }],
        };
      },
    };

    const plan = await new FileMigrator(new TailwindAdapter(), input, output, parser).plan();

    expect(plan.file).toMatchObject({
      changed: false,
      results: [{ status: 'parse-error', code: 'generated-template-parse-error' }],
    });
    expect(plan.artifact).toBeUndefined();
    await expect(access(output)).rejects.toThrow();
  });

  test.each([
    ['<div [fxFlex]="basis"></div>', 'dynamic-binding'],
    ['<div fxLayout.cinema="row"></div>', 'custom-breakpoint'],
  ])('returns unchanged for unresolved input %s', async (source, code) => {
    await writeFile(input, source, 'utf8');

    const plan = await new FileMigrator(new TailwindAdapter(), input, output).plan();

    expect(plan.file.changed).toBe(false);
    expect(plan.artifact).toBeUndefined();
    expect(plan.file.results).toContainEqual(expect.objectContaining({ status: 'review', code }));
    await expect(access(output)).rejects.toThrow();
  });

  test('plans exact standard responsive variants without unresolved diagnostics', async () => {
    await writeFile(input, '<div fxLayout.sm="row"></div>', 'utf8');

    const plan = await new FileMigrator(new TailwindAdapter(), input, output).plan();

    expect(plan.artifact?.proposed).toEqual({
      status: 'present',
      contents:
        '<div class="[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:flex [@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:flex-row [@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:box-border"></div>',
    });
    expect(plan.file.results.map(item => item.status)).toEqual(['converted']);
    await expect(access(output)).rejects.toThrow();
  });

  test('returns exact public results for mixed converted and unresolved visibility inputs', async () => {
    await writeFile(
      input,
      '<div fxHide></div>\n<div class="block" fxShow="false" fxShow.sm></div>\n<div fxShow="false" fxShow.sm></div>\n<div [fxHide]="hidden"></div>',
      'utf8',
    );

    const plan = await new FileMigrator(new TailwindAdapter(), input, output).plan();

    expect(plan.artifact?.proposed).toEqual({
      status: 'present',
      contents:
        '<div class="hidden"></div>\n<div class="block hidden [@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:block"></div>\n<div fxShow="false" fxShow.sm></div>\n<div [fxHide]="hidden"></div>',
    });
    expect(
      plan.file.results.map(item => ({
        status: item.status,
        sourceName: item.status === 'parse-error' ? undefined : item.input.sourceName,
        code: item.status === 'converted' || item.status === 'parse-error' ? undefined : item.code,
      })),
    ).toEqual([
      { status: 'converted', sourceName: 'fxHide', code: undefined },
      { status: 'converted', sourceName: 'fxShow', code: undefined },
      { status: 'converted', sourceName: 'fxShow.sm', code: undefined },
      { status: 'review', sourceName: 'fxShow', code: 'display-restoration-unverified' },
      { status: 'review', sourceName: 'fxShow.sm', code: 'display-restoration-unverified' },
      { status: 'review', sourceName: '[fxHide]', code: 'dynamic-binding' },
    ]);
    await expect(access(output)).rejects.toThrow();
  });

  test('returns an unchanged parse diagnostic and does not create an artifact for malformed templates', async () => {
    await writeFile(input, '<span fxLayout="row" />', 'utf8');

    const plan = await new FileMigrator(new TailwindAdapter(), input, output).plan();

    expect(plan.file.changed).toBe(false);
    expect(plan.artifact).toBeUndefined();
    expect(plan.file.results).toContainEqual(
      expect.objectContaining({ status: 'parse-error', code: 'template-parse-error' }),
    );
    await expect(access(output)).rejects.toThrow();
  });

  test('returns unchanged and does not create an artifact when a valid template needs no edits', async () => {
    await writeFile(input, '<div class="card"></div>', 'utf8');

    const plan = await new FileMigrator(new TailwindAdapter(), input, output).plan();

    expect(plan.file.changed).toBe(false);
    expect(plan.file.results).toEqual([]);
    expect(plan.artifact).toBeUndefined();
    await expect(access(output)).rejects.toThrow();
  });

  test('plans converted responsive class and style occurrences while preserving review cases', async () => {
    await writeFile(
      input,
      '<div ngClass.sm="flex items-center"></div>\n<div ngClass.sm="card"></div>\n<div ngStyle.lt-md="font-size.px: 14"></div>\n<div ngStyle.sm="background-image:url(card.png)"></div>',
      'utf8',
    );

    const plan = await new FileMigrator(new TailwindAdapter(), input, output).plan();

    expect(plan.artifact?.proposed).toEqual({
      status: 'present',
      contents:
        '<div class="[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:flex [@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:items-center"></div>\n<div ngClass.sm="card"></div>\n<div class="[@media_screen_and_(max-width:_959.98px)]:[font-size:14px]"></div>\n<div ngStyle.sm="background-image:url(card.png)"></div>',
    });
    expect(
      plan.file.results.map(item => ({
        status: item.status,
        sourceName: item.status === 'parse-error' ? undefined : item.input.sourceName,
        code: item.status === 'converted' || item.status === 'parse-error' ? undefined : item.code,
      })),
    ).toEqual([
      { status: 'converted', sourceName: 'ngClass.sm', code: undefined },
      { status: 'review', sourceName: 'ngClass.sm', code: 'tailwind-candidate-unverified' },
      { status: 'converted', sourceName: 'ngStyle.lt-md', code: undefined },
      { status: 'review', sourceName: 'ngStyle.sm', code: 'style-value-unverified' },
    ]);
    await expect(access(output)).rejects.toThrow();
  });
});
