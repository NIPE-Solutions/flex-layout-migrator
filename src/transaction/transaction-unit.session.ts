import { constants } from 'node:fs';
import { access, link, lstat, mkdir, open, rename, rmdir, stat, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { MigrationApplicationError } from '../migrator/migration-application.error';
import type { ArtifactState, PlannedOutputArtifact } from '../migrator/migration-plan';
import { AngularTemplateParser } from '../template/angular-template.parser';
import { compareCodeUnits } from '../util/compare-code-units';

export interface MigrationTransactionFileHandle {
  chmod(mode: number): Promise<void>;
  writeFile(contents: string, encoding: BufferEncoding): Promise<void>;
  readFile(options: { readonly encoding: 'utf8' }): Promise<string>;
  stat(): Promise<MigrationTransactionStat>;
  sync(): Promise<void>;
  close(): Promise<void>;
}

export interface MigrationTransactionStat {
  readonly dev: number | bigint;
  readonly ino: number | bigint;
  readonly mode: number | bigint;
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
}

export interface MigrationTransactionOperations {
  access(path: string, mode: number): Promise<void>;
  link(existingPath: string, newPath: string): Promise<void>;
  lstat(path: string): Promise<MigrationTransactionStat>;
  mkdir(path: string, options?: { readonly recursive?: boolean; readonly mode?: number }): Promise<unknown>;
  open(path: string, flags: 'r' | 'wx'): Promise<MigrationTransactionFileHandle>;
  rename(source: string, destination: string): Promise<void>;
  rmdir(path: string): Promise<void>;
  stat(path: string): Promise<MigrationTransactionStat>;
  unlink(path: string): Promise<void>;
}

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

export interface FileIdentity {
  readonly dev: string;
  readonly ino: string;
}

export interface DirectoryExpectation {
  readonly path: string;
  readonly original:
    | 'absent'
    | { readonly identity: FileIdentity; readonly kind: 'directory' }
    | { readonly identity: FileIdentity; readonly kind: 'symbolic-link'; readonly followedIdentity: FileIdentity };
}

export interface CreatedDirectory {
  readonly path: string;
  identity?: FileIdentity;
  readonly publicPaths: Set<string>;
  exists: boolean;
}

export interface OwnedNamespace {
  readonly path: string;
  identity?: FileIdentity;
  readonly publicPath: string;
  exists: boolean;
}

export interface OwnedFile {
  readonly path: string;
  readonly publicPath: string;
  identity?: FileIdentity;
  exists: boolean;
  preserve: boolean;
}

export interface ObservedPresentState {
  readonly status: 'present';
  readonly contents: string;
  readonly identity: FileIdentity;
  readonly mode: number;
}

export type ObservedState = { readonly status: 'absent' } | ObservedPresentState;

export interface RuntimeArtifact {
  readonly artifact: PlannedOutputArtifact;
  readonly directories: readonly DirectoryExpectation[];
  readonly quarantines: OwnedFile[];
  readonly ownedFiles: OwnedFile[];
  readonly readHandles: Set<MigrationTransactionFileHandle>;
  originalIdentity?: FileIdentity;
  originalMode?: number;
  namespace?: OwnedNamespace;
  stage?: OwnedFile;
  backup?: OwnedFile;
  openHandle?: MigrationTransactionFileHandle;
  installedIdentity?: FileIdentity;
  restoredIdentity?: FileIdentity;
}

export interface TransactionUnitContext {
  readonly items: RuntimeArtifact[];
  readonly createdDirectories: Map<string, CreatedDirectory>;
  readonly unconfirmedEntries: Map<string, Set<string>>;
  readonly recoveryFailures: unknown[];
  readonly restored: Map<RuntimeArtifact, boolean>;
  readonly ownershipChanged: () => void;
}

export interface RecoveryOutcome {
  readonly paths: readonly string[];
  readonly failures: readonly unknown[];
}

export class RecoveryUnitError extends Error {
  constructor(
    readonly paths: readonly string[],
    readonly failures: readonly unknown[],
  ) {
    super('Transaction recovery was incomplete.');
    this.name = 'RecoveryUnitError';
    this.paths = Object.freeze([...paths]);
    this.failures = Object.freeze([...failures]);
  }
}

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

export function runtimeArtifact(context: TransactionUnitContext, artifact: PlannedOutputArtifact): RuntimeArtifact {
  const item = context.items.find(candidate => candidate.artifact === artifact);
  if (item) return item;
  throw new MigrationApplicationError(
    'internal-invariant',
    `Migration transaction journal contains an unknown artifact: ${artifact.path}`,
    [artifact.path],
  );
}

export function identity(stat: MigrationTransactionStat): FileIdentity {
  return { dev: String(stat.dev), ino: String(stat.ino) };
}

export function fileMode(stat: MigrationTransactionStat): number {
  return Number(stat.mode) & 0o7777;
}

export function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

export function sameArtifactState(left: ObservedState, right: ArtifactState): boolean {
  if (left.status !== right.status) return false;
  if (left.status === 'absent') return true;
  return right.status === 'present' && left.contents === right.contents;
}

export function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing transaction state.');
  return value;
}

export function isEnoent(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

export function isDirectoryNotEmpty(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'ENOTEMPTY' || error.code === 'EEXIST')
  );
}

export function pathDepth(path: string): number {
  return path.split(/[\\/]/u).filter(Boolean).length;
}

export function recoveryOutcome(paths: Iterable<string>, failures: readonly unknown[]): RecoveryOutcome {
  return { paths: sortedUnique(paths), failures: Object.freeze([...failures]) };
}

export function recoveryUnitError(error: unknown): RecoveryUnitError {
  return new RecoveryUnitError(error instanceof MigrationApplicationError ? error.paths : [], [error]);
}

export function sortedUnique(paths: Iterable<string>): readonly string[] {
  return [...new Set(paths)].sort(compareCodeUnits);
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
