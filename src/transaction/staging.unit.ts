import { randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import type { PlannedOutputArtifact } from '../migrator/migration-plan';
import type { StagingJournal, StagingPort } from './transaction-unit.ports';
import { identity, required, type CreatedDirectory, type RuntimeArtifact } from './transaction-unit.state';

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
      await this.port.prepare(artifacts);
      for (const item of this.port.journal.items) await this.ensureParentDirectories(item, signal);
      for (const item of this.port.journal.items) await this.createNamespace(item);
      for (const item of this.port.journal.items) {
        if (item.artifact.proposed.status === 'absent') continue;
        this.port.assertNotInterrupted(signal);
        item.stage = await this.port.createOwnedFile(
          item,
          'stage',
          item.artifact.proposed.contents,
          signal,
          item.originalMode,
        );
        const staged = await this.port.readOwnedFile(item, item.stage);
        if (item.artifact.kind === 'template') this.port.validateStagedTemplate(item.artifact.path, staged);
      }
      return stagedArtifacts(this.port.journal);
    } catch (error: unknown) {
      throw new StagingUnitError(error, stagedArtifacts(this.port.journal));
    }
  }

  private async ensureParentDirectories(item: RuntimeArtifact, signal: AbortSignal): Promise<void> {
    for (let index = 0; index < item.directories.length; index++) {
      this.port.assertNotInterrupted(signal);
      const expectation = item.directories[index];
      if (!expectation) continue;
      if (expectation.original !== 'absent') {
        await this.port.assertDirectoryExpectation(expectation.path, expectation.original, item.artifact.path);
        continue;
      }
      const existingCreation = this.port.journal.createdDirectories.get(expectation.path);
      if (existingCreation) {
        existingCreation.publicPaths.add(item.artifact.path);
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
        trackUnconfirmedEntry(this.port.journal, expectation.path, item.artifact.path);
        throw error;
      }
      const created: CreatedDirectory = {
        path: expectation.path,
        publicPaths: new Set([item.artifact.path]),
        exists: true,
      };
      this.port.journal.createdDirectories.set(expectation.path, created);
      this.port.journal.ownershipChanged();
      const createdStat = await this.port.lstat(expectation.path);
      if (createdStat.isSymbolicLink() || !createdStat.isDirectory()) {
        throw this.port.concurrentModification(item.artifact.path);
      }
      created.identity = identity(createdStat);
      if (parentExpectation) await this.port.assertExpectedDirectory(parentExpectation, item);
    }
    await this.port.assertParentChain(item);
  }

  private async createNamespace(item: RuntimeArtifact): Promise<void> {
    await this.port.assertParentChain(item);
    const namespacePath = join(dirname(item.artifact.path), `.${basename(item.artifact.path)}.${randomUUID()}.txn`);
    await this.port.assertExpectedAbsent(namespacePath, item.artifact.path);
    try {
      await this.port.mkdir(namespacePath, { mode: 0o700 });
    } catch (error: unknown) {
      trackUnconfirmedEntry(this.port.journal, namespacePath, item.artifact.path);
      throw error;
    }
    item.namespace = { path: namespacePath, publicPath: item.artifact.path, exists: true };
    this.port.journal.ownershipChanged();
    const namespaceStat = await this.port.lstat(namespacePath);
    if (namespaceStat.isSymbolicLink() || !namespaceStat.isDirectory()) {
      throw this.port.concurrentModification(item.artifact.path);
    }
    item.namespace.identity = identity(namespaceStat);
    await this.port.assertParentChain(item);
  }
}

export function stagedArtifacts(context: Pick<StagingJournal, 'items'>): readonly StagedArtifact[] {
  return Object.freeze(context.items.map(item => stagedArtifact(item)));
}

export function stagedArtifact(item: RuntimeArtifact): StagedArtifact {
  return Object.freeze({
    artifact: item.artifact,
    ...(item.stage === undefined ? {} : { stagingPath: item.stage.path }),
    ...(item.backup === undefined ? {} : { backupPath: item.backup.path }),
  });
}

function trackUnconfirmedEntry(context: StagingJournal, path: string, publicPath: string): void {
  const publicPaths = context.unconfirmedEntries.get(path) ?? new Set<string>();
  publicPaths.add(publicPath);
  context.unconfirmedEntries.set(path, publicPaths);
}
