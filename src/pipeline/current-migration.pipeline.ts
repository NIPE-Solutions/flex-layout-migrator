import { Migrator } from '../migrator/migrator';
import type { MigrationExecutionContext, MigrationOptions } from '../migrator/migrator';
import type { MigrationReport } from '../report/migration-report';
import { AnalyzeProjectStage } from './analyze/analyze-project.stage';
import { ApplyProjectStage } from './apply/apply-project.stage';
import type { AppliedProject } from './applied-project';
import { DiscoverProjectStage } from './discover/discover-project.stage';
import { remapInvocationErrorPaths } from './invocation-error-path.mapper';
import type { AnalyzeStage, ApplyStage, DiscoverStage, RenderStage, ValidateStage } from './migration-pipeline';
import type { MigrationInvocation } from './project-manifest';
import { ValidateProjectStage } from './validate/validate-project.stage';

export interface MigrationRunner {
  run(invocation: MigrationInvocation): Promise<MigrationReport>;
}

export interface ValidatedMigrationContinuation {
  migrate(options?: MigrationOptions, execution?: MigrationExecutionContext): Promise<MigrationReport>;
}

export type MigratorFactory = (applied: AppliedProject) => ValidatedMigrationContinuation;
export type ApplyStageFactory = (mode: MigrationOptions['mode']) => ApplyStage;

const defaultMigratorFactory: MigratorFactory = applied => new Migrator(applied);
const defaultApplyStageFactory: ApplyStageFactory = mode => new ApplyProjectStage(mode);

export class CurrentMigrationPipeline implements MigrationRunner {
  constructor(
    private readonly render: RenderStage,
    private readonly discover: DiscoverStage = new DiscoverProjectStage(),
    private readonly analyze: AnalyzeStage = new AnalyzeProjectStage(),
    private readonly createMigrator: MigratorFactory = defaultMigratorFactory,
    private readonly now: () => number = Date.now,
    private readonly validate: ValidateStage = new ValidateProjectStage(),
    private readonly createApply: ApplyStageFactory = defaultApplyStageFactory,
  ) {}

  public async run(invocation: MigrationInvocation): Promise<MigrationReport> {
    const startedAt = this.now();
    const manifest = await withInvocationPathCompatibility(() => this.discover.run(invocation), invocation);
    const analyzed = await withInvocationPathCompatibility(() => this.analyze.run(manifest), invocation);
    const rendered = await withInvocationPathCompatibility(() => this.render.run(analyzed), invocation);
    const validated = await withInvocationPathCompatibility(() => this.validate.run(rendered), invocation);
    const applied = await withInvocationPathCompatibility(
      () => this.createApply(invocation.options.mode).run(validated),
      invocation,
    );
    return this.createMigrator(applied).migrate(invocation.options, {
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
