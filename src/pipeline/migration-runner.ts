import type { MigrationReport } from '../report/migration-report';
import { MigrationReportBuilder } from '../report/migration-report.builder';
import type { AppliedProject } from './applied-project';
import { remapInvocationErrorPaths } from './invocation-error-path.mapper';
import type { MigrationPipeline } from './migration-pipeline';
import { PipelineStageError } from './pipeline-stage.error';
import type { MigrationInvocation } from './project-manifest';

export type MigrationExecutionPipeline = Pick<MigrationPipeline, 'run'>;

type ReportBuilder = Pick<MigrationReportBuilder, 'build'>;

export class MigrationRunner {
  constructor(
    private readonly pipeline: MigrationExecutionPipeline,
    private readonly reports: ReportBuilder = new MigrationReportBuilder(),
    private readonly now: () => number = Date.now,
  ) {}

  public async run(invocation: MigrationInvocation): Promise<MigrationReport> {
    const startedAt = this.now();
    const applied = await this.execute(invocation);
    const durationMs = this.now() - startedAt;
    const { validated, application } = applied;
    const { plan, rendered, stylesheet } = validated;

    return this.reports.build(
      rendered.analyzed.manifest.invocation.inputPath,
      rendered.analyzed.manifest.invocation.outputPath,
      plan.target,
      rendered.analyzed.manifest.invocation.options.mode,
      application,
      durationMs,
      plan.files,
      stylesheet,
    );
  }

  private async execute(invocation: MigrationInvocation): Promise<AppliedProject> {
    try {
      return await this.pipeline.run(invocation);
    } catch (error: unknown) {
      if (!(error instanceof PipelineStageError)) throw error;
      if (error.stage === 'apply') throw error.cause;
      throw remapInvocationErrorPaths(error.cause, invocation);
    }
  }
}
