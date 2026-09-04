import type { AppliedProject } from '../pipeline/applied-project';
import type { MigrationReport } from '../report/migration-report';
import { MigrationReportBuilder } from '../report/migration-report.builder';
import type { MigrationMode } from './migration-mode';

export interface MigrationOptions {
  readonly mode: MigrationMode;
  readonly responsiveImages?: boolean;
  readonly stylesheetPath?: string;
  readonly reportPath?: string;
}

export interface MigrationExecutionContext {
  readonly mapDestinationReadError?: (error: unknown) => unknown;
  readonly now?: () => number;
  readonly startedAt?: number;
}

export class Migrator {
  constructor(
    private readonly applied: AppliedProject,
    private readonly now: () => number = Date.now,
  ) {}

  public async migrate(
    options: MigrationOptions = { mode: 'plan' },
    execution: MigrationExecutionContext = {},
  ): Promise<MigrationReport> {
    const now = execution.now ?? this.now;
    const startedAt = execution.startedAt ?? now();
    const { validated, application } = this.applied;
    const plan = validated.plan;

    return new MigrationReportBuilder().build(
      validated.rendered.analyzed.manifest.invocation.inputPath,
      validated.rendered.analyzed.manifest.invocation.outputPath,
      plan.target,
      options.mode,
      application,
      now() - startedAt,
      plan.files,
      validated.stylesheet,
    );
  }
}
