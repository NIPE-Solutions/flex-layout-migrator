import { readdir } from 'node:fs/promises';
import * as path from 'node:path';
import { AdapterFactory } from '../adapter/adapter.factory';
import type { MigrationOptions } from '../migrator/migrator';
import type { MigrationReport } from '../report/migration-report';
import { AnalyzeProjectStage } from './analyze/analyze-project.stage';
import { analyzedProject } from './analyzed-project';
import { CurrentMigrationPipeline, type MigratorFactory } from './current-migration.pipeline';
import type { DiscoveryFileSystem } from './discover/discovery-file-system.port';
import { DiscoverProjectStage } from './discover/discover-project.stage';
import type { AnalyzeStage, DiscoverStage } from './migration-pipeline';
import { migrationInvocation, projectManifest } from './project-manifest';

describe('CurrentMigrationPipeline', () => {
  test('runs discovery and analysis once before migrating the exact analyzed handoff', async () => {
    const events: string[] = [];
    const session = AdapterFactory.createSession('tailwind');
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
    const createMigrator = vi.fn<MigratorFactory>((receivedSession, receivedAnalyzed) => {
      events.push('create-migrator');
      expect(receivedSession).toBe(session);
      expect(receivedAnalyzed).toBe(analyzed);
      return { migrate };
    });

    const actualReport = await new CurrentMigrationPipeline(session, discover, analyze, createMigrator).run(invocation);

    expect(actualReport).toBe(expectedReport);
    expect(events).toEqual(['discover', 'analyze', 'create-migrator', 'migrate']);
    expect(discover.run).toHaveBeenCalledOnce();
    expect(discover.run).toHaveBeenCalledWith(invocation);
    expect(analyze.run).toHaveBeenCalledOnce();
    expect(analyze.run).toHaveBeenCalledWith(manifest);
    expect(createMigrator).toHaveBeenCalledOnce();
    expect(createMigrator).toHaveBeenCalledWith(session, analyzed);
    expect(migrate).toHaveBeenCalledOnce();
    expect(migrate).toHaveBeenCalledWith(invocation.options);
    expect(invocation.options).not.toBe(callerOptions);
    expect(Object.isFrozen(invocation.options)).toBe(true);
    expect(invocation.canonicalInputPath).toBe(path.resolve('input.html'));
    expect(invocation.canonicalOutputPath).toBe(path.resolve('output.html'));
  });

  test('constructs a fresh analyzed continuation whenever the same invocation runs again', async () => {
    const session = AdapterFactory.createSession('tailwind');
    const invocation = migrationInvocation({
      inputPath: 'input.html',
      outputPath: 'output.html',
      options: { mode: 'plan' },
    });
    const manifest = projectManifest({ invocation, templates: [] });
    const analyzed = analyzedProject({ manifest, templates: [] });
    const reports = [report('first'), report('second')];
    const discover: DiscoverStage = { run: vi.fn(async () => manifest) };
    const analyze: AnalyzeStage = { run: vi.fn(async () => analyzed) };
    let factoryCalls = 0;
    const createMigrator = vi.fn<MigratorFactory>(() => {
      const expectedReport = reports[factoryCalls];
      factoryCalls++;
      if (expectedReport === undefined) throw new Error('Unexpected migrator construction.');
      return { migrate: vi.fn(async () => expectedReport) };
    });
    const pipeline = new CurrentMigrationPipeline(session, discover, analyze, createMigrator);

    const first = await pipeline.run(invocation);
    const second = await pipeline.run(invocation);

    expect(discover.run).toHaveBeenCalledTimes(2);
    expect(analyze.run).toHaveBeenCalledTimes(2);
    expect(createMigrator).toHaveBeenCalledTimes(2);
    expect(first).toBe(reports[0]);
    expect(second).toBe(reports[1]);
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
    const createMigrator = vi.fn<MigratorFactory>();

    await expect(
      new CurrentMigrationPipeline(AdapterFactory.createSession('tailwind'), discover, analyze, createMigrator).run(
        invocation,
      ),
    ).rejects.toBe(error);

    expect(analyze.run).not.toHaveBeenCalled();
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
    const createMigrator = vi.fn<MigratorFactory>();

    await expect(
      new CurrentMigrationPipeline(AdapterFactory.createSession('tailwind'), discover, analyze, createMigrator).run(
        invocation,
      ),
    ).rejects.toBe(error);

    expect(discover.run).toHaveBeenCalledOnce();
    expect(analyze.run).toHaveBeenCalledOnce();
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
    const discover: DiscoverStage = { run: vi.fn(async () => manifest) };
    const analyze: AnalyzeStage = { run: vi.fn(async () => analyzed) };
    const migrate = vi.fn(async () => Promise.reject(error));
    const createMigrator = vi.fn<MigratorFactory>(() => ({ migrate }));

    await expect(
      new CurrentMigrationPipeline(AdapterFactory.createSession('tailwind'), discover, analyze, createMigrator).run(
        invocation,
      ),
    ).rejects.toBe(error);

    expect(discover.run).toHaveBeenCalledOnce();
    expect(analyze.run).toHaveBeenCalledOnce();
    expect(createMigrator).toHaveBeenCalledOnce();
    expect(migrate).toHaveBeenCalledOnce();
    expect(migrate).toHaveBeenCalledWith(invocation.options);
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
    const createMigrator = vi.fn<MigratorFactory>();

    const error = await rejectedNodeIoError(
      new CurrentMigrationPipeline(AdapterFactory.createSession('tailwind'), discover, analyze, createMigrator).run(
        invocation,
      ),
    );

    expect(error.message).toBe(`ENOENT: no such file or directory, scandir '${rawInputPath}'`);
    expect(error.path).toBe(rawInputPath);
    expect(error.code).toBe('ENOENT');
    expect(fileSystem.kind).toHaveBeenCalledWith(invocation.canonicalInputPath);
    expect(ignoreMatchers.load).toHaveBeenCalledWith(invocation.canonicalInputPath);
    expect(fileSystem.entries).toHaveBeenCalledWith(invocation.canonicalInputPath);
    expect(analyze.run).not.toHaveBeenCalled();
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
    const createMigrator = vi.fn<MigratorFactory>();

    const error = await rejectedNodeIoError(
      new CurrentMigrationPipeline(AdapterFactory.createSession('tailwind'), discover, analyze, createMigrator).run(
        invocation,
      ),
    );

    expect(error.message).toBe(`ENOENT: no such file or directory, open '${rawTemplatePath}'`);
    expect(error.path).toBe(rawTemplatePath);
    expect(error.code).toBe('ENOENT');
    expect(discover.run).toHaveBeenCalledWith(invocation);
    expect(createMigrator).not.toHaveBeenCalled();
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
