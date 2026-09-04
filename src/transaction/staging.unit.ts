import { randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import type { PlannedOutputArtifact } from '../migrator/migration-plan';
import type { StagingArtifactView, StagingPort } from './transaction-unit.ports';
import { identity, required } from './transaction-unit.state';

export interface StagedArtifact {
  readonly artifact: PlannedOutputArtifact;
  readonly stagingPath?: string;
  readonly backupPath?: string;
}

export interface StagingUnit {
  stage(artifacts: readonly PlannedOutputArtifact[], signal: AbortSignal): Promise<readonly StagedArtifact[]>;
}

export class StagingUnitError extends Error {
  constructor(
    cause: unknown,
    readonly staged: readonly StagedArtifact[],
  ) {
    super(cause instanceof Error ? cause.message : 'Migration transaction staging failed.', { cause });
    this.name = 'StagingUnitError';
    this.staged = Object.freeze([...staged]);
  }
}

export class FileSystemStagingUnit implements StagingUnit {
  constructor(private readonly port: StagingPort) {}

  public async stage(
    artifacts: readonly PlannedOutputArtifact[],
    signal: AbortSignal,
  ): Promise<readonly StagedArtifact[]> {
    try {
      await this.port.journal.prepare(artifacts);
      const items = this.port.journal.artifacts();
      for (const item of items) await this.ensureParentDirectories(item, signal);
      for (const item of items) await this.createNamespace(item);
      for (const item of items) {
        if (item.artifact.proposed.status === 'absent') continue;
        this.port.assertNotInterrupted(signal);
        const stage = await this.port.createStageFile(item, item.artifact.proposed.contents, signal, item.originalMode);
        const staged = await this.port.readOwnedFile(item, stage.path);
        if (item.artifact.kind === 'template') this.port.validateStagedTemplate(item.artifact.path, staged);
      }
      return stagedArtifacts(this.port.journal.artifacts());
    } catch (error: unknown) {
      throw new StagingUnitError(error, stagedArtifacts(this.port.journal.artifacts()));
    }
  }

  private async ensureParentDirectories(item: StagingArtifactView, signal: AbortSignal): Promise<void> {
    for (let index = 0; index < item.directories.length; index++) {
      this.port.assertNotInterrupted(signal);
      const expectation = item.directories[index];
      if (!expectation) continue;
      if (expectation.original !== 'absent') {
        await this.port.assertDirectoryExpectation(expectation.path, expectation.original, item.artifact.path);
        continue;
      }
      const existingCreation = this.port.journal.createdDirectory(expectation.path);
      if (existingCreation) {
        this.port.journal.addCreatedDirectoryPublicPath(expectation.path, item.artifact.path);
        await this.port.assertDirectoryIdentity(
          expectation.path,
          required(existingCreation.identity),
          item.artifact.path,
        );
        continue;
      }
      await this.port.assertExpectedAbsent(expectation.path, item.artifact.path);
      const parentExpectation = item.directories[index - 1];
      if (parentExpectation) await this.port.assertExpectedDirectory(parentExpectation, item);
      try {
        await this.port.mkdir(expectation.path, { mode: 0o755 });
      } catch (error: unknown) {
        this.port.journal.recordUnconfirmedEntry(expectation.path, item.artifact.path);
        throw error;
      }
      this.port.journal.recordCreatedDirectory(expectation.path, item.artifact.path);
      const createdStat = await this.port.lstat(expectation.path);
      if (createdStat.isSymbolicLink() || !createdStat.isDirectory()) {
        throw this.port.concurrentModification(item.artifact.path);
      }
      this.port.journal.confirmCreatedDirectory(expectation.path, identity(createdStat));
      if (parentExpectation) await this.port.assertExpectedDirectory(parentExpectation, item);
    }
    await this.port.assertParentChain(item);
  }

  private async createNamespace(item: StagingArtifactView): Promise<void> {
    await this.port.assertParentChain(item);
    const namespacePath = join(dirname(item.artifact.path), `.${basename(item.artifact.path)}.${randomUUID()}.txn`);
    await this.port.assertExpectedAbsent(namespacePath, item.artifact.path);
    try {
      await this.port.mkdir(namespacePath, { mode: 0o700 });
    } catch (error: unknown) {
      this.port.journal.recordUnconfirmedEntry(namespacePath, item.artifact.path);
      throw error;
    }
    this.port.journal.recordNamespace(item, namespacePath);
    const namespaceStat = await this.port.lstat(namespacePath);
    if (namespaceStat.isSymbolicLink() || !namespaceStat.isDirectory()) {
      throw this.port.concurrentModification(item.artifact.path);
    }
    this.port.journal.confirmNamespace(item, identity(namespaceStat));
    await this.port.assertParentChain(item);
  }
}

function stagedArtifacts(items: readonly StagingArtifactView[]): readonly StagedArtifact[] {
  return Object.freeze(items.map(item => stagedArtifact(item)));
}

function stagedArtifact(item: StagingArtifactView): StagedArtifact {
  return Object.freeze({
    artifact: item.artifact,
    ...(item.stagingPath === undefined ? {} : { stagingPath: item.stagingPath }),
  });
}
