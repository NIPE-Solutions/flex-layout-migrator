import { Migrator } from '../migrator/migrator';
import type { MigrationExecutionContext, MigrationOptions } from '../migrator/migrator';
import type { MigrationReport } from '../report/migration-report';
import { AnalyzeProjectStage } from './analyze/analyze-project.stage';
import { DiscoverProjectStage } from './discover/discover-project.stage';
import { remapInvocationErrorPaths } from './invocation-error-path.mapper';
import type { AnalyzeStage, DiscoverStage, RenderStage } from './migration-pipeline';
import type { MigrationInvocation } from './project-manifest';
import type { RenderedProject } from './rendered-project';

export interface MigrationRunner {
  run(invocation: MigrationInvocation): Promise<MigrationReport>;
}

export interface RenderedMigrationContinuation {
  migrate(options?: MigrationOptions, execution?: MigrationExecutionContext): Promise<MigrationReport>;
}

export type MigratorFactory = (rendered: RenderedProject) => RenderedMigrationContinuation;

const defaultMigratorFactory: MigratorFactory = rendered => new Migrator(rendered);

export class CurrentMigrationPipeline implements MigrationRunner {
  constructor(
    private readonly render: RenderStage,
    private readonly discover: DiscoverStage = new DiscoverProjectStage(),
    private readonly analyze: AnalyzeStage = new AnalyzeProjectStage(),
    private readonly createMigrator: MigratorFactory = defaultMigratorFactory,
    private readonly now: () => number = Date.now,
  ) {}

  public async run(invocation: MigrationInvocation): Promise<MigrationReport> {
    const startedAt = this.now();
    const manifest = await withInvocationPathCompatibility(() => this.discover.run(invocation), invocation);
    const analyzed = await withInvocationPathCompatibility(() => this.analyze.run(manifest), invocation);
    const rendered = await withInvocationPathCompatibility(() => this.render.run(analyzed), invocation);
    return this.createMigrator(rendered).migrate(invocation.options, {
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
