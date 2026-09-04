import { MigrationApplicationError, type MigrationApplicationErrorCode } from '../migrator/migration-application.error';
import type { MigrationPlan } from '../migrator/migration-plan';
import { AngularTemplateParser } from '../template/angular-template.parser';
import { compareCodeUnits } from '../util/compare-code-units';
import { FileSystemCleanupUnit } from './cleanup.unit';
import { CommitUnitError, FileSystemCommitUnit, type CommittedArtifact } from './commit.unit';
import { FileSystemRollbackUnit } from './rollback.unit';
import { FileSystemStagingUnit, StagingUnitError, type StagedArtifact } from './staging.unit';
import { TransactionSignalRegistrar, type TransactionSignalRegistrarLike } from './transaction-signal.registrar';
import {
  RecoveryUnitError,
  TransactionUnitSession,
  nodeTransactionOperations,
  type MigrationTransactionFileHandle,
  type MigrationTransactionOperations,
  type MigrationTransactionStat,
  type RecoveryOutcome,
} from './transaction-unit.session';

export type { MigrationTransactionFileHandle, MigrationTransactionOperations, MigrationTransactionStat };

interface PreflightSeal {
  readonly plan: MigrationPlan;
  readonly contents: string;
}

class TransactionInterruptedError extends Error {
  constructor(readonly signal: NodeJS.Signals) {
    super(`Migration transaction interrupted by ${signal}.`);
    this.name = 'TransactionInterruptedError';
  }
}

export class MigrationTransaction {
  private interruptedBy: NodeJS.Signals | undefined;
  private unregisterSignals: (() => void) | undefined;
  private preflightSeal: PreflightSeal | undefined;
  private activePreflight: symbol | undefined;
  private applying = false;

  constructor(
    private readonly operations: MigrationTransactionOperations = nodeTransactionOperations,
    private readonly signalRegistrar: TransactionSignalRegistrarLike = new TransactionSignalRegistrar(),
    private readonly parser: AngularTemplateParser = new AngularTemplateParser(),
  ) {}

  public async preflight(plan: MigrationPlan): Promise<void> {
    if (this.applying) throw this.invalidTransition('preflight', plan);
    if (this.activePreflight !== undefined) {
      throw new MigrationApplicationError(
        'internal-invariant',
        'Migration transaction cannot preflight while another preflight is active.',
        sortedUnique(plan.artifacts.map(artifact => artifact.path)),
      );
    }
    const owner = Symbol('preflight');
    this.activePreflight = owner;
    this.preflightSeal = undefined;
    try {
      this.rejectParseErrors(plan);
      const session = new TransactionUnitSession(this.operations, this.parser);
      await session.prepareForPreflight(plan.artifacts);
      if (this.activePreflight !== owner) throw this.invalidTransition('preflight', plan);
      this.preflightSeal = { plan, contents: planContents(plan) };
    } finally {
      if (this.activePreflight === owner) this.activePreflight = undefined;
    }
  }

  public async apply(plan: MigrationPlan): Promise<void> {
    this.assertPreflightSeal(plan);
    this.preflightSeal = undefined;
    if (plan.artifacts.length === 0) return;
    if (this.applying) throw this.invalidTransition('apply', plan);

    this.applying = true;
    this.interruptedBy = undefined;
    const controller = new AbortController();
    const session = new TransactionUnitSession(this.operations, this.parser, () => {
      this.syncSignalScope(session, controller);
    });
    const stagingUnit = new FileSystemStagingUnit(session.stagingPort());
    const commitUnit = new FileSystemCommitUnit(session.commitPort());
    const rollbackUnit = new FileSystemRollbackUnit(session.rollbackPort());

    let staged: readonly StagedArtifact[] = [];
    try {
      staged = await stagingUnit.stage(plan.artifacts, controller.signal);
    } catch (error: unknown) {
      const stagingError = error instanceof StagingUnitError ? error : undefined;
      staged = stagingError?.staged ?? staged;
      const recovery = await this.runCleanup(session, staged, 'recovery');
      this.finishApplication();
      throw this.decorateFailure(stagingError?.cause ?? error, recovery);
    }

    let committed: readonly CommittedArtifact[] = [];
    try {
      committed = await commitUnit.commit(staged, controller.signal);
      this.assertNotInterrupted(controller.signal);
    } catch (error: unknown) {
      const commitError = error instanceof CommitUnitError ? error : undefined;
      staged = commitError?.staged ?? staged;
      committed = commitError?.committed ?? committed;
      const rollback = await this.runRollback(rollbackUnit, [...committed].reverse());
      const cleanup = await this.runCleanup(session, staged, 'recovery');
      this.finishApplication();
      throw this.decorateFailure(commitError?.cause ?? error, mergeRecovery(rollback, cleanup));
    }

    const finalization = await this.runCleanup(session, staged, 'committed');
    this.finishApplication();
    if (finalization.paths.length > 0 || finalization.failures.length > 0) {
      const cause = finalization.failures[0] ?? new Error('Transaction cleanup could not be confirmed.');
      throw new MigrationApplicationError(
        this.interruptedBy ? 'transaction-interrupted' : 'transaction-io',
        this.interruptedBy
          ? 'Migration transaction was interrupted during cleanup.'
          : 'Migration committed, but cleanup was incomplete.',
        finalization.paths,
        { cause, recoveryFailures: finalization.failures.slice(1) },
      );
    }
    if (this.interruptedBy) {
      throw new MigrationApplicationError('transaction-interrupted', 'Migration transaction was interrupted.', [], {
        cause: new TransactionInterruptedError(this.interruptedBy),
      });
    }
  }

  private rejectParseErrors(plan: MigrationPlan): void {
    const paths = plan.files
      .flatMap(file => file.results.filter(result => result.status === 'parse-error').map(result => result.fileName))
      .filter((path, index, all) => all.indexOf(path) === index)
      .sort(compareCodeUnits);
    if (paths.length === 0) return;
    throw new MigrationApplicationError(
      'internal-invariant',
      'A migration plan with template parse errors cannot be applied.',
      paths,
    );
  }

  private assertPreflightSeal(plan: MigrationPlan): void {
    const seal = this.preflightSeal;
    if (seal?.plan === plan && seal.contents === planContents(plan)) return;
    throw this.invalidTransition('apply', plan);
  }

  private invalidTransition(action: 'preflight' | 'apply', plan: MigrationPlan): MigrationApplicationError {
    return new MigrationApplicationError(
      'internal-invariant',
      action === 'apply'
        ? 'Migration transaction apply requires the exact plan that passed preflight.'
        : 'Migration transaction cannot preflight while application is active.',
      sortedUnique(plan.artifacts.map(artifact => artifact.path)),
    );
  }

  private async runRollback(
    rollbackUnit: FileSystemRollbackUnit,
    committed: readonly CommittedArtifact[],
  ): Promise<RecoveryOutcome> {
    try {
      return { paths: await rollbackUnit.rollback(committed), failures: [] };
    } catch (error: unknown) {
      if (error instanceof RecoveryUnitError) return { paths: error.paths, failures: error.failures };
      return { paths: [], failures: [error] };
    }
  }

  private async runCleanup(
    session: TransactionUnitSession,
    staged: readonly StagedArtifact[],
    kind: 'committed' | 'recovery',
  ): Promise<RecoveryOutcome> {
    try {
      return { paths: await new FileSystemCleanupUnit(session.cleanupPort(), kind).cleanup(staged), failures: [] };
    } catch (error: unknown) {
      if (error instanceof RecoveryUnitError) return { paths: error.paths, failures: error.failures };
      return { paths: [], failures: [error] };
    }
  }

  private decorateFailure(error: unknown, recovery: RecoveryOutcome): MigrationApplicationError {
    const interrupted = this.interruptedBy !== undefined || error instanceof TransactionInterruptedError;
    const applicationError = error instanceof MigrationApplicationError ? error : undefined;
    const code: MigrationApplicationErrorCode = interrupted
      ? 'transaction-interrupted'
      : (applicationError?.code ?? 'transaction-io');
    const validationPaths =
      applicationError && applicationError.code !== 'transaction-io' ? applicationError.paths : [];
    const paths = sortedUnique([...validationPaths, ...recovery.paths]);
    const cause = applicationError?.cause ?? error;
    const recoveryFailures = [...(applicationError?.recoveryFailures ?? []), ...recovery.failures];
    return new MigrationApplicationError(
      code,
      interrupted
        ? 'Migration transaction was interrupted.'
        : (applicationError?.message ?? 'Migration transaction failed.'),
      paths,
      { cause, recoveryFailures },
    );
  }

  private syncSignalScope(session: TransactionUnitSession, controller: AbortController): void {
    const hasOwnedArtifacts = session.hasOwnedArtifacts();
    if (hasOwnedArtifacts && !this.unregisterSignals) {
      this.unregisterSignals = this.signalRegistrar.register(signal => {
        this.interruptedBy ??= signal;
        if (!controller.signal.aborted) controller.abort(new TransactionInterruptedError(signal));
      });
    } else if (!hasOwnedArtifacts) {
      this.unregisterSignalHandlers();
    }
  }

  private finishApplication(): void {
    this.unregisterSignalHandlers();
    this.applying = false;
  }

  private unregisterSignalHandlers(): void {
    this.unregisterSignals?.();
    this.unregisterSignals = undefined;
  }

  private assertNotInterrupted(signal: AbortSignal): void {
    if (!signal.aborted) return;
    throw signal.reason instanceof Error ? signal.reason : new Error('Migration transaction interrupted.');
  }
}

function planContents(plan: MigrationPlan): string {
  return JSON.stringify(plan);
}

function mergeRecovery(...outcomes: readonly RecoveryOutcome[]): RecoveryOutcome {
  return {
    paths: sortedUnique(outcomes.flatMap(outcome => outcome.paths)),
    failures: Object.freeze(outcomes.flatMap(outcome => outcome.failures)),
  };
}

function sortedUnique(paths: Iterable<string>): readonly string[] {
  return [...new Set(paths)].sort(compareCodeUnits);
}
