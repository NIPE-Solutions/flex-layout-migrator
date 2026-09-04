import { readdir } from 'node:fs/promises';
import * as path from 'node:path';
import { MigrationApplicationError } from '../migrator/migration-application.error';
import { Migrator } from '../migrator/migrator';
import type { MigrationOptions } from '../migrator/migrator';
import type { MigrationReport } from '../report/migration-report';
import { AnalyzeProjectStage } from './analyze/analyze-project.stage';
import { analyzedProject } from './analyzed-project';
import { CurrentMigrationPipeline, type MigratorFactory } from './current-migration.pipeline';
import type { DiscoveryFileSystem } from './discover/discovery-file-system.port';
import { DiscoverProjectStage } from './discover/discover-project.stage';
import type { AnalyzeStage, DiscoverStage, RenderStage } from './migration-pipeline';
import { migrationInvocation, projectManifest } from './project-manifest';
import { renderedProject, type RenderedProject } from './rendered-project';

describe('CurrentMigrationPipeline', () => {
  test('runs discover, analyze, render, then the rendered continuation exactly once', async () => {
    const events: string[] = [];
    const callerOptions: MigrationOptions = {
      mode: 'write',
      responsiveImages: true,
      stylesheetPath: 'styles/flex-layout.css',
      reportPath: 'reports/migration.json',
    };
    const invocation = migrationInvocation({
      inputPath: 'templates/../input.html',
      outputPath: 'generated/../output.html',
      options: callerOptions,
    });
    const manifest = projectManifest({ invocation, templates: [] });
    const analyzed = analyzedProject({ manifest, templates: [] });
    const rendered = tailwindRendered(analyzed);
    const expectedReport = report('delegated');
    const migrate = vi.fn((options?: MigrationOptions) => {
      events.push('migrate');
      expect(options).toBe(invocation.options);
      return Promise.resolve(expectedReport);
    });
    const discover: DiscoverStage = {
      run: vi.fn(async received => {
        events.push('discover');
        expect(received).toBe(invocation);
        return manifest;
      }),
    };
    const analyze: AnalyzeStage = {
      run: vi.fn(async received => {
        events.push('analyze');
        expect(received).toBe(manifest);
        return analyzed;
      }),
    };
    const render: RenderStage = {
      run: vi.fn(async received => {
        events.push('render');
        expect(received).toBe(analyzed);
        return rendered;
      }),
    };
    let receivedRendered: RenderedProject | undefined;
    const createMigrator = vi.fn<MigratorFactory>(received => {
      events.push('create-continuation');
      receivedRendered = received;
      return { migrate };
    });

    const actualReport = await new CurrentMigrationPipeline(render, discover, analyze, createMigrator).run(invocation);

    expect(actualReport).toBe(expectedReport);
    expect(events).toEqual(['discover', 'analyze', 'render', 'create-continuation', 'migrate']);
    expect(receivedRendered).toBe(rendered);
    expect(discover.run).toHaveBeenCalledOnce();
    expect(discover.run).toHaveBeenCalledWith(invocation);
    expect(analyze.run).toHaveBeenCalledOnce();
    expect(analyze.run).toHaveBeenCalledWith(manifest);
    expect(render.run).toHaveBeenCalledOnce();
    expect(render.run).toHaveBeenCalledWith(analyzed);
    expect(createMigrator).toHaveBeenCalledOnce();
    expect(createMigrator).toHaveBeenCalledWith(rendered);
    expect(migrate).toHaveBeenCalledOnce();
    expect(migrate).toHaveBeenCalledWith(invocation.options, {
      mapDestinationReadError: expect.any(Function),
      now: expect.any(Function),
      startedAt: expect.any(Number),
    });
    expect(invocation.options).not.toBe(callerOptions);
    expect(Object.isFrozen(invocation.options)).toBe(true);
    expect(invocation.canonicalInputPath).toBe(path.resolve('input.html'));
    expect(invocation.canonicalOutputPath).toBe(path.resolve('output.html'));
  });

  test('constructs a fresh rendered continuation whenever the same invocation runs again', async () => {
    const invocation = migrationInvocation({
      inputPath: 'input.html',
      outputPath: 'output.html',
      options: { mode: 'plan' },
    });
    const manifest = projectManifest({ invocation, templates: [] });
    const analyzed = analyzedProject({ manifest, templates: [] });
    const rendered = tailwindRendered(analyzed);
    const reports = [report('first'), report('second')];
    const discover: DiscoverStage = { run: vi.fn(async () => manifest) };
    const analyze: AnalyzeStage = { run: vi.fn(async () => analyzed) };
    const render: RenderStage = { run: vi.fn(async () => rendered) };
    let factoryCalls = 0;
    const createMigrator = vi.fn<MigratorFactory>(() => {
      const expectedReport = reports[factoryCalls];
      factoryCalls++;
      if (expectedReport === undefined) throw new Error('Unexpected migrator construction.');
      return { migrate: vi.fn(async () => expectedReport) };
    });
    const pipeline = new CurrentMigrationPipeline(render, discover, analyze, createMigrator);

    const first = await pipeline.run(invocation);
    const second = await pipeline.run(invocation);

    expect(discover.run).toHaveBeenCalledTimes(2);
    expect(analyze.run).toHaveBeenCalledTimes(2);
    expect(render.run).toHaveBeenCalledTimes(2);
    expect(createMigrator).toHaveBeenCalledTimes(2);
    expect(first).toBe(reports[0]);
    expect(second).toBe(reports[1]);
  });

  test('measures one deterministic duration from before Discover through the continuation report', async () => {
    const events: string[] = [];
    const clockValues = [1000, 1375];
    const now = vi.fn(() => {
      const value = clockValues.shift();
      if (value === undefined) throw new Error('The invocation clock must be read exactly twice.');
      events.push(`clock:${value}`);
      return value;
    });
    const invocation = migrationInvocation({
      inputPath: 'input.html',
      outputPath: 'output.html',
      options: { mode: 'plan' },
    });
    const manifest = projectManifest({ invocation, templates: [] });
    const analyzed = analyzedProject({ manifest, templates: [] });
    const rendered = tailwindRendered(analyzed);
    const discover: DiscoverStage = {
      run: vi.fn(async () => {
        events.push('discover');
        return manifest;
      }),
    };
    const analyze: AnalyzeStage = {
      run: vi.fn(async () => {
        events.push('analyze');
        return analyzed;
      }),
    };
    const render: RenderStage = {
      run: vi.fn(async () => {
        events.push('render');
        return rendered;
      }),
    };
    const createMigrator = vi.fn<MigratorFactory>(receivedRendered => {
      events.push('create-continuation');
      const migrator = new Migrator(receivedRendered, () => {
        throw new Error('Pipeline timing must replace the continuation-only clock.');
      });
      return {
        async migrate(options, execution) {
          events.push('migrate');
          const result = await migrator.migrate(options, execution);
          events.push('report');
          return result;
        },
      };
    });

    const actualReport = await new CurrentMigrationPipeline(render, discover, analyze, createMigrator, now).run(
      invocation,
    );

    expect(actualReport.durationMs).toBe(375);
    expect(events).toEqual([
      'clock:1000',
      'discover',
      'analyze',
      'render',
      'create-continuation',
      'migrate',
      'clock:1375',
      'report',
    ]);
    expect(now).toHaveBeenCalledTimes(2);
  });

  test('preserves a discovery rejection and prevents analysis and migration', async () => {
    const error = new Error('discovery failed');
    const invocation = migrationInvocation({
      inputPath: 'input.html',
      outputPath: 'output.html',
      options: { mode: 'write' },
    });
    const discover: DiscoverStage = { run: vi.fn(async () => Promise.reject(error)) };
    const analyze: AnalyzeStage = { run: vi.fn() };
    const render: RenderStage = { run: vi.fn() };
    const createMigrator = vi.fn<MigratorFactory>();

    await expect(new CurrentMigrationPipeline(render, discover, analyze, createMigrator).run(invocation)).rejects.toBe(
      error,
    );

    expect(analyze.run).not.toHaveBeenCalled();
    expect(render.run).not.toHaveBeenCalled();
    expect(createMigrator).not.toHaveBeenCalled();
  });

  test('preserves an analysis rejection and prevents migration', async () => {
    const error = new Error('analysis failed');
    const invocation = migrationInvocation({
      inputPath: 'input.html',
      outputPath: 'output.html',
      options: { mode: 'write' },
    });
    const manifest = projectManifest({ invocation, templates: [] });
    const discover: DiscoverStage = { run: vi.fn(async () => manifest) };
    const analyze: AnalyzeStage = { run: vi.fn(async () => Promise.reject(error)) };
    const render: RenderStage = { run: vi.fn() };
    const createMigrator = vi.fn<MigratorFactory>();

    await expect(new CurrentMigrationPipeline(render, discover, analyze, createMigrator).run(invocation)).rejects.toBe(
      error,
    );

    expect(discover.run).toHaveBeenCalledOnce();
    expect(analyze.run).toHaveBeenCalledOnce();
    expect(render.run).not.toHaveBeenCalled();
    expect(createMigrator).not.toHaveBeenCalled();
  });

  test('preserves a raw relative descendant path when rendering rejects before continuation creation', async () => {
    const rawInputPath = 'relative-fixtures/input';
    const invocation = migrationInvocation({
      inputPath: rawInputPath,
      outputPath: 'relative-fixtures/output',
      options: { mode: 'plan' },
    });
    const manifest = projectManifest({ invocation, templates: [] });
    const analyzed = analyzedProject({ manifest, templates: [] });
    const canonicalPath = path.join(invocation.canonicalInputPath, 'nested', 'card.html');
    const error = Object.assign(new Error(`EACCES: permission denied, open '${canonicalPath}'`), {
      code: 'EACCES',
      path: canonicalPath,
    });
    const discover: DiscoverStage = { run: vi.fn(async () => manifest) };
    const analyze: AnalyzeStage = { run: vi.fn(async () => analyzed) };
    const render: RenderStage = { run: vi.fn(async () => Promise.reject(error)) };
    const createMigrator = vi.fn<MigratorFactory>();

    const rejected = await rejectedNodeIoError(
      new CurrentMigrationPipeline(render, discover, analyze, createMigrator).run(invocation),
    );

    expect(rejected).toBe(error);
    expect(rejected.message).toBe(
      `EACCES: permission denied, open '${path.join(rawInputPath, 'nested', 'card.html')}'`,
    );
    expect(rejected.path).toBe(path.join(rawInputPath, 'nested', 'card.html'));
    expect(createMigrator).not.toHaveBeenCalled();
  });

  test('preserves the exact migration rejection after both stages complete', async () => {
    const error = new Error('migration failed');
    const invocation = migrationInvocation({
      inputPath: 'input.html',
      outputPath: 'output.html',
      options: { mode: 'write' },
    });
    const manifest = projectManifest({ invocation, templates: [] });
    const analyzed = analyzedProject({ manifest, templates: [] });
    const rendered = tailwindRendered(analyzed);
    const discover: DiscoverStage = { run: vi.fn(async () => manifest) };
    const analyze: AnalyzeStage = { run: vi.fn(async () => analyzed) };
    const render: RenderStage = { run: vi.fn(async () => rendered) };
    const migrate = vi.fn(async () => Promise.reject(error));
    const createMigrator = vi.fn<MigratorFactory>(() => ({ migrate }));

    await expect(new CurrentMigrationPipeline(render, discover, analyze, createMigrator).run(invocation)).rejects.toBe(
      error,
    );

    expect(discover.run).toHaveBeenCalledOnce();
    expect(analyze.run).toHaveBeenCalledOnce();
    expect(render.run).toHaveBeenCalledOnce();
    expect(createMigrator).toHaveBeenCalledOnce();
    expect(migrate).toHaveBeenCalledOnce();
    expect(migrate).toHaveBeenCalledWith(invocation.options, {
      mapDestinationReadError: expect.any(Function),
      now: expect.any(Function),
      startedAt: expect.any(Number),
    });
  });

  test('preserves a raw relative directory path when enumeration fails after input kind and ignore loading succeed', async () => {
    const rawInputPath = 'relative-fixtures/nonexistent-input';
    const invocation = migrationInvocation({
      inputPath: rawInputPath,
      outputPath: 'relative-fixtures/output',
      options: { mode: 'plan' },
    });
    const fileSystem: DiscoveryFileSystem = {
      kind: vi.fn<DiscoveryFileSystem['kind']>().mockResolvedValue('directory'),
      entries: vi.fn(async directory => {
        await readdir(directory);
        return [];
      }),
    };
    const ignoreMatchers = {
      load: vi.fn(async () => ({ ignores: () => false, ignoresDirectory: () => false })),
    };
    const discover = new DiscoverProjectStage(fileSystem, ignoreMatchers);
    const analyze: AnalyzeStage = { run: vi.fn() };
    const render: RenderStage = { run: vi.fn() };
    const createMigrator = vi.fn<MigratorFactory>();

    const error = await rejectedNodeIoError(
      new CurrentMigrationPipeline(render, discover, analyze, createMigrator).run(invocation),
    );

    expect(error.message).toBe(`ENOENT: no such file or directory, scandir '${rawInputPath}'`);
    expect(error.path).toBe(rawInputPath);
    expect(error.code).toBe('ENOENT');
    expect(fileSystem.kind).toHaveBeenCalledWith(invocation.canonicalInputPath);
    expect(ignoreMatchers.load).toHaveBeenCalledWith(invocation.canonicalInputPath, invocation.inputPath);
    expect(fileSystem.entries).toHaveBeenCalledWith(invocation.canonicalInputPath);
    expect(analyze.run).not.toHaveBeenCalled();
    expect(render.run).not.toHaveBeenCalled();
    expect(createMigrator).not.toHaveBeenCalled();
  });

  test('preserves a raw relative descendant path when analyzed template reading fails after discovery', async () => {
    const rawInputPath = 'relative-fixtures/nonexistent-input';
    const rawTemplatePath = path.join(rawInputPath, 'nested', 'card.html');
    const invocation = migrationInvocation({
      inputPath: rawInputPath,
      outputPath: 'relative-fixtures/output',
      options: { mode: 'plan' },
    });
    const manifest = projectManifest({
      invocation,
      templates: [
        {
          inputPath: path.join(invocation.canonicalInputPath, 'nested', 'card.html'),
          outputPath: path.join(invocation.canonicalOutputPath, 'nested', 'card.html'),
        },
      ],
    });
    const discover: DiscoverStage = { run: vi.fn(async () => manifest) };
    const analyze = new AnalyzeProjectStage();
    const render: RenderStage = { run: vi.fn() };
    const createMigrator = vi.fn<MigratorFactory>();

    const error = await rejectedNodeIoError(
      new CurrentMigrationPipeline(render, discover, analyze, createMigrator).run(invocation),
    );

    expect(error.message).toBe(`ENOENT: no such file or directory, open '${rawTemplatePath}'`);
    expect(error.path).toBe(rawTemplatePath);
    expect(error.code).toBe('ENOENT');
    expect(discover.run).toHaveBeenCalledWith(invocation);
    expect(render.run).not.toHaveBeenCalled();
    expect(createMigrator).not.toHaveBeenCalled();
  });

  test.each(['stylesheet read', 'transaction rename'])(
    'does not rewrite a relative-root-contained absolute %s failure from the migration continuation',
    async phase => {
      const invocation = migrationInvocation({
        inputPath: 'relative-fixtures/input',
        outputPath: 'relative-fixtures/output',
        options: { mode: 'write' },
      });
      const manifest = projectManifest({ invocation, templates: [] });
      const analyzed = analyzedProject({ manifest, templates: [] });
      const rendered = tailwindRendered(analyzed);
      const discover: DiscoverStage = { run: vi.fn(async () => manifest) };
      const analyze: AnalyzeStage = { run: vi.fn(async () => analyzed) };
      const render: RenderStage = { run: vi.fn(async () => rendered) };
      const cause = new Error(`${phase} cause`);
      const source =
        phase === 'stylesheet read'
          ? path.join(invocation.canonicalInputPath, 'styles', 'flex.css')
          : path.join(invocation.canonicalOutputPath, 'nested', 'card.html.tmp');
      const destination =
        phase === 'transaction rename' ? path.join(invocation.canonicalOutputPath, 'nested', 'card.html') : undefined;
      const message =
        destination === undefined
          ? `EACCES: permission denied, open '${source}'`
          : `EACCES: permission denied, rename '${source}' -> '${destination}'`;
      const error = Object.assign(new TypeError(message, { cause }), {
        code: 'EACCES',
        errno: -13,
        syscall: destination === undefined ? 'open' : 'rename',
        path: source,
        ...(destination === undefined ? {} : { dest: destination }),
      });
      const createMigrator = vi.fn<MigratorFactory>(() => ({
        migrate: vi.fn(async () => Promise.reject(error)),
      }));

      const rejected = await rejectedNodeIoError(
        new CurrentMigrationPipeline(render, discover, analyze, createMigrator).run(invocation),
      );

      expect(rejected).toBe(error);
      expect(rejected).toBeInstanceOf(TypeError);
      expect(rejected.message).toBe(message);
      expect(rejected.path).toBe(source);
      expect(rejected.code).toBe('EACCES');
      expect(rejected.cause).toBe(cause);
      if (destination !== undefined)
        expect((rejected as NodeJS.ErrnoException & { dest?: string }).dest).toBe(destination);
    },
  );

  test('does not rewrite absolute validation diagnostics produced by the migration continuation', async () => {
    const invocation = migrationInvocation({
      inputPath: 'relative-fixtures/input',
      outputPath: 'relative-fixtures/output',
      options: { mode: 'plan' },
    });
    const manifest = projectManifest({ invocation, templates: [] });
    const analyzed = analyzedProject({ manifest, templates: [] });
    const rendered = tailwindRendered(analyzed);
    const discover: DiscoverStage = { run: vi.fn(async () => manifest) };
    const analyze: AnalyzeStage = { run: vi.fn(async () => analyzed) };
    const render: RenderStage = { run: vi.fn(async () => rendered) };
    const collision = path.join(invocation.canonicalOutputPath, 'nested', 'card.html');
    const cause = new Error('validation cause');
    const error = new MigrationApplicationError(
      'path-collision',
      `Migration paths collide: ${collision}`,
      [collision],
      { cause },
    );
    const createMigrator = vi.fn<MigratorFactory>(() => ({
      migrate: vi.fn(async () => Promise.reject(error)),
    }));

    await expect(new CurrentMigrationPipeline(render, discover, analyze, createMigrator).run(invocation)).rejects.toBe(
      error,
    );

    expect(error.message).toBe(`Migration paths collide: ${collision}`);
    expect(error.paths).toEqual([collision]);
    expect(error.code).toBe('path-collision');
    expect(error.cause).toBe(cause);
  });

  test.each([
    {
      label: 'an absolute invocation path',
      inputPath: path.resolve('absolute-fixtures/input'),
      errorPath: path.resolve('absolute-fixtures/input/nested/card.html'),
    },
    {
      label: 'a path outside both relative invocation roots',
      inputPath: 'relative-fixtures/input',
      errorPath: path.resolve('outside-fixtures/card.html'),
    },
  ])('leaves $label unchanged when Discover rejects', async fixture => {
    const invocation = migrationInvocation({
      inputPath: fixture.inputPath,
      outputPath: 'relative-fixtures/output',
      options: { mode: 'plan' },
    });
    const message = `EACCES: permission denied, stat '${fixture.errorPath}'`;
    const error = Object.assign(new Error(message), { code: 'EACCES', path: fixture.errorPath });
    const discover: DiscoverStage = { run: vi.fn(async () => Promise.reject(error)) };
    const render: RenderStage = { run: vi.fn() };

    const rejected = await rejectedNodeIoError(
      new CurrentMigrationPipeline(render, discover, { run: vi.fn() }, vi.fn<MigratorFactory>()).run(invocation),
    );

    expect(rejected).toBe(error);
    expect(rejected.message).toBe(message);
    expect(rejected.path).toBe(fixture.errorPath);
  });
});

async function rejectedNodeIoError(action: Promise<unknown>): Promise<Error & NodeJS.ErrnoException> {
  try {
    await action;
  } catch (error: unknown) {
    if (error instanceof Error) return error;
    throw new Error('Expected an Error rejection.', { cause: error });
  }
  throw new Error('Expected the action to reject.');
}

function report(input: string): MigrationReport {
  return {
    schemaVersion: 2,
    mode: 'plan',
    target: 'tailwind',
    application: { status: 'skipped', reason: 'plan-only' },
    input,
    output: 'output.html',
    durationMs: 0,
    summary: {
      filesScanned: 1,
      filesChanged: 0,
      converted: 0,
      review: 0,
      unsupported: 0,
      invalid: 0,
      parseErrors: 0,
    },
    files: [],
  };
}

function tailwindRendered(analyzed: ReturnType<typeof analyzedProject>): RenderedProject {
  return renderedProject({ analyzed, files: [], session: { target: 'tailwind' } });
}
