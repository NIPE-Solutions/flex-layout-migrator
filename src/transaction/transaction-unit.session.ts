import { constants } from 'node:fs';
import { access, link, lstat, mkdir, open, rename, rmdir, stat, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { MigrationApplicationError } from '../migrator/migration-application.error';
import type { PlannedOutputArtifact } from '../migrator/migration-plan';
import { AngularTemplateParser } from '../template/angular-template.parser';
import { compareCodeUnits } from '../util/compare-code-units';
import type {
  CleanupArtifactView,
  CleanupJournal,
  CleanupPort,
  CommitArtifactView,
  CommitJournal,
  CommitPort,
  CreatedDirectoryView,
  OwnedFileView,
  RollbackArtifactView,
  RollbackJournal,
  RollbackPort,
  StagingArtifactView,
  StagingJournal,
  StagingPort,
  UnconfirmedEntryView,
} from './transaction-unit.ports';
import {
  fileMode,
  identity,
  isEnoent,
  required,
  runtimeArtifact,
  sameArtifactState,
  sameIdentity,
  type CreatedDirectory,
  type DirectoryExpectation,
  type FileIdentity,
  type MigrationTransactionFileHandle,
  type MigrationTransactionOperations,
  type MigrationTransactionStat,
  type ObservedState,
  type OwnedFile,
  type OwnedNamespace,
  type RuntimeArtifact,
  type TransactionUnitContext,
} from './transaction-unit.state';

export {
  RecoveryUnitError,
  fileMode,
  identity,
  isDirectoryNotEmpty,
  isEnoent,
  pathDepth,
  recoveryOutcome,
  recoveryUnitError,
  required,
  runtimeArtifact,
  sameArtifactState,
  sameIdentity,
  sortedUnique,
} from './transaction-unit.state';
export type {
  CreatedDirectory,
  DirectoryExpectation,
  FileIdentity,
  MigrationTransactionFileHandle,
  MigrationTransactionOperations,
  MigrationTransactionStat,
  ObservedPresentState,
  ObservedState,
  OwnedFile,
  OwnedNamespace,
  RecoveryOutcome,
  RuntimeArtifact,
  TransactionUnitContext,
} from './transaction-unit.state';

export const nodeTransactionOperations: MigrationTransactionOperations = {
  access,
  link,
  lstat,
  mkdir,
  open: (target, flags) => open(target, flags),
  rename,
  rmdir,
  stat,
  unlink,
};

export class TransactionUnitSession {
  private readonly context: TransactionUnitContext;

  constructor(
    private readonly operations: MigrationTransactionOperations = nodeTransactionOperations,
    private readonly parser: AngularTemplateParser = new AngularTemplateParser(),
    ownershipChanged: () => void = () => undefined,
  ) {
    this.context = {
      items: [],
      createdDirectories: new Map(),
      unconfirmedEntries: new Map(),
      recoveryFailures: [],
      restored: new Map(),
      ownershipChanged,
    };
  }

  public stagingPort(): StagingPort {
    const journal: StagingJournal = Object.freeze({
      prepare: (artifacts: readonly PlannedOutputArtifact[]) => this.prepare(artifacts),
      artifacts: () => Object.freeze(this.context.items.map(stagingArtifactView)),
      createdDirectory: (path: string) => createdDirectoryView(this.context.createdDirectories.get(path)),
      addCreatedDirectoryPublicPath: (path: string, publicPath: string) =>
        required(this.context.createdDirectories.get(path)).publicPaths.add(publicPath),
      recordUnconfirmedEntry: (path: string, publicPath: string) => this.recordUnconfirmedEntry(path, publicPath),
      recordCreatedDirectory: (path: string, publicPath: string) => this.recordCreatedDirectory(path, publicPath),
      confirmCreatedDirectory: (path: string, expected: FileIdentity) => {
        required(this.context.createdDirectories.get(path)).identity = expected;
      },
      recordNamespace: (item: StagingArtifactView, path: string) => this.recordNamespace(item.artifact, path),
      confirmNamespace: (item: StagingArtifactView, expected: FileIdentity) => {
        required(this.runtimeArtifact(item.artifact).namespace).identity = expected;
      },
    });
    return Object.freeze({
      journal,
      assertDirectoryExpectation: (
        path: string,
        expected: Exclude<DirectoryExpectation['original'], 'absent'>,
        publicPath: string,
      ) => this.assertDirectoryExpectation(path, expected, publicPath),
      assertDirectoryIdentity: (path: string, expected: FileIdentity, publicPath: string) =>
        this.assertDirectoryIdentity(path, expected, publicPath),
      assertExpectedAbsent: (path: string, publicPath: string) => this.assertExpectedAbsent(path, publicPath),
      assertExpectedDirectory: (expectation: DirectoryExpectation, item: StagingArtifactView) =>
        this.assertExpectedDirectory(expectation, this.runtimeArtifact(item.artifact), this.context),
      assertNotInterrupted: (signal: AbortSignal) => this.assertNotInterrupted(signal),
      assertParentChain: (item: StagingArtifactView) =>
        this.assertParentChain(this.runtimeArtifact(item.artifact), this.context),
      concurrentModification: (publicPath: string, cause?: unknown) => this.concurrentModification(publicPath, cause),
      createStageFile: (item: StagingArtifactView, contents: string, signal: AbortSignal, mode?: number) =>
        this.createStageFile(this.runtimeArtifact(item.artifact), contents, signal, mode),
      lstat: (path: string) => this.operations.lstat(path),
      mkdir: (path: string, options?: { readonly recursive?: boolean; readonly mode?: number }) =>
        this.operations.mkdir(path, options),
      readOwnedFile: (item: StagingArtifactView, ownedPath: string) => {
        const runtime = this.runtimeArtifact(item.artifact);
        return this.readOwnedFile(runtime, this.ownedFile(runtime, ownedPath));
      },
      validateStagedTemplate: (publicPath: string, contents: string) =>
        this.validateStagedTemplate(publicPath, contents),
    });
  }

  public commitPort(): CommitPort {
    const journal: CommitJournal = Object.freeze({
      artifact: (artifact: PlannedOutputArtifact) => commitArtifactView(this.runtimeArtifact(artifact)),
      artifacts: () => Object.freeze(this.context.items.map(commitArtifactView)),
      addQuarantine: (item: CommitArtifactView, path: string) =>
        ownedFileView(this.addQuarantine(this.runtimeArtifact(item.artifact), path)),
      confirmOwnedFile: (item: CommitArtifactView, ownedPath: string, expected: FileIdentity) =>
        ownedFileView(this.confirmOwnedFile(this.runtimeArtifact(item.artifact), ownedPath, expected)),
      setOwnedFilePreserved: (item: CommitArtifactView, ownedPath: string, preserve: boolean) => {
        this.ownedFile(this.runtimeArtifact(item.artifact), ownedPath).preserve = preserve;
      },
      recordInstalledIdentity: (item: CommitArtifactView, expected: FileIdentity) => {
        this.runtimeArtifact(item.artifact).installedIdentity = expected;
      },
      recordRecoveryFailure: (error: unknown) => this.context.recoveryFailures.push(error),
    });
    return Object.freeze({
      journal,
      assertExpectedAbsent: (path: string, publicPath: string) => this.assertExpectedAbsent(path, publicPath),
      assertNamespace: (item: CommitArtifactView) => this.assertNamespace(this.runtimeArtifact(item.artifact)),
      assertNotInterrupted: (signal: AbortSignal) => this.assertNotInterrupted(signal),
      assertOwnedIdentity: (item: CommitArtifactView, ownedPath: string) => {
        const runtime = this.runtimeArtifact(item.artifact);
        return this.assertOwnedIdentity(runtime, this.ownedFile(runtime, ownedPath));
      },
      assertParentChain: (item: CommitArtifactView) =>
        this.assertParentChain(this.runtimeArtifact(item.artifact), this.context),
      concurrentModification: (publicPath: string, cause?: unknown) => this.concurrentModification(publicPath, cause),
      createBackupFile: (item: CommitArtifactView, contents: string, signal: AbortSignal, mode?: number) =>
        this.createBackupFile(this.runtimeArtifact(item.artifact), contents, signal, mode),
      link: (existingPath: string, newPath: string) => this.operations.link(existingPath, newPath),
      lstatOrAbsent: (path: string) => this.lstatOrAbsent(path),
      observePublic: (item: CommitArtifactView) =>
        this.observePublic(this.runtimeArtifact(item.artifact), this.context),
      ownershipFailure: (publicPath: string) => this.ownershipFailure(publicPath),
      readOwnedFile: (item: CommitArtifactView, ownedPath: string) => {
        const runtime = this.runtimeArtifact(item.artifact);
        return this.readOwnedFile(runtime, this.ownedFile(runtime, ownedPath));
      },
      rename: (source: string, destination: string) => this.operations.rename(source, destination),
    });
  }

  public rollbackPort(): RollbackPort {
    const journal: RollbackJournal = Object.freeze({
      artifact: (artifact: PlannedOutputArtifact) => rollbackArtifactView(this.runtimeArtifact(artifact)),
      artifacts: () => Object.freeze(this.context.items.map(rollbackArtifactView)),
      recoveryFailures: () => Object.freeze([...this.context.recoveryFailures]),
      addQuarantine: (item: RollbackArtifactView, path: string) =>
        ownedFileView(this.addQuarantine(this.runtimeArtifact(item.artifact), path)),
      confirmOwnedFile: (item: RollbackArtifactView, ownedPath: string, expected: FileIdentity) =>
        ownedFileView(this.confirmOwnedFile(this.runtimeArtifact(item.artifact), ownedPath, expected)),
      setOwnedFilePreserved: (item: RollbackArtifactView, ownedPath: string, preserve: boolean) => {
        this.ownedFile(this.runtimeArtifact(item.artifact), ownedPath).preserve = preserve;
      },
      recordRestoredIdentity: (item: RollbackArtifactView, expected: FileIdentity) => {
        this.runtimeArtifact(item.artifact).restoredIdentity = expected;
      },
      recordRestored: (item: RollbackArtifactView, restored: boolean) => {
        this.context.restored.set(this.runtimeArtifact(item.artifact), restored);
      },
    });
    return Object.freeze({
      journal,
      assertExpectedAbsent: (path: string, publicPath: string) => this.assertExpectedAbsent(path, publicPath),
      assertNamespace: (item: RollbackArtifactView) => this.assertNamespace(this.runtimeArtifact(item.artifact)),
      assertParentChain: (item: RollbackArtifactView) =>
        this.assertParentChain(this.runtimeArtifact(item.artifact), this.context),
      link: (existingPath: string, newPath: string) => this.operations.link(existingPath, newPath),
      lstatOrAbsent: (path: string) => this.lstatOrAbsent(path),
      observePublic: (item: RollbackArtifactView) =>
        this.observePublic(this.runtimeArtifact(item.artifact), this.context),
      readOwnedFile: (item: RollbackArtifactView, ownedPath: string) => {
        const runtime = this.runtimeArtifact(item.artifact);
        return this.readOwnedFile(runtime, this.ownedFile(runtime, ownedPath));
      },
      rename: (source: string, destination: string) => this.operations.rename(source, destination),
    });
  }

  public cleanupPort(): CleanupPort {
    const journal: CleanupJournal = Object.freeze({
      artifact: (artifact: PlannedOutputArtifact) => cleanupArtifactView(this.runtimeArtifact(artifact)),
      artifacts: () => Object.freeze(this.context.items.map(cleanupArtifactView)),
      createdDirectories: () =>
        Object.freeze([...this.context.createdDirectories.values()].map(directory => createdDirectoryView(directory)!)),
      unconfirmedEntries: () => this.unconfirmedEntryViews(),
      restored: (item: CleanupArtifactView) => this.context.restored.get(this.runtimeArtifact(item.artifact)),
      markOwnedFileAbsent: (item: CleanupArtifactView, ownedPath: string) => {
        this.ownedFile(this.runtimeArtifact(item.artifact), ownedPath).exists = false;
      },
      markNamespaceAbsent: (item: CleanupArtifactView) => {
        required(this.runtimeArtifact(item.artifact).namespace).exists = false;
      },
      markCreatedDirectoryAbsent: (path: string) => {
        required(this.context.createdDirectories.get(path)).exists = false;
        this.context.ownershipChanged();
      },
      finishArtifactCleanup: () => this.context.ownershipChanged(),
    });
    return Object.freeze({
      journal,
      assertNamespace: (item: CleanupArtifactView) => this.assertNamespace(this.runtimeArtifact(item.artifact)),
      closeReadHandles: (item: CleanupArtifactView, failures: unknown[]) =>
        this.closeReadHandles(this.runtimeArtifact(item.artifact), failures),
      closeOpenHandle: (item: CleanupArtifactView, failures: unknown[]) =>
        this.closeOpenHandle(this.runtimeArtifact(item.artifact), failures),
      lstat: (path: string) => this.operations.lstat(path),
      lstatOrAbsent: (path: string) => this.lstatOrAbsent(path),
      observePublic: (item: CleanupArtifactView) =>
        this.observePublic(this.runtimeArtifact(item.artifact), this.context),
      rmdir: (path: string) => this.operations.rmdir(path),
      unlink: (path: string) => this.operations.unlink(path),
    });
  }

  public async prepareForPreflight(artifacts: readonly PlannedOutputArtifact[]): Promise<void> {
    await this.prepare(artifacts);
  }

  public hasOwnedArtifacts(): boolean {
    return (
      [...this.context.createdDirectories.values()].some(directory => directory.exists) ||
      this.context.items.some(
        item =>
          item.namespace?.exists ||
          item.stage?.exists ||
          item.backup?.exists ||
          item.quarantines.some(quarantine => quarantine.exists),
      )
    );
  }

  private async prepare(artifacts: readonly PlannedOutputArtifact[]): Promise<void> {
    const ordered = [...artifacts].sort((left, right) => compareCodeUnits(resolve(left.path), resolve(right.path)));
    for (let index = 1; index < ordered.length; index++) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      if (!previous || !current || previous.path !== current.path) continue;
      throw new MigrationApplicationError('path-collision', `Migration paths collide: ${current.path}`, [current.path]);
    }

    for (const artifact of ordered) {
      let item: RuntimeArtifact | undefined;
      try {
        const directories = await this.inspectDirectoryChain(dirname(artifact.path), artifact.path);
        item = { artifact, directories, quarantines: [], ownedFiles: [], readHandles: new Set() };
        const current = await this.observePublic(item);
        if (!sameArtifactState(current, artifact.original)) throw this.concurrentModification(artifact.path);
        if (current.status === 'present') {
          item.originalIdentity = current.identity;
          item.originalMode = current.mode;
        }
        this.context.items.push(item);
      } catch (error: unknown) {
        const closeFailures: unknown[] = [];
        if (item) await this.closeReadHandles(item, closeFailures);
        const failure = this.attachRecoveryFailures(artifact.path, error, closeFailures);
        if (failure instanceof MigrationApplicationError) throw failure;
        throw new MigrationApplicationError(
          'transaction-io',
          `Could not verify migration destination: ${artifact.path}`,
          [artifact.path],
          { cause: failure },
        );
      }
    }
  }

  private async inspectDirectoryChain(parent: string, publicPath: string): Promise<readonly DirectoryExpectation[]> {
    const result: DirectoryExpectation[] = [];
    let missing = false;
    for (const candidate of directoryChain(parent)) {
      if (missing) {
        result.push({ path: candidate, original: 'absent' });
        continue;
      }
      try {
        const candidateStat = await this.operations.lstat(candidate);
        const isImmediateParent = candidate === resolve(parent);
        if (
          (!candidateStat.isSymbolicLink() && !candidateStat.isDirectory()) ||
          (isImmediateParent && candidateStat.isSymbolicLink())
        ) {
          throw new MigrationApplicationError(
            'unsupported-path-type',
            `Migration destination parent must be a directory: ${candidate}`,
            [publicPath],
          );
        }
        if (candidateStat.isSymbolicLink()) {
          const followed = await this.operations.stat(candidate);
          if (!followed.isDirectory()) {
            throw new MigrationApplicationError(
              'unsupported-path-type',
              `Migration destination ancestor must resolve to a directory: ${candidate}`,
              [publicPath],
            );
          }
          result.push({
            path: candidate,
            original: {
              identity: identity(candidateStat),
              kind: 'symbolic-link',
              followedIdentity: identity(followed),
            },
          });
        } else {
          result.push({ path: candidate, original: { identity: identity(candidateStat), kind: 'directory' } });
        }
      } catch (error: unknown) {
        if (!isEnoent(error)) throw error;
        missing = true;
        result.push({ path: candidate, original: 'absent' });
      }
    }
    const nearestExisting = [...result].reverse().find(item => item.original !== 'absent');
    if (nearestExisting) await this.operations.access(nearestExisting.path, constants.W_OK | constants.X_OK);
    return result;
  }

  private async createStageFile(
    item: RuntimeArtifact,
    contents: string,
    signal: AbortSignal,
    mode?: number,
  ): Promise<OwnedFileView> {
    await this.assertNamespace(item);
    const namespace = required(item.namespace);
    const owned = this.registerOwnedFile(item, join(namespace.path, 'stage'));
    item.stage = owned;
    await this.writeOwnedFile(item, owned, contents, signal, mode);
    return ownedFileView(owned);
  }

  private async createBackupFile(
    item: RuntimeArtifact,
    contents: string,
    signal: AbortSignal,
    mode?: number,
  ): Promise<OwnedFileView> {
    await this.assertNamespace(item);
    const namespace = required(item.namespace);
    const owned = this.registerOwnedFile(item, join(namespace.path, 'backup'));
    item.backup = owned;
    await this.writeOwnedFile(item, owned, contents, signal, mode);
    return ownedFileView(owned);
  }

  private registerOwnedFile(item: RuntimeArtifact, path: string): OwnedFile {
    const owned: OwnedFile = {
      path,
      publicPath: item.artifact.path,
      exists: false,
      preserve: false,
    };
    item.ownedFiles.push(owned);
    return owned;
  }

  private async writeOwnedFile(
    item: RuntimeArtifact,
    owned: OwnedFile,
    contents: string,
    signal: AbortSignal,
    mode?: number,
  ): Promise<void> {
    await this.assertExpectedAbsent(owned.path, item.artifact.path);
    const handle = await this.operations.open(owned.path, 'wx');
    owned.exists = true;
    item.openHandle = handle;
    this.context.ownershipChanged();
    if (mode !== undefined) await handle.chmod(mode);
    owned.identity = identity(await handle.stat());
    this.assertNotInterrupted(signal);
    await handle.writeFile(contents, 'utf8');
    this.assertNotInterrupted(signal);
    await handle.sync();
    this.assertNotInterrupted(signal);
    await handle.close();
    item.openHandle = undefined;
    this.assertNotInterrupted(signal);
    await this.assertOwnedIdentity(item, owned);
  }

  private runtimeArtifact(artifact: PlannedOutputArtifact): RuntimeArtifact {
    return runtimeArtifact(this.context, artifact);
  }

  private ownedFile(item: RuntimeArtifact, path: string): OwnedFile {
    const owned = item.ownedFiles.find(candidate => candidate.path === path);
    if (owned !== undefined) return owned;
    throw new MigrationApplicationError(
      'internal-invariant',
      `Migration transaction journal contains an unknown invocation-owned file: ${path}`,
      [item.artifact.path],
    );
  }

  private addQuarantine(item: RuntimeArtifact, path: string): OwnedFile {
    const quarantine = this.registerOwnedFile(item, path);
    item.quarantines.push(quarantine);
    return quarantine;
  }

  private confirmOwnedFile(item: RuntimeArtifact, path: string, expected: FileIdentity): OwnedFile {
    const owned = this.ownedFile(item, path);
    owned.exists = true;
    owned.identity = expected;
    return owned;
  }

  private recordNamespace(artifact: PlannedOutputArtifact, path: string): void {
    const item = this.runtimeArtifact(artifact);
    item.namespace = { path, publicPath: item.artifact.path, exists: true };
    this.context.ownershipChanged();
  }

  private recordCreatedDirectory(path: string, publicPath: string): void {
    this.context.createdDirectories.set(path, {
      path,
      publicPaths: new Set([publicPath]),
      exists: true,
    });
    this.context.ownershipChanged();
  }

  private recordUnconfirmedEntry(path: string, publicPath: string): void {
    const publicPaths = this.context.unconfirmedEntries.get(path) ?? new Set<string>();
    publicPaths.add(publicPath);
    this.context.unconfirmedEntries.set(path, publicPaths);
  }

  private unconfirmedEntryViews(): readonly UnconfirmedEntryView[] {
    return Object.freeze(
      [...this.context.unconfirmedEntries].map(([path, publicPaths]) =>
        Object.freeze({ path, publicPaths: Object.freeze([...publicPaths]) }),
      ),
    );
  }

  private async closeOpenHandle(item: RuntimeArtifact, failures: unknown[]): Promise<void> {
    if (!item.openHandle) return;
    try {
      await item.openHandle.close();
    } catch (error: unknown) {
      failures.push(error);
    }
    item.openHandle = undefined;
  }

  private validateStagedTemplate(publicPath: string, contents: string): void {
    if (this.parser.parse(contents, publicPath).status !== 'parse-error') return;
    throw new MigrationApplicationError(
      'internal-invariant',
      `Staged template failed Angular validation: ${publicPath}`,
      [publicPath],
    );
  }

  private async observePublic(item: RuntimeArtifact, context?: TransactionUnitContext): Promise<ObservedState> {
    await this.assertParentChain(item, context);
    const before = await this.lstatOrAbsent(item.artifact.path);
    if (before === 'absent') return { status: 'absent' };
    if (before.isSymbolicLink() || !before.isFile()) {
      throw new MigrationApplicationError(
        'unsupported-path-type',
        `Migration destination must be a regular file: ${item.artifact.path}`,
        [item.artifact.path],
      );
    }
    const beforeIdentity = identity(before);
    const handle = await this.operations.open(item.artifact.path, 'r');
    const contents = await this.readThroughHandle(item, handle, async () => {
      const handleBefore = identity(await handle.stat());
      if (!sameIdentity(beforeIdentity, handleBefore)) throw this.concurrentModification(item.artifact.path);
      const read = await handle.readFile({ encoding: 'utf8' });
      const handleAfter = identity(await handle.stat());
      if (!sameIdentity(handleBefore, handleAfter)) throw this.concurrentModification(item.artifact.path);
      return read;
    });
    const after = await this.lstatOrAbsent(item.artifact.path);
    if (
      after === 'absent' ||
      after.isSymbolicLink() ||
      !after.isFile() ||
      !sameIdentity(beforeIdentity, identity(after))
    ) {
      throw this.concurrentModification(item.artifact.path);
    }
    await this.assertParentChain(item, context);
    return { status: 'present', contents, identity: beforeIdentity, mode: fileMode(before) };
  }

  private async readOwnedFile(item: RuntimeArtifact, owned: OwnedFile): Promise<string> {
    await this.assertOwnedIdentity(item, owned);
    const expected = required(owned.identity);
    const handle = await this.operations.open(owned.path, 'r');
    const contents = await this.readThroughHandle(item, handle, async () => {
      const before = identity(await handle.stat());
      if (!sameIdentity(before, expected)) throw this.ownershipFailure(owned.publicPath);
      const read = await handle.readFile({ encoding: 'utf8' });
      const after = identity(await handle.stat());
      if (!sameIdentity(after, expected)) throw this.ownershipFailure(owned.publicPath);
      return read;
    });
    await this.assertOwnedIdentity(item, owned);
    return contents;
  }

  private async readThroughHandle<T>(
    item: RuntimeArtifact,
    handle: MigrationTransactionFileHandle,
    read: () => Promise<T>,
  ): Promise<T> {
    item.readHandles.add(handle);
    let value: T | undefined;
    let readFailure: unknown;
    let readFailed = false;
    try {
      value = await read();
    } catch (error: unknown) {
      readFailed = true;
      readFailure = error;
    }
    const closeFailures: unknown[] = [];
    for (let attempt = 0; attempt < 2 && item.readHandles.has(handle); attempt++) {
      try {
        await handle.close();
        item.readHandles.delete(handle);
      } catch (error: unknown) {
        closeFailures.push(error);
      }
    }
    if (readFailed) throw this.attachRecoveryFailures(item.artifact.path, readFailure, closeFailures);
    if (closeFailures.length > 0) {
      throw new MigrationApplicationError(
        'transaction-io',
        `Could not close a migration read handle: ${item.artifact.path}`,
        [item.artifact.path],
        { cause: closeFailures[0], recoveryFailures: closeFailures.slice(1) },
      );
    }
    return value as T;
  }

  private attachRecoveryFailures(publicPath: string, error: unknown, recoveryFailures: readonly unknown[]): unknown {
    if (recoveryFailures.length === 0) return error;
    if (error instanceof MigrationApplicationError) {
      return new MigrationApplicationError(error.code, error.message, error.paths, {
        cause: error.cause ?? error,
        recoveryFailures: [...error.recoveryFailures, ...recoveryFailures],
      });
    }
    return new MigrationApplicationError(
      'transaction-io',
      `Could not read migration state: ${publicPath}`,
      [publicPath],
      {
        cause: error,
        recoveryFailures,
      },
    );
  }

  private async assertOwnedIdentity(item: RuntimeArtifact, owned: OwnedFile): Promise<void> {
    await this.assertNamespace(item);
    if (!owned.identity) throw this.ownershipFailure(owned.publicPath);
    const ownedStat = await this.operations.lstat(owned.path);
    if (ownedStat.isSymbolicLink() || !ownedStat.isFile() || !sameIdentity(identity(ownedStat), owned.identity)) {
      throw this.ownershipFailure(owned.publicPath);
    }
    await this.assertNamespace(item);
  }

  private async assertNamespace(item: RuntimeArtifact): Promise<void> {
    const namespace = required(item.namespace);
    const expectedIdentity = required(namespace.identity);
    const namespaceStat = await this.operations.lstat(namespace.path);
    if (
      namespaceStat.isSymbolicLink() ||
      !namespaceStat.isDirectory() ||
      !sameIdentity(identity(namespaceStat), expectedIdentity)
    ) {
      throw this.ownershipFailure(namespace.publicPath);
    }
  }

  private async assertParentChain(item: RuntimeArtifact, context?: TransactionUnitContext): Promise<void> {
    for (const expectation of item.directories) await this.assertExpectedDirectory(expectation, item, context);
  }

  private async assertExpectedDirectory(
    expectation: DirectoryExpectation,
    item: RuntimeArtifact,
    context?: TransactionUnitContext,
  ): Promise<void> {
    const created = context?.createdDirectories.get(expectation.path);
    if (created?.exists) {
      await this.assertDirectoryIdentity(expectation.path, required(created.identity), item.artifact.path);
      return;
    }
    if (expectation.original === 'absent') {
      await this.assertExpectedAbsent(expectation.path, item.artifact.path);
      return;
    }
    await this.assertDirectoryExpectation(expectation.path, expectation.original, item.artifact.path);
  }

  private async assertDirectoryExpectation(
    path: string,
    expected: Exclude<DirectoryExpectation['original'], 'absent'>,
    publicPath: string,
  ): Promise<void> {
    let pathStat: MigrationTransactionStat;
    try {
      pathStat = await this.operations.lstat(path);
    } catch (error: unknown) {
      throw this.concurrentModification(publicPath, error);
    }
    const kind = pathStat.isSymbolicLink() ? 'symbolic-link' : pathStat.isDirectory() ? 'directory' : undefined;
    if (kind !== expected.kind || !sameIdentity(identity(pathStat), expected.identity)) {
      throw this.concurrentModification(publicPath);
    }
    if (expected.kind === 'symbolic-link') {
      let followed: MigrationTransactionStat;
      try {
        followed = await this.operations.stat(path);
      } catch (error: unknown) {
        throw this.concurrentModification(publicPath, error);
      }
      if (!followed.isDirectory() || !sameIdentity(identity(followed), expected.followedIdentity)) {
        throw this.concurrentModification(publicPath);
      }
    }
  }

  private async assertDirectoryIdentity(path: string, expected: FileIdentity, publicPath: string): Promise<void> {
    let pathStat: MigrationTransactionStat;
    try {
      pathStat = await this.operations.lstat(path);
    } catch (error: unknown) {
      throw this.concurrentModification(publicPath, error);
    }
    if (pathStat.isSymbolicLink() || !pathStat.isDirectory() || !sameIdentity(identity(pathStat), expected)) {
      throw this.concurrentModification(publicPath);
    }
  }

  private async assertExpectedAbsent(path: string, publicPath: string): Promise<void> {
    try {
      await this.operations.lstat(path);
    } catch (error: unknown) {
      if (isEnoent(error)) return;
      throw error;
    }
    throw this.concurrentModification(publicPath);
  }

  private async lstatOrAbsent(path: string): Promise<MigrationTransactionStat | 'absent'> {
    try {
      return await this.operations.lstat(path);
    } catch (error: unknown) {
      if (isEnoent(error)) return 'absent';
      throw error;
    }
  }

  private async closeReadHandles(item: RuntimeArtifact, failures: unknown[]): Promise<void> {
    for (const handle of item.readHandles) {
      try {
        await handle.close();
        item.readHandles.delete(handle);
      } catch (error: unknown) {
        failures.push(error);
      }
    }
  }

  private assertNotInterrupted(signal: AbortSignal): void {
    if (!signal.aborted) return;
    throw signal.reason instanceof Error ? signal.reason : new Error('Migration transaction interrupted.');
  }

  private concurrentModification(publicPath: string, cause?: unknown): MigrationApplicationError {
    return new MigrationApplicationError(
      'concurrent-modification',
      `Migration destination changed after planning: ${publicPath}`,
      [publicPath],
      cause === undefined ? undefined : { cause },
    );
  }

  private ownershipFailure(publicPath: string): MigrationApplicationError {
    return new MigrationApplicationError(
      'transaction-io',
      `Migration transaction ownership could not be confirmed: ${publicPath}`,
      [publicPath],
    );
  }
}

function directoryChain(path: string): readonly string[] {
  const result: string[] = [];
  let current = resolve(path);
  while (true) {
    result.unshift(current);
    const parent = dirname(current);
    if (parent === current) return result;
    current = parent;
  }
}

function frozenIdentity(value: FileIdentity | undefined): FileIdentity | undefined {
  return value === undefined ? undefined : Object.freeze({ ...value });
}

function ownedFileView(owned: OwnedFile): OwnedFileView {
  return Object.freeze({
    path: owned.path,
    publicPath: owned.publicPath,
    ...(owned.identity === undefined ? {} : { identity: frozenIdentity(owned.identity) }),
    exists: owned.exists,
    preserve: owned.preserve,
  });
}

function ownedNamespaceView(namespace: OwnedNamespace | undefined) {
  if (namespace === undefined) return undefined;
  return Object.freeze({
    path: namespace.path,
    publicPath: namespace.publicPath,
    ...(namespace.identity === undefined ? {} : { identity: frozenIdentity(namespace.identity) }),
    exists: namespace.exists,
  });
}

function directoryExpectationView(expectation: DirectoryExpectation): DirectoryExpectation {
  if (expectation.original === 'absent') return Object.freeze({ path: expectation.path, original: 'absent' });
  return Object.freeze({
    path: expectation.path,
    original: Object.freeze({
      ...expectation.original,
      identity: frozenIdentity(expectation.original.identity)!,
      ...(expectation.original.kind === 'symbolic-link'
        ? { followedIdentity: frozenIdentity(expectation.original.followedIdentity)! }
        : {}),
    }),
  });
}

function stagingArtifactView(item: RuntimeArtifact): StagingArtifactView {
  return Object.freeze({
    artifact: item.artifact,
    directories: Object.freeze(item.directories.map(directoryExpectationView)),
    ...(item.originalMode === undefined ? {} : { originalMode: item.originalMode }),
    ...(item.stage === undefined ? {} : { stagingPath: item.stage.path }),
  });
}

function commitArtifactView(item: RuntimeArtifact): CommitArtifactView {
  return Object.freeze({
    artifact: item.artifact,
    ...(item.originalIdentity === undefined ? {} : { originalIdentity: frozenIdentity(item.originalIdentity) }),
    ...(item.namespace === undefined ? {} : { namespace: ownedNamespaceView(item.namespace) }),
    ...(item.stage === undefined ? {} : { stage: ownedFileView(item.stage) }),
    ...(item.backup === undefined ? {} : { backup: ownedFileView(item.backup) }),
    quarantines: Object.freeze(item.quarantines.map(ownedFileView)),
    ...(item.installedIdentity === undefined ? {} : { installedIdentity: frozenIdentity(item.installedIdentity) }),
  });
}

function rollbackArtifactView(item: RuntimeArtifact): RollbackArtifactView {
  return Object.freeze({
    artifact: item.artifact,
    ...(item.originalIdentity === undefined ? {} : { originalIdentity: frozenIdentity(item.originalIdentity) }),
    ...(item.namespace === undefined ? {} : { namespace: ownedNamespaceView(item.namespace) }),
    ...(item.stage === undefined ? {} : { stage: ownedFileView(item.stage) }),
    ...(item.backup === undefined ? {} : { backup: ownedFileView(item.backup) }),
    ...(item.installedIdentity === undefined ? {} : { installedIdentity: frozenIdentity(item.installedIdentity) }),
    ...(item.restoredIdentity === undefined ? {} : { restoredIdentity: frozenIdentity(item.restoredIdentity) }),
  });
}

function cleanupArtifactView(item: RuntimeArtifact): CleanupArtifactView {
  return Object.freeze({
    artifact: item.artifact,
    directories: Object.freeze(item.directories.map(directoryExpectationView)),
    ...(item.originalIdentity === undefined ? {} : { originalIdentity: frozenIdentity(item.originalIdentity) }),
    ...(item.namespace === undefined ? {} : { namespace: ownedNamespaceView(item.namespace) }),
    ownedFiles: Object.freeze(item.ownedFiles.map(ownedFileView)),
    ...(item.backup === undefined ? {} : { backupPath: item.backup.path }),
    ...(item.restoredIdentity === undefined ? {} : { restoredIdentity: frozenIdentity(item.restoredIdentity) }),
  });
}

function createdDirectoryView(directory: CreatedDirectory | undefined): CreatedDirectoryView | undefined {
  if (directory === undefined) return undefined;
  return Object.freeze({
    path: directory.path,
    ...(directory.identity === undefined ? {} : { identity: frozenIdentity(directory.identity) }),
    publicPaths: Object.freeze([...directory.publicPaths]),
    exists: directory.exists,
  });
}
