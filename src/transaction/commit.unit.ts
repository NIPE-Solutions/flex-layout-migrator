import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { PlannedOutputArtifact } from '../migrator/migration-plan';
import type { StagedArtifact } from './staging.unit';
import type { CommitJournal, CommitPort } from './transaction-unit.ports';
import {
  identity,
  required,
  runtimeArtifact,
  sameArtifactState,
  sameIdentity,
  type ObservedPresentState,
  type OwnedFile,
  type RuntimeArtifact,
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
    let items: readonly RuntimeArtifact[];
    try {
      items = staged.map(entry => this.port.runtimeArtifact(entry.artifact));
    } catch (error: unknown) {
      throw new CommitUnitError(error, staged, committed);
    }
    for (const item of items) {
      try {
        this.port.assertNotInterrupted(signal);
        if (item.artifact.original.status === 'present') await this.captureOriginal(item, signal);
        this.port.assertNotInterrupted(signal);
        if (item.artifact.proposed.status === 'present') await this.installProposed(item);
        committed.push(committedArtifact(item));
      } catch (error: unknown) {
        if (transitionStarted(item) && !committed.some(candidate => candidate.artifact === item.artifact)) {
          committed.push(committedArtifact(item));
        }
        throw new CommitUnitError(error, currentStagedArtifacts(this.port.journal), committed);
      }
    }
    return Object.freeze(committed);
  }

  private async captureOriginal(item: RuntimeArtifact, signal: AbortSignal): Promise<void> {
    const firstCapture = await this.port.observePublic(item);
    if (
      !sameArtifactState(firstCapture, item.artifact.original) ||
      firstCapture.status !== 'present' ||
      !item.originalIdentity ||
      !sameIdentity(firstCapture.identity, item.originalIdentity)
    ) {
      throw this.port.concurrentModification(item.artifact.path);
    }
    item.backup = await this.port.createOwnedFile(item, 'backup', firstCapture.contents, signal, firstCapture.mode);
    if ((await this.port.readOwnedFile(item, item.backup)) !== firstCapture.contents) {
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

  private async quarantineOriginal(item: RuntimeArtifact, captured: ObservedPresentState): Promise<void> {
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
    const quarantine: OwnedFile = {
      path: join(required(item.namespace).path, `quarantine-${randomUUID()}`),
      publicPath: item.artifact.path,
      exists: false,
      preserve: false,
    };
    item.quarantines.push(quarantine);
    item.ownedFiles.push(quarantine);
    await this.port.assertExpectedAbsent(quarantine.path, item.artifact.path);
    let renameFailure: unknown;
    try {
      await this.port.rename(item.artifact.path, quarantine.path);
    } catch (error: unknown) {
      renameFailure = error;
    }
    const quarantinedStat = await this.port.lstatOrAbsent(quarantine.path);
    if (quarantinedStat !== 'absent') {
      quarantine.exists = true;
      quarantine.identity = identity(quarantinedStat);
      const quarantinedContents = await this.port.readOwnedFile(item, quarantine);
      if (!sameIdentity(quarantine.identity, captured.identity) || quarantinedContents !== captured.contents) {
        quarantine.preserve = true;
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

  private async installProposed(item: RuntimeArtifact): Promise<void> {
    const stage = required(item.stage);
    await this.port.assertOwnedIdentity(item, stage);
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
      item.installedIdentity = stage.identity;
      await this.port.assertParentChain(item);
      if (linkFailure !== undefined) throw linkFailure;
      return;
    }
    if (destination !== 'absent') throw this.port.concurrentModification(item.artifact.path, linkFailure);
    if (linkFailure !== undefined) throw linkFailure;
    throw this.port.ownershipFailure(item.artifact.path);
  }

  private async restorePreservedQuarantine(item: RuntimeArtifact, quarantine: OwnedFile): Promise<void> {
    const quarantineIdentity = required(quarantine.identity);
    if ((await this.port.lstatOrAbsent(item.artifact.path)) !== 'absent') return;
    try {
      await this.port.link(quarantine.path, item.artifact.path);
    } catch (error: unknown) {
      this.port.journal.recoveryFailures.push(error);
    }
    const destination = await this.port.lstatOrAbsent(item.artifact.path);
    if (destination !== 'absent' && sameIdentity(identity(destination), quarantineIdentity)) {
      quarantine.preserve = false;
    }
  }
}

function committedArtifact(item: RuntimeArtifact): CommittedArtifact {
  return Object.freeze({
    artifact: item.artifact,
    committed: true,
    ...(item.stage === undefined ? {} : { stagingPath: item.stage.path }),
    ...(item.backup === undefined ? {} : { backupPath: item.backup.path }),
  });
}

function transitionStarted(item: RuntimeArtifact): boolean {
  return item.installedIdentity !== undefined || item.quarantines.some(quarantine => quarantine.exists);
}

export function committedArtifacts(
  context: CommitJournal,
  artifacts: readonly PlannedOutputArtifact[] = context.items.map(item => item.artifact),
): readonly CommittedArtifact[] {
  return Object.freeze(artifacts.map(artifact => committedArtifact(runtimeArtifact(context, artifact))));
}

function currentStagedArtifacts(context: CommitJournal): readonly StagedArtifact[] {
  return Object.freeze(
    context.items.map(item =>
      Object.freeze({
        artifact: item.artifact,
        ...(item.stage === undefined ? {} : { stagingPath: item.stage.path }),
        ...(item.backup === undefined ? {} : { backupPath: item.backup.path }),
      }),
    ),
  );
}
