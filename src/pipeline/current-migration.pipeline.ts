import type { ConversionAdapterSession } from '../adapter/conversion-adapter.session';
import { Migrator } from '../migrator/migrator';
import type { MigrationReport } from '../report/migration-report';
import { AnalyzeProjectStage } from './analyze/analyze-project.stage';
import type { AnalyzedProject } from './analyzed-project';
import { DiscoverProjectStage } from './discover/discover-project.stage';
import { remapInvocationErrorPaths } from './invocation-error-path.mapper';
import type { AnalyzeStage, DiscoverStage } from './migration-pipeline';
import type { MigrationInvocation } from './project-manifest';

export interface MigrationRunner {
  run(invocation: MigrationInvocation): Promise<MigrationReport>;
}

export type MigratorFactory = (
  session: ConversionAdapterSession,
  analyzed: AnalyzedProject,
) => Pick<Migrator, 'migrate'>;

const defaultMigratorFactory: MigratorFactory = (session, analyzed) => new Migrator(session, analyzed);

export class CurrentMigrationPipeline implements MigrationRunner {
  constructor(
    private readonly session: ConversionAdapterSession,
    private readonly discover: DiscoverStage = new DiscoverProjectStage(),
    private readonly analyze: AnalyzeStage = new AnalyzeProjectStage(),
    private readonly createMigrator: MigratorFactory = defaultMigratorFactory,
    private readonly now: () => number = Date.now,
  ) {}

  public async run(invocation: MigrationInvocation): Promise<MigrationReport> {
    const startedAt = this.now();
    const manifest = await withInvocationPathCompatibility(() => this.discover.run(invocation), invocation);
    const analyzed = await withInvocationPathCompatibility(() => this.analyze.run(manifest), invocation);
    return this.createMigrator(this.session, analyzed).migrate(invocation.options, {
      mapDestinationReadError: error => remapInvocationErrorPaths(error, invocation),
      now: this.now,
      startedAt,
    });
  }
}

async function withInvocationPathCompatibility<T>(
  action: () => Promise<T>,
  invocation: MigrationInvocation,
): Promise<T> {
  try {
    return await action();
  } catch (error: unknown) {
    throw remapInvocationErrorPaths(error, invocation);
  }
}
