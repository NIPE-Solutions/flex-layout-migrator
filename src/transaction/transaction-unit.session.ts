import { constants } from 'node:fs';
import { access, link, lstat, mkdir, open, rename, rmdir, stat, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { MigrationApplicationError } from '../migrator/migration-application.error';
import type { PlannedOutputArtifact } from '../migrator/migration-plan';
import { AngularTemplateParser } from '../template/angular-template.parser';
import { compareCodeUnits } from '../util/compare-code-units';
import type { CleanupPort, CommitPort, RollbackPort, StagingPort } from './transaction-unit.ports';
import {
  fileMode,
  identity,
  isEnoent,
  required,
  runtimeArtifact,
  sameArtifactState,
  sameIdentity,
  type DirectoryExpectation,
  type FileIdentity,
  type MigrationTransactionFileHandle,
  type MigrationTransactionOperations,
  type MigrationTransactionStat,
  type ObservedState,
  type OwnedFile,
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
  readonly context: TransactionUnitContext;

  constructor(
    readonly operations: MigrationTransactionOperations = nodeTransactionOperations,
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
    const journal = Object.freeze({
      items: this.context.items,
      createdDirectories: this.context.createdDirectories,
      unconfirmedEntries: this.context.unconfirmedEntries,
      ownershipChanged: this.context.ownershipChanged,
    });
    return Object.freeze({
      journal,
      prepare: (artifacts: readonly PlannedOutputArtifact[]) => this.prepare(this.context, artifacts),
      assertDirectoryExpectation: (
        path: string,
        expected: Exclude<DirectoryExpectation['original'], 'absent'>,
        publicPath: string,
      ) => this.assertDirectoryExpectation(path, expected, publicPath),
      assertDirectoryIdentity: (path: string, expected: FileIdentity, publicPath: string) =>
        this.assertDirectoryIdentity(path, expected, publicPath),
      assertExpectedAbsent: (path: string, publicPath: string) => this.assertExpectedAbsent(path, publicPath),
      assertExpectedDirectory: (expectation: DirectoryExpectation, item: RuntimeArtifact) =>
        this.assertExpectedDirectory(expectation, item, this.context),
      assertNotInterrupted: (signal: AbortSignal) => this.assertNotInterrupted(signal),
      assertParentChain: (item: RuntimeArtifact) => this.assertParentChain(item, this.context),
      concurrentModification: (publicPath: string, cause?: unknown) => this.concurrentModification(publicPath, cause),
      createOwnedFile: (
        item: RuntimeArtifact,
        name: 'backup' | 'stage',
        contents: string,
        signal: AbortSignal,
        mode?: number,
      ) => this.createOwnedFile(item, name, contents, this.context, signal, mode),
      lstat: (path: string) => this.operations.lstat(path),
      mkdir: (path: string, options?: { readonly recursive?: boolean; readonly mode?: number }) =>
        this.operations.mkdir(path, options),
      readOwnedFile: (item: RuntimeArtifact, owned: OwnedFile) => this.readOwnedFile(item, owned),
      validateStagedTemplate: (publicPath: string, contents: string) =>
        this.validateStagedTemplate(publicPath, contents),
    });
  }

  public commitPort(): CommitPort {
    const journal = Object.freeze({
      items: this.context.items,
      recoveryFailures: this.context.recoveryFailures,
    });
    return Object.freeze({
      journal,
      assertExpectedAbsent: (path: string, publicPath: string) => this.assertExpectedAbsent(path, publicPath),
      assertNamespace: (item: RuntimeArtifact) => this.assertNamespace(item),
      assertNotInterrupted: (signal: AbortSignal) => this.assertNotInterrupted(signal),
      assertOwnedIdentity: (item: RuntimeArtifact, owned: OwnedFile) => this.assertOwnedIdentity(item, owned),
      assertParentChain: (item: RuntimeArtifact) => this.assertParentChain(item, this.context),
      concurrentModification: (publicPath: string, cause?: unknown) => this.concurrentModification(publicPath, cause),
      createOwnedFile: (
        item: RuntimeArtifact,
        name: 'backup' | 'stage',
        contents: string,
        signal: AbortSignal,
        mode?: number,
      ) => this.createOwnedFile(item, name, contents, this.context, signal, mode),
      link: (existingPath: string, newPath: string) => this.operations.link(existingPath, newPath),
      lstatOrAbsent: (path: string) => this.lstatOrAbsent(path),
      observePublic: (item: RuntimeArtifact) => this.observePublic(item, this.context),
      ownershipFailure: (publicPath: string) => this.ownershipFailure(publicPath),
      readOwnedFile: (item: RuntimeArtifact, owned: OwnedFile) => this.readOwnedFile(item, owned),
      rename: (source: string, destination: string) => this.operations.rename(source, destination),
      runtimeArtifact: (artifact: PlannedOutputArtifact) => runtimeArtifact(this.context, artifact),
    });
  }

  public rollbackPort(): RollbackPort {
    const journal = Object.freeze({
      items: this.context.items,
      recoveryFailures: this.context.recoveryFailures,
      restored: this.context.restored,
    });
    return Object.freeze({
      journal,
      assertExpectedAbsent: (path: string, publicPath: string) => this.assertExpectedAbsent(path, publicPath),
      assertNamespace: (item: RuntimeArtifact) => this.assertNamespace(item),
      assertParentChain: (item: RuntimeArtifact) => this.assertParentChain(item, this.context),
      link: (existingPath: string, newPath: string) => this.operations.link(existingPath, newPath),
      lstatOrAbsent: (path: string) => this.lstatOrAbsent(path),
      observePublic: (item: RuntimeArtifact) => this.observePublic(item, this.context),
      readOwnedFile: (item: RuntimeArtifact, owned: OwnedFile) => this.readOwnedFile(item, owned),
      rename: (source: string, destination: string) => this.operations.rename(source, destination),
      runtimeArtifact: (artifact: PlannedOutputArtifact) => runtimeArtifact(this.context, artifact),
    });
  }

  public cleanupPort(): CleanupPort {
    const journal = Object.freeze({
      items: this.context.items,
      createdDirectories: this.context.createdDirectories,
      unconfirmedEntries: this.context.unconfirmedEntries,
      restored: this.context.restored,
      ownershipChanged: this.context.ownershipChanged,
    });
    return Object.freeze({
      journal,
      assertNamespace: (item: RuntimeArtifact) => this.assertNamespace(item),
      closeReadHandles: (item: RuntimeArtifact, failures: unknown[]) => this.closeReadHandles(item, failures),
      lstat: (path: string) => this.operations.lstat(path),
      lstatOrAbsent: (path: string) => this.lstatOrAbsent(path),
      observePublic: (item: RuntimeArtifact) => this.observePublic(item, this.context),
      rmdir: (path: string) => this.operations.rmdir(path),
      runtimeArtifact: (artifact: PlannedOutputArtifact) => runtimeArtifact(this.context, artifact),
      unlink: (path: string) => this.operations.unlink(path),
    });
  }

  public async prepare(
    context: TransactionUnitContext,
    artifacts: readonly PlannedOutputArtifact[],
  ): Promise<readonly RuntimeArtifact[]> {
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
        context.items.push(item);
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
    return context.items;
  }

  public async inspectDirectoryChain(parent: string, publicPath: string): Promise<readonly DirectoryExpectation[]> {
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

  public async createOwnedFile(
    item: RuntimeArtifact,
    name: 'backup' | 'stage',
    contents: string,
    context: TransactionUnitContext,
    signal: AbortSignal,
    mode?: number,
  ): Promise<OwnedFile> {
    await this.assertNamespace(item);
    const namespace = required(item.namespace);
    const owned: OwnedFile = {
      path: join(namespace.path, name),
      publicPath: item.artifact.path,
      exists: false,
      preserve: false,
    };
    item.ownedFiles.push(owned);
    item[name] = owned;
    await this.assertExpectedAbsent(owned.path, item.artifact.path);
    const handle = await this.operations.open(owned.path, 'wx');
    owned.exists = true;
    item.openHandle = handle;
    context.ownershipChanged();
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
    return owned;
  }

  public validateStagedTemplate(publicPath: string, contents: string): void {
    if (this.parser.parse(contents, publicPath).status !== 'parse-error') return;
    throw new MigrationApplicationError(
      'internal-invariant',
      `Staged template failed Angular validation: ${publicPath}`,
      [publicPath],
    );
  }

  public async observePublic(item: RuntimeArtifact, context?: TransactionUnitContext): Promise<ObservedState> {
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

  public async readOwnedFile(item: RuntimeArtifact, owned: OwnedFile): Promise<string> {
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

  public async readThroughHandle<T>(
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

  public attachRecoveryFailures(publicPath: string, error: unknown, recoveryFailures: readonly unknown[]): unknown {
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

  public async assertOwnedIdentity(item: RuntimeArtifact, owned: OwnedFile): Promise<void> {
    await this.assertNamespace(item);
    if (!owned.identity) throw this.ownershipFailure(owned.publicPath);
    const ownedStat = await this.operations.lstat(owned.path);
    if (ownedStat.isSymbolicLink() || !ownedStat.isFile() || !sameIdentity(identity(ownedStat), owned.identity)) {
      throw this.ownershipFailure(owned.publicPath);
    }
    await this.assertNamespace(item);
  }

  public async assertNamespace(item: RuntimeArtifact): Promise<void> {
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

  public async assertParentChain(item: RuntimeArtifact, context?: TransactionUnitContext): Promise<void> {
    for (const expectation of item.directories) await this.assertExpectedDirectory(expectation, item, context);
  }

  public async assertExpectedDirectory(
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

  public async assertDirectoryExpectation(
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

  public async assertDirectoryIdentity(path: string, expected: FileIdentity, publicPath: string): Promise<void> {
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

  public async assertExpectedAbsent(path: string, publicPath: string): Promise<void> {
    try {
      await this.operations.lstat(path);
    } catch (error: unknown) {
      if (isEnoent(error)) return;
      throw error;
    }
    throw this.concurrentModification(publicPath);
  }

  public async lstatOrAbsent(path: string): Promise<MigrationTransactionStat | 'absent'> {
    try {
      return await this.operations.lstat(path);
    } catch (error: unknown) {
      if (isEnoent(error)) return 'absent';
      throw error;
    }
  }

  public async closeReadHandles(item: RuntimeArtifact, failures: unknown[]): Promise<void> {
    for (const handle of item.readHandles) {
      try {
        await handle.close();
        item.readHandles.delete(handle);
      } catch (error: unknown) {
        failures.push(error);
      }
    }
  }

  public assertNotInterrupted(signal: AbortSignal): void {
    if (!signal.aborted) return;
    throw signal.reason instanceof Error ? signal.reason : new Error('Migration transaction interrupted.');
  }

  public concurrentModification(publicPath: string, cause?: unknown): MigrationApplicationError {
    return new MigrationApplicationError(
      'concurrent-modification',
      `Migration destination changed after planning: ${publicPath}`,
      [publicPath],
      cause === undefined ? undefined : { cause },
    );
  }

  public ownershipFailure(publicPath: string): MigrationApplicationError {
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
