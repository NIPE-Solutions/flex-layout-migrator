import { randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import type { PlannedOutputArtifact } from '../migrator/migration-plan';
import {
  TransactionUnitSession,
  identity,
  required,
  type CreatedDirectory,
  type RuntimeArtifact,
  type TransactionUnitContext,
} from './transaction-unit.session';

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
  private readonly context: TransactionUnitContext;

  constructor(
    private readonly session: TransactionUnitSession,
    context: TransactionUnitContext = session.context,
  ) {
    this.context = context;
  }

  public async stage(
    artifacts: readonly PlannedOutputArtifact[],
    signal: AbortSignal,
  ): Promise<readonly StagedArtifact[]> {
    try {
      await this.session.prepare(this.context, artifacts);
      for (const item of this.context.items) await this.ensureParentDirectories(item, signal);
      for (const item of this.context.items) await this.createNamespace(item);
      for (const item of this.context.items) {
        if (item.artifact.proposed.status === 'absent') continue;
        this.session.assertNotInterrupted(signal);
        item.stage = await this.session.createOwnedFile(
          item,
          'stage',
          item.artifact.proposed.contents,
          this.context,
          signal,
        );
        const staged = await this.session.readOwnedFile(item, item.stage);
        if (item.artifact.kind === 'template') this.session.validateStagedTemplate(item.artifact.path, staged);
      }
      return stagedArtifacts(this.context);
    } catch (error: unknown) {
      throw new StagingUnitError(error, stagedArtifacts(this.context));
    }
  }

  private async ensureParentDirectories(item: RuntimeArtifact, signal: AbortSignal): Promise<void> {
    for (let index = 0; index < item.directories.length; index++) {
      this.session.assertNotInterrupted(signal);
      const expectation = item.directories[index];
      if (!expectation) continue;
      if (expectation.original !== 'absent') {
        await this.session.assertDirectoryExpectation(expectation.path, expectation.original, item.artifact.path);
        continue;
      }
      const existingCreation = this.context.createdDirectories.get(expectation.path);
      if (existingCreation) {
        existingCreation.publicPaths.add(item.artifact.path);
        await this.session.assertDirectoryIdentity(
          expectation.path,
          required(existingCreation.identity),
          item.artifact.path,
        );
        continue;
      }
      await this.session.assertExpectedAbsent(expectation.path, item.artifact.path);
      const parentExpectation = item.directories[index - 1];
      if (parentExpectation) await this.session.assertExpectedDirectory(parentExpectation, item, this.context);
      try {
        await this.session.operations.mkdir(expectation.path, { mode: 0o755 });
      } catch (error: unknown) {
        trackUnconfirmedEntry(this.context, expectation.path, item.artifact.path);
        throw error;
      }
      const created: CreatedDirectory = {
        path: expectation.path,
        publicPaths: new Set([item.artifact.path]),
        exists: true,
      };
      this.context.createdDirectories.set(expectation.path, created);
      this.context.ownershipChanged();
      const createdStat = await this.session.operations.lstat(expectation.path);
      if (createdStat.isSymbolicLink() || !createdStat.isDirectory()) {
        throw this.session.concurrentModification(item.artifact.path);
      }
      created.identity = identity(createdStat);
      if (parentExpectation) await this.session.assertExpectedDirectory(parentExpectation, item, this.context);
    }
    await this.session.assertParentChain(item, this.context);
  }

  private async createNamespace(item: RuntimeArtifact): Promise<void> {
    await this.session.assertParentChain(item, this.context);
    const namespacePath = join(dirname(item.artifact.path), `.${basename(item.artifact.path)}.${randomUUID()}.txn`);
    await this.session.assertExpectedAbsent(namespacePath, item.artifact.path);
    try {
      await this.session.operations.mkdir(namespacePath, { mode: 0o700 });
    } catch (error: unknown) {
      trackUnconfirmedEntry(this.context, namespacePath, item.artifact.path);
      throw error;
    }
    item.namespace = { path: namespacePath, publicPath: item.artifact.path, exists: true };
    this.context.ownershipChanged();
    const namespaceStat = await this.session.operations.lstat(namespacePath);
    if (namespaceStat.isSymbolicLink() || !namespaceStat.isDirectory()) {
      throw this.session.concurrentModification(item.artifact.path);
    }
    item.namespace.identity = identity(namespaceStat);
    await this.session.assertParentChain(item, this.context);
  }
}

export function stagedArtifacts(context: TransactionUnitContext): readonly StagedArtifact[] {
  return Object.freeze(context.items.map(item => stagedArtifact(item)));
}

export function stagedArtifact(item: RuntimeArtifact): StagedArtifact {
  return Object.freeze({
    artifact: item.artifact,
    ...(item.stage === undefined ? {} : { stagingPath: item.stage.path }),
    ...(item.backup === undefined ? {} : { backupPath: item.backup.path }),
  });
}

function trackUnconfirmedEntry(context: TransactionUnitContext, path: string, publicPath: string): void {
  const publicPaths = context.unconfirmedEntries.get(path) ?? new Set<string>();
  publicPaths.add(publicPath);
  context.unconfirmedEntries.set(path, publicPaths);
}
