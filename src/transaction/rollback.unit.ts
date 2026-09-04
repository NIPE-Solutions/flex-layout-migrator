import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { CommittedArtifact } from './commit.unit';
import {
  RecoveryUnitError,
  TransactionUnitSession,
  identity,
  recoveryOutcome,
  recoveryUnitError,
  required,
  runtimeArtifact,
  sameArtifactState,
  sameIdentity,
  type ObservedPresentState,
  type ObservedState,
  type OwnedFile,
  type RecoveryOutcome,
  type RuntimeArtifact,
  type TransactionUnitContext,
} from './transaction-unit.session';

export interface RollbackUnit {
  rollback(committed: readonly CommittedArtifact[]): Promise<readonly string[]>;
}

export class FileSystemRollbackUnit implements RollbackUnit {
  private readonly context: TransactionUnitContext;

  constructor(
    private readonly session: TransactionUnitSession,
    context: TransactionUnitContext = session.context,
  ) {
    this.context = context;
  }

  public async rollback(committed: readonly CommittedArtifact[]): Promise<readonly string[]> {
    let items: readonly RuntimeArtifact[];
    try {
      items = committed.map(entry => runtimeArtifact(this.context, entry.artifact));
    } catch (error: unknown) {
      throw recoveryUnitError(error);
    }
    const failures = [...this.context.recoveryFailures];
    for (const item of items) await this.restoreOriginal(item, failures);
    const paths = new Set<string>();
    for (const item of this.context.items) {
      const restored = await this.verifyOriginal(item, failures);
      this.context.restored.set(item, restored);
      if (!restored) paths.add(item.artifact.path);
    }
    return recoveryResult(recoveryOutcome(paths, failures));
  }

  private async restoreOriginal(item: RuntimeArtifact, failures: unknown[]): Promise<void> {
    let current: ObservedState | 'unknown';
    try {
      current = await this.session.observePublic(item, this.context);
    } catch (error: unknown) {
      failures.push(error);
      current = 'unknown';
    }
    if (current !== 'unknown' && this.isConfirmedOriginal(item, current)) return;
    if (current !== 'unknown' && current.status === 'present') {
      if (
        !item.installedIdentity ||
        !sameIdentity(current.identity, item.installedIdentity) ||
        item.artifact.proposed.status !== 'present' ||
        current.contents !== item.artifact.proposed.contents
      ) {
        if (item.stage && item.installedIdentity && sameIdentity(current.identity, item.installedIdentity)) {
          item.stage.preserve = true;
        }
        return;
      }
      if (!(await this.recoveryQuarantine(item, current, failures))) return;
    } else if (current === 'unknown') {
      return;
    }
    if (item.artifact.original.status === 'absent') return;
    const backup = item.backup;
    if (!backup) return;
    try {
      if ((await this.session.readOwnedFile(item, backup)) !== item.artifact.original.contents) return;
      await this.session.assertParentChain(item, this.context);
      await this.session.assertExpectedAbsent(item.artifact.path, item.artifact.path);
      try {
        await this.session.operations.link(backup.path, item.artifact.path);
      } catch (error: unknown) {
        failures.push(error);
      }
      const restored = await this.session.lstatOrAbsent(item.artifact.path);
      if (
        restored !== 'absent' &&
        !restored.isSymbolicLink() &&
        restored.isFile() &&
        backup.identity &&
        sameIdentity(identity(restored), backup.identity)
      ) {
        item.restoredIdentity = backup.identity;
      }
    } catch (error: unknown) {
      failures.push(error);
    }
  }

  private async recoveryQuarantine(
    item: RuntimeArtifact,
    current: ObservedPresentState,
    failures: unknown[],
  ): Promise<boolean> {
    const quarantine: OwnedFile = {
      path: join(required(item.namespace).path, `quarantine-rollback-${randomUUID()}`),
      publicPath: item.artifact.path,
      exists: false,
      preserve: false,
    };
    item.quarantines.push(quarantine);
    item.ownedFiles.push(quarantine);
    try {
      await this.session.assertParentChain(item, this.context);
      await this.session.assertNamespace(item);
      const before = await this.session.observePublic(item, this.context);
      if (
        before.status !== 'present' ||
        !sameIdentity(before.identity, current.identity) ||
        before.contents !== current.contents
      ) {
        return false;
      }
      await this.session.assertExpectedAbsent(quarantine.path, item.artifact.path);
      try {
        await this.session.operations.rename(item.artifact.path, quarantine.path);
      } catch (error: unknown) {
        failures.push(error);
      }
      const quarantined = await this.session.lstatOrAbsent(quarantine.path);
      if (quarantined === 'absent') return false;
      quarantine.exists = true;
      quarantine.identity = identity(quarantined);
      quarantine.preserve = true;
      if (!sameIdentity(quarantine.identity, current.identity)) {
        await this.restorePreservedQuarantine(item, quarantine, failures);
        return false;
      }
      if ((await this.session.readOwnedFile(item, quarantine)) !== current.contents) {
        await this.restorePreservedQuarantine(item, quarantine, failures);
        return false;
      }
      quarantine.preserve = false;
      return (await this.session.lstatOrAbsent(item.artifact.path)) === 'absent';
    } catch (error: unknown) {
      failures.push(error);
      return false;
    }
  }

  private async restorePreservedQuarantine(
    item: RuntimeArtifact,
    quarantine: OwnedFile,
    failures: unknown[],
  ): Promise<void> {
    const quarantineIdentity = required(quarantine.identity);
    if ((await this.session.lstatOrAbsent(item.artifact.path)) !== 'absent') return;
    try {
      await this.session.operations.link(quarantine.path, item.artifact.path);
    } catch (error: unknown) {
      failures.push(error);
    }
    const destination = await this.session.lstatOrAbsent(item.artifact.path);
    if (destination !== 'absent' && sameIdentity(identity(destination), quarantineIdentity)) {
      quarantine.preserve = false;
    }
  }

  private async verifyOriginal(item: RuntimeArtifact, failures: unknown[]): Promise<boolean> {
    try {
      return this.isConfirmedOriginal(item, await this.session.observePublic(item, this.context));
    } catch (error: unknown) {
      failures.push(error);
      return false;
    }
  }

  private isConfirmedOriginal(item: RuntimeArtifact, observed: ObservedState): boolean {
    if (!sameArtifactState(observed, item.artifact.original)) return false;
    if (observed.status === 'absent') return true;
    return [item.originalIdentity, item.restoredIdentity].some(
      expected => expected !== undefined && sameIdentity(observed.identity, expected),
    );
  }
}

function recoveryResult(outcome: RecoveryOutcome): readonly string[] {
  if (outcome.failures.length > 0) throw new RecoveryUnitError(outcome.paths, outcome.failures);
  return outcome.paths;
}
