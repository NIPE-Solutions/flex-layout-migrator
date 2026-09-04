import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { CommittedArtifact } from './commit.unit';
import type { RollbackPort } from './transaction-unit.ports';
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
  type OwnedFile,
  type RecoveryOutcome,
  type RuntimeArtifact,
} from './transaction-unit.state';

export interface RollbackUnit {
  rollback(committed: readonly CommittedArtifact[]): Promise<readonly string[]>;
}

export class FileSystemRollbackUnit implements RollbackUnit {
  constructor(private readonly port: RollbackPort) {}

  public async rollback(committed: readonly CommittedArtifact[]): Promise<readonly string[]> {
    let items: readonly RuntimeArtifact[];
    try {
      items = committed.map(entry => this.port.runtimeArtifact(entry.artifact));
    } catch (error: unknown) {
      throw recoveryUnitError(error);
    }
    const failures = [...this.port.journal.recoveryFailures];
    for (const item of items) await this.restoreOriginal(item, failures);
    const paths = new Set<string>();
    for (const item of this.port.journal.items) {
      const restored = await this.verifyOriginal(item, failures);
      this.port.journal.restored.set(item, restored);
      if (!restored) paths.add(item.artifact.path);
    }
    return recoveryResult(recoveryOutcome(paths, failures));
  }

  private async restoreOriginal(item: RuntimeArtifact, failures: unknown[]): Promise<void> {
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
      if ((await this.port.readOwnedFile(item, backup)) !== item.artifact.original.contents) return;
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
      quarantine.exists = true;
      quarantine.identity = identity(quarantined);
      quarantine.preserve = true;
      if (!sameIdentity(quarantine.identity, current.identity)) {
        await this.restorePreservedQuarantine(item, quarantine, failures);
        return false;
      }
      if ((await this.port.readOwnedFile(item, quarantine)) !== current.contents) {
        await this.restorePreservedQuarantine(item, quarantine, failures);
        return false;
      }
      quarantine.preserve = false;
      return (await this.port.lstatOrAbsent(item.artifact.path)) === 'absent';
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
    if ((await this.port.lstatOrAbsent(item.artifact.path)) !== 'absent') return;
    try {
      await this.port.link(quarantine.path, item.artifact.path);
    } catch (error: unknown) {
      failures.push(error);
    }
    const destination = await this.port.lstatOrAbsent(item.artifact.path);
    if (destination !== 'absent' && sameIdentity(identity(destination), quarantineIdentity)) {
      quarantine.preserve = false;
    }
  }

  private async verifyOriginal(item: RuntimeArtifact, failures: unknown[]): Promise<boolean> {
    try {
      return this.isConfirmedOriginal(item, await this.port.observePublic(item));
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
