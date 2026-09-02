import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { MigrationApplicationError } from '../migrator/migration-application.error';
import type { ArtifactState, MigrationPlan, PlannedOutputArtifact } from '../migrator/migration-plan';
import { AngularTemplateParser } from '../template/angular-template.parser';
import { compareCodeUnits } from '../util/compare-code-units';
import { TransactionSignalRegistrar, type TransactionSignalRegistrarLike } from './transaction-signal.registrar';

export interface MigrationTransactionFileHandle {
  writeFile(contents: string, encoding: BufferEncoding): Promise<void>;
  sync(): Promise<void>;
  close(): Promise<void>;
}

export interface MigrationTransactionStat {
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
}

export interface MigrationTransactionOperations {
  access(path: string, mode: number): Promise<void>;
  lstat(path: string): Promise<MigrationTransactionStat>;
  mkdir(path: string, options: { readonly recursive: true }): Promise<unknown>;
  open(path: string, flags: 'wx'): Promise<MigrationTransactionFileHandle>;
  readFile(path: string): Promise<string>;
  rename(source: string, destination: string): Promise<void>;
  unlink(path: string): Promise<void>;
}

const nodeOperations: MigrationTransactionOperations = {
  access,
  lstat,
  mkdir,
  open: (target, flags) => open(target, flags),
  readFile: target => readFile(target, 'utf8'),
  rename,
  unlink,
};

interface OwnedPath {
  readonly path: string;
  readonly publicPath: string;
  exists: boolean;
}

interface RuntimeArtifact {
  readonly artifact: PlannedOutputArtifact;
  temporary?: OwnedPath;
  backup?: OwnedPath;
  openHandle?: MigrationTransactionFileHandle;
}

interface RecoveryResult {
  readonly paths: readonly string[];
  readonly causes: readonly unknown[];
}

class TransactionInterruptedError extends Error {
  constructor(readonly signal: NodeJS.Signals) {
    super(`Migration transaction interrupted by ${signal}.`);
    this.name = 'TransactionInterruptedError';
  }
}

export class MigrationTransaction {
  private interruptedBy: NodeJS.Signals | undefined;
  private unregisterSignals: (() => void) | undefined;

  constructor(
    private readonly operations: MigrationTransactionOperations = nodeOperations,
    private readonly signalRegistrar: TransactionSignalRegistrarLike = new TransactionSignalRegistrar(),
    private readonly parser: AngularTemplateParser = new AngularTemplateParser(),
  ) {}

  async preflight(plan: MigrationPlan): Promise<void> {
    this.rejectParseErrors(plan);
    const artifacts = this.sortedArtifacts(plan);
    for (let index = 1; index < artifacts.length; index++) {
      const previous = artifacts[index - 1];
      const current = artifacts[index];
      if (!previous || !current || previous.path !== current.path) continue;
      throw new MigrationApplicationError('path-collision', `Migration paths collide: ${current.path}`, [current.path]);
    }

    for (const artifact of artifacts) await this.preflightArtifact(artifact);
  }

  async apply(plan: MigrationPlan): Promise<void> {
    await this.preflight(plan);
    const artifacts = this.sortedArtifacts(plan);
    if (artifacts.length === 0) return;

    this.interruptedBy = undefined;
    const runtime = artifacts.map(artifact => ({ artifact }) satisfies RuntimeArtifact);

    try {
      await this.stage(runtime);
    } catch (error: unknown) {
      const recovery = await this.cleanupStaging(runtime);
      this.unregisterSignalHandlers();
      if (recovery.paths.length > 0) throw this.ioError(error, recovery.paths);
      throw this.applicationError(error);
    }

    try {
      await this.commit(runtime);
      this.assertNotInterrupted();
    } catch (error: unknown) {
      const recovery = await this.rollback(runtime);
      this.unregisterSignalHandlers();
      throw this.applicationError(error, recovery.paths);
    }

    const finalization = await this.finalize(runtime);
    this.unregisterSignalHandlers();
    if (finalization.paths.length > 0) {
      throw this.ioError(
        finalization.causes[0],
        finalization.paths,
        'Migration committed, but cleanup was incomplete.',
      );
    }
    if (this.interruptedBy) throw this.interruptedError([], new TransactionInterruptedError(this.interruptedBy));
  }

  private rejectParseErrors(plan: MigrationPlan): void {
    const paths = plan.files
      .flatMap(file => file.results.filter(result => result.status === 'parse-error').map(result => result.fileName))
      .filter((path, index, all) => all.indexOf(path) === index)
      .sort(compareCodeUnits);
    if (paths.length === 0) return;

    throw new MigrationApplicationError(
      'internal-invariant',
      'A migration plan with template parse errors cannot be applied.',
      paths,
    );
  }

  private sortedArtifacts(plan: MigrationPlan): readonly PlannedOutputArtifact[] {
    return [...plan.artifacts].sort((left, right) => compareCodeUnits(resolve(left.path), resolve(right.path)));
  }

  private async preflightArtifact(artifact: PlannedOutputArtifact): Promise<void> {
    try {
      const current = await this.destinationState(artifact.path);
      if (!sameState(current, artifact.original)) {
        throw new MigrationApplicationError(
          'concurrent-modification',
          `Migration destination changed after planning: ${artifact.path}`,
          [artifact.path],
        );
      }
      await this.assertWritableParent(artifact.path);
    } catch (error: unknown) {
      if (error instanceof MigrationApplicationError) throw error;
      throw new MigrationApplicationError(
        'transaction-io',
        `Could not verify migration destination: ${artifact.path}`,
        [artifact.path],
        { cause: error },
      );
    }
  }

  private async destinationState(target: string): Promise<ArtifactState> {
    let stat: MigrationTransactionStat;
    try {
      stat = await this.operations.lstat(target);
    } catch (error: unknown) {
      if (isEnoent(error)) return { status: 'absent' };
      throw error;
    }

    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new MigrationApplicationError(
        'unsupported-path-type',
        `Migration destination must be a regular file: ${target}`,
        [target],
      );
    }
    return { status: 'present', contents: await this.operations.readFile(target) };
  }

  private async assertWritableParent(target: string): Promise<void> {
    let candidate = dirname(target);
    while (true) {
      try {
        const stat = await this.operations.lstat(candidate);
        if (stat.isSymbolicLink() || !stat.isDirectory()) {
          throw new MigrationApplicationError(
            'unsupported-path-type',
            `Migration destination parent must be a directory: ${candidate}`,
            [target],
          );
        }
        await this.operations.access(candidate, constants.W_OK | constants.X_OK);
        return;
      } catch (error: unknown) {
        if (!isEnoent(error)) throw error;
        const parent = dirname(candidate);
        if (parent === candidate) throw error;
        candidate = parent;
      }
    }
  }

  private async stage(runtime: readonly RuntimeArtifact[]): Promise<void> {
    const directories = [...new Set(runtime.map(item => dirname(item.artifact.path)))].sort(compareCodeUnits);
    for (const directory of directories) {
      this.assertNotInterrupted();
      await this.operations.mkdir(directory, { recursive: true });
    }

    for (const item of runtime) {
      if (item.artifact.proposed.status === 'absent') continue;
      this.assertNotInterrupted();
      item.temporary = this.ownedPath(item.artifact.path, 'tmp');
      const handle = await this.operations.open(item.temporary.path, 'wx');
      item.temporary.exists = true;
      item.openHandle = handle;
      this.syncSignalScope(runtime);

      this.assertNotInterrupted();
      await handle.writeFile(item.artifact.proposed.contents, 'utf8');
      this.assertNotInterrupted();
      await handle.sync();
      this.assertNotInterrupted();
      await handle.close();
      item.openHandle = undefined;

      this.assertNotInterrupted();
      const stagedContents = await this.operations.readFile(item.temporary.path);
      if (item.artifact.kind === 'template') this.validateStagedTemplate(item.artifact.path, stagedContents);
    }

    for (const item of runtime) {
      if (item.artifact.original.status === 'absent') continue;
      this.assertNotInterrupted();
      item.backup = this.ownedPath(item.artifact.path, 'bak');
      const reservation = await this.operations.open(item.backup.path, 'wx');
      item.backup.exists = true;
      item.openHandle = reservation;
      this.syncSignalScope(runtime);
      this.assertNotInterrupted();
      await reservation.close();
      item.openHandle = undefined;
    }
  }

  private validateStagedTemplate(publicPath: string, contents: string): void {
    const parsed = this.parser.parse(contents, publicPath);
    if (parsed.status !== 'parse-error') return;
    throw new MigrationApplicationError(
      'internal-invariant',
      `Staged template failed Angular validation: ${publicPath}`,
      [publicPath],
    );
  }

  private async commit(runtime: readonly RuntimeArtifact[]): Promise<void> {
    for (const item of runtime) {
      this.assertNotInterrupted();
      if (item.artifact.original.status === 'present') {
        const backup = required(item.backup);
        await this.operations.rename(item.artifact.path, backup.path);
        this.assertNotInterrupted();
      }

      if (item.artifact.proposed.status === 'present') {
        const temporary = required(item.temporary);
        await this.operations.rename(temporary.path, item.artifact.path);
        temporary.exists = false;
        this.syncSignalScope(runtime);
        this.assertNotInterrupted();
      }
    }
  }

  private async cleanupStaging(runtime: readonly RuntimeArtifact[]): Promise<RecoveryResult> {
    const paths = new Set<string>();
    const causes: unknown[] = [];
    for (const item of [...runtime].reverse()) {
      if (item.openHandle) {
        try {
          await item.openHandle.close();
        } catch (error: unknown) {
          paths.add(item.artifact.path);
          causes.push(error);
        }
        item.openHandle = undefined;
      }
      await this.removeOwned(item.temporary, paths, causes);
      await this.removeOwned(item.backup, paths, causes);
      this.syncSignalScope(runtime);
    }
    return recoveryResult(paths, causes);
  }

  private async rollback(runtime: readonly RuntimeArtifact[]): Promise<RecoveryResult> {
    const paths = new Set<string>();
    const causes: unknown[] = [];

    for (const item of [...runtime].reverse()) {
      const didRestore = await this.restoreOriginal(item, paths, causes);
      await this.removeOwned(item.temporary, paths, causes);
      if (didRestore) await this.removeOwned(item.backup, paths, causes);
      this.syncSignalScope(runtime);
    }

    return recoveryResult(paths, causes);
  }

  private async restoreOriginal(item: RuntimeArtifact, paths: Set<string>, causes: unknown[]): Promise<boolean> {
    const original = item.artifact.original;
    const destination = await this.recoveryState(item.artifact.path, item.artifact.path, paths, causes);
    if (destination !== 'unknown' && sameState(destination, original)) return true;

    if (original.status === 'absent') {
      if (destination === 'unknown') return false;
      if (!sameState(destination, item.artifact.proposed)) {
        paths.add(item.artifact.path);
        return false;
      }
      await this.recoveryUnlink(item.artifact.path, item.artifact.path, paths, causes);
      const verified = await this.recoveryState(item.artifact.path, item.artifact.path, paths, causes);
      if (verified !== 'unknown' && verified.status === 'absent') return true;
      paths.add(item.artifact.path);
      return false;
    }

    const backup = item.backup;
    if (!backup) {
      paths.add(item.artifact.path);
      return false;
    }
    const backupState = await this.recoveryState(backup.path, item.artifact.path, paths, causes);
    if (backupState === 'unknown' || !sameState(backupState, original)) {
      paths.add(item.artifact.path);
      return false;
    }

    if (destination !== 'unknown' && destination.status === 'present') {
      if (!sameState(destination, item.artifact.proposed)) {
        paths.add(item.artifact.path);
        return false;
      }
      await this.recoveryUnlink(item.artifact.path, item.artifact.path, paths, causes);
    }

    const afterRemoval = await this.recoveryState(item.artifact.path, item.artifact.path, paths, causes);
    if (afterRemoval === 'unknown' || afterRemoval.status !== 'absent') {
      paths.add(item.artifact.path);
      return false;
    }

    try {
      await this.operations.rename(backup.path, item.artifact.path);
      backup.exists = false;
    } catch (error: unknown) {
      causes.push(error);
    }

    const verified = await this.recoveryState(item.artifact.path, item.artifact.path, paths, causes);
    if (verified !== 'unknown' && sameState(verified, original)) {
      backup.exists = false;
      return true;
    }
    paths.add(item.artifact.path);
    return false;
  }

  private async finalize(runtime: readonly RuntimeArtifact[]): Promise<RecoveryResult> {
    const paths = new Set<string>();
    const causes: unknown[] = [];
    for (const item of runtime) {
      await this.removeOwned(item.temporary, paths, causes);
      await this.removeOwned(item.backup, paths, causes);
      this.syncSignalScope(runtime);
    }
    return recoveryResult(paths, causes);
  }

  private async recoveryUnlink(path: string, publicPath: string, paths: Set<string>, causes: unknown[]): Promise<void> {
    try {
      await this.operations.unlink(path);
    } catch (error: unknown) {
      if (!isEnoent(error)) causes.push(error);
    }
    const state = await this.recoveryState(path, publicPath, paths, causes);
    if (state === 'unknown' || state.status !== 'absent') paths.add(publicPath);
  }

  private async recoveryState(
    path: string,
    publicPath: string,
    paths: Set<string>,
    causes: unknown[],
  ): Promise<ArtifactState | 'unknown'> {
    try {
      return await this.destinationState(path);
    } catch (error: unknown) {
      paths.add(publicPath);
      causes.push(error);
      return 'unknown';
    }
  }

  private async removeOwned(owned: OwnedPath | undefined, paths: Set<string>, causes: unknown[]): Promise<void> {
    if (!owned?.exists) return;
    try {
      await this.operations.unlink(owned.path);
      owned.exists = false;
      return;
    } catch (error: unknown) {
      if (!isEnoent(error)) causes.push(error);
    }

    try {
      await this.operations.lstat(owned.path);
      paths.add(owned.publicPath);
    } catch (error: unknown) {
      if (isEnoent(error)) owned.exists = false;
      else {
        paths.add(owned.publicPath);
        causes.push(error);
      }
    }
  }

  private ownedPath(publicPath: string, suffix: 'tmp' | 'bak'): OwnedPath {
    return {
      path: join(dirname(publicPath), `.${basename(publicPath)}.${randomUUID()}.${suffix}`),
      publicPath,
      exists: false,
    };
  }

  private syncSignalScope(runtime: readonly RuntimeArtifact[]): void {
    const hasOwnedPaths = runtime.some(item => item.temporary?.exists || item.backup?.exists);
    if (hasOwnedPaths && !this.unregisterSignals) {
      this.unregisterSignals = this.signalRegistrar.register(signal => {
        this.interruptedBy ??= signal;
      });
    } else if (!hasOwnedPaths) {
      this.unregisterSignalHandlers();
    }
  }

  private unregisterSignalHandlers(): void {
    this.unregisterSignals?.();
    this.unregisterSignals = undefined;
  }

  private assertNotInterrupted(): void {
    if (this.interruptedBy) throw new TransactionInterruptedError(this.interruptedBy);
  }

  private applicationError(error: unknown, paths: readonly string[] = []): MigrationApplicationError {
    if (this.interruptedBy || error instanceof TransactionInterruptedError) {
      return this.interruptedError(paths, error);
    }
    if (error instanceof MigrationApplicationError && paths.length === 0) return error;
    return this.ioError(error, paths);
  }

  private interruptedError(paths: readonly string[], cause: unknown): MigrationApplicationError {
    return new MigrationApplicationError(
      'transaction-interrupted',
      'Migration transaction was interrupted.',
      sortedUnique(paths),
      { cause },
    );
  }

  private ioError(
    cause: unknown,
    paths: readonly string[],
    message = 'Migration transaction failed.',
  ): MigrationApplicationError {
    return new MigrationApplicationError('transaction-io', message, sortedUnique(paths), { cause });
  }
}

function sameState(left: ArtifactState, right: ArtifactState): boolean {
  if (left.status !== right.status) return false;
  if (left.status === 'absent') return true;
  return right.status === 'present' && left.contents === right.contents;
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing staged transaction artifact.');
  return value;
}

function isEnoent(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function recoveryResult(paths: Set<string>, causes: readonly unknown[]): RecoveryResult {
  return { paths: sortedUnique(paths), causes };
}

function sortedUnique(paths: Iterable<string>): readonly string[] {
  return [...new Set(paths)].sort(compareCodeUnits);
}
