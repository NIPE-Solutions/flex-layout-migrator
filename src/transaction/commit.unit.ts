import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { StagedArtifact } from './staging.unit';
import type { CommitArtifactView, CommitPort, OwnedFileView } from './transaction-unit.ports';
import {
  identity,
  required,
  sameArtifactState,
  sameIdentity,
  type ObservedPresentState,
} from './transaction-unit.state';

export interface CommittedArtifact extends StagedArtifact {
  readonly committed: true;
}

export interface CommitUnit {
  commit(staged: readonly StagedArtifact[], signal: AbortSignal): Promise<readonly CommittedArtifact[]>;
}

export class CommitUnitError extends Error {
  constructor(
    cause: unknown,
    readonly staged: readonly StagedArtifact[],
    readonly committed: readonly CommittedArtifact[],
  ) {
    super(cause instanceof Error ? cause.message : 'Migration transaction commit failed.', { cause });
    this.name = 'CommitUnitError';
    this.staged = Object.freeze([...staged]);
    this.committed = Object.freeze([...committed]);
  }
}

export class FileSystemCommitUnit implements CommitUnit {
  constructor(private readonly port: CommitPort) {}

  public async commit(staged: readonly StagedArtifact[], signal: AbortSignal): Promise<readonly CommittedArtifact[]> {
    const committed: CommittedArtifact[] = [];
    let items: readonly CommitArtifactView[];
    try {
      items = staged.map(entry => this.port.journal.artifact(entry.artifact));
    } catch (error: unknown) {
      throw new CommitUnitError(error, staged, committed);
    }
    for (const item of items) {
      try {
        this.port.assertNotInterrupted(signal);
        if (item.artifact.original.status === 'present') await this.captureOriginal(item, signal);
        this.port.assertNotInterrupted(signal);
        if (item.artifact.proposed.status === 'present') await this.installProposed(item);
        committed.push(committedArtifact(this.port.journal.artifact(item.artifact)));
      } catch (error: unknown) {
        const current = this.port.journal.artifact(item.artifact);
        if (transitionStarted(current) && !committed.some(candidate => candidate.artifact === item.artifact)) {
          committed.push(committedArtifact(current));
        }
        throw new CommitUnitError(error, currentStagedArtifacts(this.port.journal.artifacts()), committed);
      }
    }
    return Object.freeze(committed);
  }

  private async captureOriginal(item: CommitArtifactView, signal: AbortSignal): Promise<void> {
    const firstCapture = await this.port.observePublic(item);
    if (
      !sameArtifactState(firstCapture, item.artifact.original) ||
      firstCapture.status !== 'present' ||
      !item.originalIdentity ||
      !sameIdentity(firstCapture.identity, item.originalIdentity)
    ) {
      throw this.port.concurrentModification(item.artifact.path);
    }
    const backup = await this.port.createBackupFile(item, firstCapture.contents, signal, firstCapture.mode);
    if ((await this.port.readOwnedFile(item, backup.path)) !== firstCapture.contents) {
      throw this.port.ownershipFailure(item.artifact.path);
    }
    const secondCapture = await this.port.observePublic(item);
    if (
      secondCapture.status !== 'present' ||
      !sameIdentity(secondCapture.identity, firstCapture.identity) ||
      secondCapture.contents !== firstCapture.contents
    ) {
      throw this.port.concurrentModification(item.artifact.path);
    }
    await this.quarantineOriginal(item, firstCapture);
  }

  private async quarantineOriginal(item: CommitArtifactView, captured: ObservedPresentState): Promise<void> {
    await this.port.assertParentChain(item);
    await this.port.assertNamespace(item);
    const immediatelyBefore = await this.port.observePublic(item);
    if (
      immediatelyBefore.status !== 'present' ||
      !sameIdentity(immediatelyBefore.identity, captured.identity) ||
      immediatelyBefore.contents !== captured.contents
    ) {
      throw this.port.concurrentModification(item.artifact.path);
    }
    let quarantine = this.port.journal.addQuarantine(
      item,
      join(required(item.namespace).path, `quarantine-${randomUUID()}`),
    );
    await this.port.assertExpectedAbsent(quarantine.path, item.artifact.path);
    let renameFailure: unknown;
    try {
      await this.port.rename(item.artifact.path, quarantine.path);
    } catch (error: unknown) {
      renameFailure = error;
    }
    const quarantinedStat = await this.port.lstatOrAbsent(quarantine.path);
    if (quarantinedStat !== 'absent') {
      quarantine = this.port.journal.confirmOwnedFile(item, quarantine.path, identity(quarantinedStat));
      const quarantinedContents = await this.port.readOwnedFile(item, quarantine.path);
      if (
        !sameIdentity(required(quarantine.identity), captured.identity) ||
        quarantinedContents !== captured.contents
      ) {
        this.port.journal.setOwnedFilePreserved(item, quarantine.path, true);
        await this.restorePreservedQuarantine(item, quarantine);
        throw this.port.concurrentModification(item.artifact.path, renameFailure);
      }
      const destination = await this.port.lstatOrAbsent(item.artifact.path);
      if (renameFailure !== undefined) throw renameFailure;
      if (destination !== 'absent') throw this.port.concurrentModification(item.artifact.path);
      await this.port.assertParentChain(item);
      return;
    }
    const destination = await this.port.lstatOrAbsent(item.artifact.path);
    if (
      renameFailure !== undefined &&
      destination !== 'absent' &&
      sameIdentity(identity(destination), captured.identity)
    ) {
      throw renameFailure;
    }
    throw this.port.concurrentModification(item.artifact.path, renameFailure);
  }

  private async installProposed(item: CommitArtifactView): Promise<void> {
    const stage = required(item.stage);
    await this.port.assertOwnedIdentity(item, stage.path);
    await this.port.assertParentChain(item);
    await this.port.assertExpectedAbsent(item.artifact.path, item.artifact.path);
    let linkFailure: unknown;
    try {
      await this.port.link(stage.path, item.artifact.path);
    } catch (error: unknown) {
      linkFailure = error;
    }
    const destination = await this.port.lstatOrAbsent(item.artifact.path);
    if (destination !== 'absent' && stage.identity && sameIdentity(identity(destination), stage.identity)) {
      this.port.journal.recordInstalledIdentity(item, stage.identity);
      await this.port.assertParentChain(item);
      if (linkFailure !== undefined) throw linkFailure;
      return;
    }
    if (destination !== 'absent') throw this.port.concurrentModification(item.artifact.path, linkFailure);
    if (linkFailure !== undefined) throw linkFailure;
    throw this.port.ownershipFailure(item.artifact.path);
  }

  private async restorePreservedQuarantine(item: CommitArtifactView, quarantine: OwnedFileView): Promise<void> {
    const quarantineIdentity = required(quarantine.identity);
    if ((await this.port.lstatOrAbsent(item.artifact.path)) !== 'absent') return;
    try {
      await this.port.link(quarantine.path, item.artifact.path);
    } catch (error: unknown) {
      this.port.journal.recordRecoveryFailure(error);
    }
    const destination = await this.port.lstatOrAbsent(item.artifact.path);
    if (destination !== 'absent' && sameIdentity(identity(destination), quarantineIdentity)) {
      this.port.journal.setOwnedFilePreserved(item, quarantine.path, false);
    }
  }
}

function committedArtifact(item: CommitArtifactView): CommittedArtifact {
  return Object.freeze({
    artifact: item.artifact,
    committed: true,
    ...(item.stage === undefined ? {} : { stagingPath: item.stage.path }),
    ...(item.backup === undefined ? {} : { backupPath: item.backup.path }),
  });
}

function transitionStarted(item: CommitArtifactView): boolean {
  return item.installedIdentity !== undefined || item.quarantines.some(quarantine => quarantine.exists);
}

function currentStagedArtifacts(items: readonly CommitArtifactView[]): readonly StagedArtifact[] {
  return Object.freeze(
    items.map(item =>
      Object.freeze({
        artifact: item.artifact,
        ...(item.stage === undefined ? {} : { stagingPath: item.stage.path }),
        ...(item.backup === undefined ? {} : { backupPath: item.backup.path }),
      }),
    ),
  );
}
