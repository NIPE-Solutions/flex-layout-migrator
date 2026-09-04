import type { ValidatedProjectPlan } from '../pipeline/validated-project-plan';
import type { MigrationApplication, MigrationReport } from '../report/migration-report';
import { MigrationReportBuilder } from '../report/migration-report.builder';
import { MigrationTransaction } from '../transaction/migration-transaction';
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

export type MigrationTransactionPort = Pick<MigrationTransaction, 'preflight' | 'apply'>;

export class Migrator {
  constructor(
    private readonly validated: ValidatedProjectPlan,
    private readonly now: () => number = Date.now,
    private readonly transaction: MigrationTransactionPort = new MigrationTransaction(),
  ) {}

  public async migrate(
    options: MigrationOptions = { mode: 'plan' },
    execution: MigrationExecutionContext = {},
  ): Promise<MigrationReport> {
    const now = execution.now ?? this.now;
    const startedAt = execution.startedAt ?? now();
    const plan = this.validated.plan;
    const hasParseError = plan.files.some(file => file.results.some(result => result.status === 'parse-error'));
    let application: MigrationApplication;
    if (options.mode === 'plan') {
      if (!hasParseError) await this.transaction.preflight(plan);
      application = { status: 'skipped', reason: 'plan-only' };
    } else if (hasParseError) {
      application = { status: 'skipped', reason: 'parse-errors' };
    } else {
      await this.transaction.preflight(plan);
      if (plan.artifacts.length > 0) await this.transaction.apply(plan);
      application = { status: 'applied' };
    }

    return new MigrationReportBuilder().build(
      this.validated.rendered.analyzed.manifest.invocation.inputPath,
      this.validated.rendered.analyzed.manifest.invocation.outputPath,
      plan.target,
      options.mode,
      application,
      now() - startedAt,
      plan.files,
      this.validated.stylesheet,
    );
  }
}
