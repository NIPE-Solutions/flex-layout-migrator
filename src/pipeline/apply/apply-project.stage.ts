import { assertConfigurationUnchanged } from '../../config/migration-config';
import { pathsOverlapOnFileSystem } from '../../migrator/migration-path.validator';
import type { MigrationMode } from '../../migrator/migration-mode';
import { MigrationApplicationError } from '../../migrator/migration-application.error';
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
    const manifestMode = validated.rendered.analyzed.manifest.invocation.options.mode;
    if (this.mode !== manifestMode) {
      throw new MigrationApplicationError(
        'internal-invariant',
        `Apply stage mode "${this.mode}" differs from validated manifest mode "${manifestMode}".`,
      );
    }
    const plan = validated.plan;
    const snapshots = validated.rendered.analyzed.manifest.invocation.options.configurationSnapshots ?? [];
    await assertConfigurationUnchanged(snapshots);
    for (const artifact of plan.artifacts)
      for (const snapshot of snapshots) {
        if (await pathsOverlapOnFileSystem(artifact.path, snapshot.path))
          throw new Error(`Migration output collides with target configuration: ${artifact.path}`);
      }
    const hasParseError = plan.files.some(file => file.results.some(result => result.status === 'parse-error'));
    if (this.mode === 'plan') {
      if (!hasParseError) await this.transaction.preflight(plan);
      return appliedProject({ validated, application: { status: 'skipped', reason: 'plan-only' } });
    }
    if (hasParseError) {
      return appliedProject({ validated, application: { status: 'skipped', reason: 'parse-errors' } });
    }

    await this.transaction.preflight(plan);
    await assertConfigurationUnchanged(snapshots);
    if (plan.artifacts.length > 0) await this.transaction.apply(plan);
    return appliedProject({ validated, application: { status: 'applied' } });
  }
}
