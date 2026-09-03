import { AdapterFactory } from '../adapter/adapter.factory';
import type { MigrationOptions } from '../migrator/migrator';
import type { MigrationReport } from '../report/migration-report';
import { CurrentMigrationPipeline, type MigratorFactory } from './current-migration.pipeline';
import { migrationInvocation } from './project-manifest';

describe('CurrentMigrationPipeline', () => {
  test('constructs one migrator from normalized paths and forwards the copied options', async () => {
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
    const factoryArguments: Parameters<MigratorFactory>[] = [];
    const migratedOptions: Readonly<MigrationOptions>[] = [];
    const expectedReport = report('delegated');
    const createMigrator: MigratorFactory = (...arguments_) => {
      factoryArguments.push(arguments_);
      return {
        migrate(options) {
          if (options === undefined) throw new Error('Expected migration options.');
          migratedOptions.push(options);
          return Promise.resolve(expectedReport);
        },
      };
    };

    await new CurrentMigrationPipeline(session, createMigrator).run(invocation);

    expect(invocation.options).not.toBe(callerOptions);
    expect(Object.isFrozen(invocation.options)).toBe(true);
    expect(factoryArguments).toEqual([[session, invocation.inputPath, invocation.outputPath]]);
    expect(migratedOptions).toEqual([invocation.options]);
    expect(migratedOptions[0]).toBe(invocation.options);
  });

  test('returns the exact report produced by the migrator', async () => {
    const expectedReport = report('same-report');
    const invocation = migrationInvocation({
      inputPath: 'input.html',
      outputPath: 'output.html',
      options: { mode: 'plan' },
    });
    const createMigrator: MigratorFactory = () => ({ migrate: () => Promise.resolve(expectedReport) });

    const actualReport = await new CurrentMigrationPipeline(
      AdapterFactory.createSession('tailwind'),
      createMigrator,
    ).run(invocation);

    expect(actualReport).toBe(expectedReport);
  });

  test('constructs a fresh migrator whenever the same invocation runs again', async () => {
    const reports = [report('first'), report('second')];
    const invocation = migrationInvocation({
      inputPath: 'input.html',
      outputPath: 'output.html',
      options: { mode: 'plan' },
    });
    const migratedOptions: Readonly<MigrationOptions>[] = [];
    let factoryCalls = 0;
    const createMigrator: MigratorFactory = () => {
      const expectedReport = reports[factoryCalls];
      factoryCalls++;
      if (expectedReport === undefined) throw new Error('Unexpected migrator construction.');
      return {
        migrate(options) {
          if (options === undefined) throw new Error('Expected migration options.');
          migratedOptions.push(options);
          return Promise.resolve(expectedReport);
        },
      };
    };
    const pipeline = new CurrentMigrationPipeline(AdapterFactory.createSession('tailwind'), createMigrator);

    const first = await pipeline.run(invocation);
    const second = await pipeline.run(invocation);

    expect(factoryCalls).toBe(2);
    expect(migratedOptions).toEqual([invocation.options, invocation.options]);
    expect(first).toBe(reports[0]);
    expect(second).toBe(reports[1]);
  });

  test('preserves the exact migrator rejection', async () => {
    const error = new Error('migration failed');
    const invocation = migrationInvocation({
      inputPath: 'input.html',
      outputPath: 'output.html',
      options: { mode: 'write' },
    });
    const createMigrator: MigratorFactory = () => ({ migrate: () => Promise.reject(error) });

    await expect(
      new CurrentMigrationPipeline(AdapterFactory.createSession('tailwind'), createMigrator).run(invocation),
    ).rejects.toBe(error);
  });
});

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
