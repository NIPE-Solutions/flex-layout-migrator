import type { StagedArtifact } from './staging.unit';
import type { CleanupArtifactView, CleanupPort, OwnedFileView } from './transaction-unit.ports';
import {
  RecoveryUnitError,
  identity,
  isDirectoryNotEmpty,
  isEnoent,
  pathDepth,
  recoveryOutcome,
  recoveryUnitError,
  sameArtifactState,
  sameIdentity,
  type MigrationTransactionStat,
  type ObservedState,
  type RecoveryOutcome,
} from './transaction-unit.state';
import { compareCodeUnits } from '../util/compare-code-units';

export { RecoveryUnitError } from './transaction-unit.state';

export interface CleanupUnit {
  cleanup(staged: readonly StagedArtifact[]): Promise<readonly string[]>;
}

export type CleanupKind = 'committed' | 'recovery';

export class FileSystemCleanupUnit implements CleanupUnit {
  constructor(
    private readonly port: CleanupPort,
    private readonly kind: CleanupKind,
  ) {}

  public async cleanup(staged: readonly StagedArtifact[]): Promise<readonly string[]> {
    const failures: unknown[] = [];
    const paths = new Set<string>();
    let stagedItems: CleanupArtifactView[];
    try {
      stagedItems = staged.map(entry => this.port.journal.artifact(entry.artifact));
    } catch (error: unknown) {
      throw recoveryUnitError(error);
    }
    const items = this.kind === 'recovery' ? stagedItems.reverse() : stagedItems;
    for (const item of items) {
      await this.port.closeReadHandles(item, failures);
      await this.port.closeOpenHandle(item, failures);
      const ownedFiles = this.kind === 'recovery' ? [...item.ownedFiles].reverse() : item.ownedFiles;
      for (const owned of ownedFiles) {
        if (this.kind === 'recovery' && owned.path === item.backupPath && this.port.journal.restored(item) === false) {
          if (owned.exists) paths.add(item.artifact.path);
          continue;
        }
        await this.removeOwnedFile(item, owned, paths, failures);
      }
      await this.removeNamespace(item, paths, failures);
      this.port.journal.finishArtifactCleanup();
    }
    await this.removeCreatedDirectories(paths, failures);
    await this.collectUnconfirmedPaths(paths, failures);
    if (this.kind === 'recovery') {
      for (const item of this.port.journal.artifacts()) {
        if (!(await this.verifyOriginal(item, failures))) paths.add(item.artifact.path);
      }
    }
    return recoveryResult(recoveryOutcome(paths, failures));
  }

  private async removeOwnedFile(
    item: CleanupArtifactView,
    owned: OwnedFileView | undefined,
    paths: Set<string>,
    failures: unknown[],
  ): Promise<void> {
    if (!owned?.exists) return;
    if (owned.preserve || !owned.identity) {
      paths.add(owned.publicPath);
      return;
    }
    try {
      await this.port.assertNamespace(item);
      const before = await this.port.lstat(owned.path);
      if (!sameIdentity(identity(before), owned.identity) || before.isSymbolicLink() || !before.isFile()) {
        paths.add(owned.publicPath);
        failures.push(new Error('Invocation-owned file identity could not be confirmed.'));
        return;
      }
    } catch (error: unknown) {
      if (isEnoent(error)) {
        this.port.journal.markOwnedFileAbsent(item, owned.path);
        return;
      }
      paths.add(owned.publicPath);
      failures.push(error);
      return;
    }
    try {
      await this.port.unlink(owned.path);
    } catch (error: unknown) {
      if (!isEnoent(error)) failures.push(error);
    }
    try {
      await this.port.lstat(owned.path);
      paths.add(owned.publicPath);
    } catch (error: unknown) {
      if (isEnoent(error)) this.port.journal.markOwnedFileAbsent(item, owned.path);
      else {
        paths.add(owned.publicPath);
        failures.push(error);
      }
    }
  }

  private async removeNamespace(item: CleanupArtifactView, paths: Set<string>, failures: unknown[]): Promise<void> {
    const namespace = item.namespace;
    if (!namespace?.exists) return;
    if (!namespace.identity) {
      paths.add(namespace.publicPath);
      return;
    }
    try {
      const namespaceStat = await this.port.lstat(namespace.path);
      if (
        !sameIdentity(identity(namespaceStat), namespace.identity) ||
        namespaceStat.isSymbolicLink() ||
        !namespaceStat.isDirectory()
      ) {
        paths.add(namespace.publicPath);
        failures.push(new Error('Invocation namespace identity could not be confirmed.'));
        return;
      }
    } catch (error: unknown) {
      if (isEnoent(error)) {
        this.port.journal.markNamespaceAbsent(item);
        return;
      }
      paths.add(namespace.publicPath);
      failures.push(error);
      return;
    }
    try {
      await this.port.rmdir(namespace.path);
    } catch (error: unknown) {
      if (!isDirectoryNotEmpty(error) && !isEnoent(error)) failures.push(error);
    }
    try {
      await this.port.lstat(namespace.path);
      paths.add(namespace.publicPath);
    } catch (error: unknown) {
      if (isEnoent(error)) this.port.journal.markNamespaceAbsent(item);
      else {
        paths.add(namespace.publicPath);
        failures.push(error);
      }
    }
  }

  private async removeCreatedDirectories(paths: Set<string>, failures: unknown[]): Promise<void> {
    const directories = [...this.port.journal.createdDirectories()].sort(
      (left, right) => pathDepth(right.path) - pathDepth(left.path) || compareCodeUnits(right.path, left.path),
    );
    for (const directory of directories) {
      if (!directory.exists) continue;
      if (
        this.kind === 'committed' &&
        this.port.journal
          .artifacts()
          .some(
            item =>
              item.artifact.proposed.status === 'present' &&
              item.directories.some(expectation => expectation.path === directory.path),
          )
      ) {
        continue;
      }
      if (!directory.identity) {
        for (const publicPath of directory.publicPaths) paths.add(publicPath);
        continue;
      }
      let before: MigrationTransactionStat;
      try {
        before = await this.port.lstat(directory.path);
      } catch (error: unknown) {
        if (isEnoent(error)) {
          this.port.journal.markCreatedDirectoryAbsent(directory.path);
          continue;
        }
        for (const publicPath of directory.publicPaths) paths.add(publicPath);
        failures.push(error);
        continue;
      }
      if (!sameIdentity(identity(before), directory.identity) || before.isSymbolicLink() || !before.isDirectory()) {
        for (const publicPath of directory.publicPaths) paths.add(publicPath);
        continue;
      }
      let removalFailure: unknown;
      try {
        await this.port.rmdir(directory.path);
      } catch (error: unknown) {
        removalFailure = error;
      }
      let after: MigrationTransactionStat | 'absent';
      try {
        after = await this.port.lstatOrAbsent(directory.path);
      } catch (error: unknown) {
        for (const publicPath of directory.publicPaths) paths.add(publicPath);
        if (removalFailure !== undefined && !isEnoent(removalFailure)) failures.push(removalFailure);
        failures.push(error);
        continue;
      }
      if (after === 'absent') {
        this.port.journal.markCreatedDirectoryAbsent(directory.path);
        if (removalFailure !== undefined && !isEnoent(removalFailure)) failures.push(removalFailure);
        continue;
      }
      for (const publicPath of directory.publicPaths) paths.add(publicPath);
      if (removalFailure !== undefined && !isEnoent(removalFailure)) failures.push(removalFailure);
    }
  }

  private async collectUnconfirmedPaths(paths: Set<string>, failures: unknown[]): Promise<void> {
    for (const { path: candidate, publicPaths } of this.port.journal.unconfirmedEntries()) {
      try {
        await this.port.lstat(candidate);
      } catch (error: unknown) {
        if (isEnoent(error)) continue;
        failures.push(error);
      }
      for (const publicPath of publicPaths) paths.add(publicPath);
    }
  }

  private async verifyOriginal(item: CleanupArtifactView, failures: unknown[]): Promise<boolean> {
    try {
      return this.isConfirmedOriginal(item, await this.port.observePublic(item));
    } catch (error: unknown) {
      failures.push(error);
      return false;
    }
  }

  private isConfirmedOriginal(item: CleanupArtifactView, observed: ObservedState): boolean {
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
