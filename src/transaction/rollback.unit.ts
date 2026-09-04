import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { CommittedArtifact } from './commit.unit';
import type { OwnedFileView, RollbackArtifactView, RollbackPort } from './transaction-unit.ports';
import {
  RecoveryUnitError,
  identity,
  recoveryOutcome,
  recoveryUnitError,
  required,
  sameArtifactState,
  sameIdentity,
  type ObservedPresentState,
  type ObservedState,
  type RecoveryOutcome,
} from './transaction-unit.state';

export interface RollbackUnit {
  rollback(committed: readonly CommittedArtifact[]): Promise<readonly string[]>;
}

export class FileSystemRollbackUnit implements RollbackUnit {
  constructor(private readonly port: RollbackPort) {}

  public async rollback(committed: readonly CommittedArtifact[]): Promise<readonly string[]> {
    let items: readonly RollbackArtifactView[];
    try {
      items = committed.map(entry => this.port.journal.artifact(entry.artifact));
    } catch (error: unknown) {
      throw recoveryUnitError(error);
    }
    const failures = [...this.port.journal.recoveryFailures()];
    for (const item of items) await this.restoreOriginal(item, failures);
    const paths = new Set<string>();
    for (const item of this.port.journal.artifacts()) {
      const restored = await this.verifyOriginal(item, failures);
      this.port.journal.recordRestored(item, restored);
      if (!restored) paths.add(item.artifact.path);
    }
    return recoveryResult(recoveryOutcome(paths, failures));
  }

  private async restoreOriginal(item: RollbackArtifactView, failures: unknown[]): Promise<void> {
    let current: ObservedState | 'unknown';
    try {
      current = await this.port.observePublic(item);
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
          this.port.journal.setOwnedFilePreserved(item, item.stage.path, true);
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
      if ((await this.port.readOwnedFile(item, backup.path)) !== item.artifact.original.contents) return;
      await this.port.assertParentChain(item);
      await this.port.assertExpectedAbsent(item.artifact.path, item.artifact.path);
      try {
        await this.port.link(backup.path, item.artifact.path);
      } catch (error: unknown) {
        failures.push(error);
      }
      const restored = await this.port.lstatOrAbsent(item.artifact.path);
      if (
        restored !== 'absent' &&
        !restored.isSymbolicLink() &&
        restored.isFile() &&
        backup.identity &&
        sameIdentity(identity(restored), backup.identity)
      ) {
        this.port.journal.recordRestoredIdentity(item, backup.identity);
      }
    } catch (error: unknown) {
      failures.push(error);
    }
  }

  private async recoveryQuarantine(
    item: RollbackArtifactView,
    current: ObservedPresentState,
    failures: unknown[],
  ): Promise<boolean> {
    let quarantine = this.port.journal.addQuarantine(
      item,
      join(required(item.namespace).path, `quarantine-rollback-${randomUUID()}`),
    );
    try {
      await this.port.assertParentChain(item);
      await this.port.assertNamespace(item);
      const before = await this.port.observePublic(item);
      if (
        before.status !== 'present' ||
        !sameIdentity(before.identity, current.identity) ||
        before.contents !== current.contents
      ) {
        return false;
      }
      await this.port.assertExpectedAbsent(quarantine.path, item.artifact.path);
      try {
        await this.port.rename(item.artifact.path, quarantine.path);
      } catch (error: unknown) {
        failures.push(error);
      }
      const quarantined = await this.port.lstatOrAbsent(quarantine.path);
      if (quarantined === 'absent') return false;
      quarantine = this.port.journal.confirmOwnedFile(item, quarantine.path, identity(quarantined));
      this.port.journal.setOwnedFilePreserved(item, quarantine.path, true);
      if (!sameIdentity(required(quarantine.identity), current.identity)) {
        await this.restorePreservedQuarantine(item, quarantine, failures);
        return false;
      }
      if ((await this.port.readOwnedFile(item, quarantine.path)) !== current.contents) {
        await this.restorePreservedQuarantine(item, quarantine, failures);
        return false;
      }
      this.port.journal.setOwnedFilePreserved(item, quarantine.path, false);
      return (await this.port.lstatOrAbsent(item.artifact.path)) === 'absent';
    } catch (error: unknown) {
      failures.push(error);
      return false;
    }
  }

  private async restorePreservedQuarantine(
    item: RollbackArtifactView,
    quarantine: OwnedFileView,
    failures: unknown[],
  ): Promise<void> {
    const quarantineIdentity = required(quarantine.identity);
    if ((await this.port.lstatOrAbsent(item.artifact.path)) !== 'absent') return;
    try {
      await this.port.link(quarantine.path, item.artifact.path);
    } catch (error: unknown) {
      failures.push(error);
    }
    const destination = await this.port.lstatOrAbsent(item.artifact.path);
    if (destination !== 'absent' && sameIdentity(identity(destination), quarantineIdentity)) {
      this.port.journal.setOwnedFilePreserved(item, quarantine.path, false);
    }
  }

  private async verifyOriginal(item: RollbackArtifactView, failures: unknown[]): Promise<boolean> {
    try {
      return this.isConfirmedOriginal(item, await this.port.observePublic(item));
    } catch (error: unknown) {
      failures.push(error);
      return false;
    }
  }

  private isConfirmedOriginal(item: RollbackArtifactView, observed: ObservedState): boolean {
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
