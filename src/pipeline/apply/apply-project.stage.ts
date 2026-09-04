import type { MigrationMode } from '../../migrator/migration-mode';
import { MigrationTransaction } from '../../transaction/migration-transaction';
import { appliedProject, type AppliedProject } from '../applied-project';
import type { ApplyStage } from '../migration-pipeline';
import type { ValidatedProjectPlan } from '../validated-project-plan';

export type MigrationTransactionPort = Pick<MigrationTransaction, 'preflight' | 'apply'>;

export class ApplyProjectStage implements ApplyStage {
  constructor(
    private readonly mode: MigrationMode,
    private readonly transaction: MigrationTransactionPort = new MigrationTransaction(),
  ) {}

  public async run(validated: ValidatedProjectPlan): Promise<AppliedProject> {
    const plan = validated.plan;
    const hasParseError = plan.files.some(file => file.results.some(result => result.status === 'parse-error'));
    if (this.mode === 'plan') {
      if (!hasParseError) await this.transaction.preflight(plan);
      return appliedProject({ validated, application: { status: 'skipped', reason: 'plan-only' } });
    }
    if (hasParseError) {
      return appliedProject({ validated, application: { status: 'skipped', reason: 'parse-errors' } });
    }

    await this.transaction.preflight(plan);
    if (plan.artifacts.length > 0) await this.transaction.apply(plan);
    return appliedProject({ validated, application: { status: 'applied' } });
  }
}
