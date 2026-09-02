import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, link, lstat, mkdir, open, rename, rmdir, unlink } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { MigrationApplicationError, type MigrationApplicationErrorCode } from '../migrator/migration-application.error';
import type { ArtifactState, MigrationPlan, PlannedOutputArtifact } from '../migrator/migration-plan';
import { AngularTemplateParser } from '../template/angular-template.parser';
import { compareCodeUnits } from '../util/compare-code-units';
import { TransactionSignalRegistrar, type TransactionSignalRegistrarLike } from './transaction-signal.registrar';

export interface MigrationTransactionFileHandle {
  writeFile(contents: string, encoding: BufferEncoding): Promise<void>;
  readFile(options: { readonly encoding: 'utf8' }): Promise<string>;
  stat(): Promise<MigrationTransactionStat>;
  sync(): Promise<void>;
  close(): Promise<void>;
}

export interface MigrationTransactionStat {
  readonly dev: number | bigint;
  readonly ino: number | bigint;
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
  unlink(path: string): Promise<void>;
}

const nodeOperations: MigrationTransactionOperations = {
  access,
  link,
  lstat,
  mkdir,
  open: (target, flags) => open(target, flags),
  rename,
  rmdir,
  unlink,
};

interface FileIdentity {
  readonly dev: string;
  readonly ino: string;
}

interface DirectoryExpectation {
  readonly path: string;
  readonly original: 'absent' | { readonly identity: FileIdentity; readonly kind: 'directory' | 'symbolic-link' };
}

interface CreatedDirectory {
  readonly path: string;
  identity?: FileIdentity;
  readonly publicPaths: Set<string>;
  exists: boolean;
}

interface OwnedNamespace {
  readonly path: string;
  identity?: FileIdentity;
  readonly publicPath: string;
  exists: boolean;
}

interface OwnedFile {
  readonly path: string;
  readonly publicPath: string;
  identity?: FileIdentity;
  exists: boolean;
  preserve: boolean;
}

interface ObservedPresentState {
  readonly status: 'present';
  readonly contents: string;
  readonly identity: FileIdentity;
}

type ObservedState = { readonly status: 'absent' } | ObservedPresentState;

interface RuntimeArtifact {
  readonly artifact: PlannedOutputArtifact;
  readonly directories: readonly DirectoryExpectation[];
  readonly quarantines: OwnedFile[];
  readonly ownedFiles: OwnedFile[];
  originalIdentity?: FileIdentity;
  namespace?: OwnedNamespace;
  stage?: OwnedFile;
  backup?: OwnedFile;
  openHandle?: MigrationTransactionFileHandle;
  installedIdentity?: FileIdentity;
}

interface TransactionContext {
  readonly items: readonly RuntimeArtifact[];
  readonly createdDirectories: Map<string, CreatedDirectory>;
  readonly unconfirmedEntries: Map<string, Set<string>>;
  readonly recoveryFailures: unknown[];
}

interface RecoveryOutcome {
  readonly paths: readonly string[];
  readonly failures: readonly unknown[];
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
    await this.preparePlan(plan);
  }

  async apply(plan: MigrationPlan): Promise<void> {
    const items = await this.preparePlan(plan);
    if (items.length === 0) return;

    this.interruptedBy = undefined;
    const context: TransactionContext = {
      items,
      createdDirectories: new Map(),
      unconfirmedEntries: new Map(),
      recoveryFailures: [],
    };
    try {
      await this.stage(context);
    } catch (error: unknown) {
      const recovery = await this.cleanupWithoutRollback(context);
      this.unregisterSignalHandlers();
      throw this.decorateFailure(error, recovery);
    }

    try {
      await this.commit(context);
      this.assertNotInterrupted();
    } catch (error: unknown) {
      const recovery = await this.rollback(context);
      this.unregisterSignalHandlers();
      throw this.decorateFailure(error, recovery);
    }

    const finalization = await this.finalizeCommitted(context);
    this.unregisterSignalHandlers();
    if (finalization.paths.length > 0 || finalization.failures.length > 0) {
      const cause = finalization.failures[0] ?? new Error('Transaction cleanup could not be confirmed.');
      throw new MigrationApplicationError(
        this.interruptedBy ? 'transaction-interrupted' : 'transaction-io',
        this.interruptedBy
          ? 'Migration transaction was interrupted during cleanup.'
          : 'Migration committed, but cleanup was incomplete.',
        finalization.paths,
        { cause, recoveryFailures: finalization.failures.slice(1) },
      );
    }
    if (this.interruptedBy) {
      throw new MigrationApplicationError('transaction-interrupted', 'Migration transaction was interrupted.', [], {
        cause: new TransactionInterruptedError(this.interruptedBy),
      });
    }
  }

  private async preparePlan(plan: MigrationPlan): Promise<readonly RuntimeArtifact[]> {
    this.rejectParseErrors(plan);
    const artifacts = [...plan.artifacts].sort((left, right) =>
      compareCodeUnits(resolve(left.path), resolve(right.path)),
    );
    for (let index = 1; index < artifacts.length; index++) {
      const previous = artifacts[index - 1];
      const current = artifacts[index];
      if (!previous || !current || previous.path !== current.path) continue;
      throw new MigrationApplicationError('path-collision', `Migration paths collide: ${current.path}`, [current.path]);
    }

    const items: RuntimeArtifact[] = [];
    for (const artifact of artifacts) {
      try {
        const directories = await this.inspectDirectoryChain(dirname(artifact.path), artifact.path);
        const item: RuntimeArtifact = { artifact, directories, quarantines: [], ownedFiles: [] };
        const current = await this.observePublic(item);
        if (!sameArtifactState(current, artifact.original)) throw this.concurrentModification(artifact.path);
        if (current.status === 'present') item.originalIdentity = current.identity;
        items.push(item);
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
    return items;
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

  private async inspectDirectoryChain(parent: string, publicPath: string): Promise<readonly DirectoryExpectation[]> {
    const result: DirectoryExpectation[] = [];
    let missing = false;
    for (const candidate of directoryChain(parent)) {
      if (missing) {
        result.push({ path: candidate, original: 'absent' });
        continue;
      }
      try {
        const stat = await this.operations.lstat(candidate);
        const isImmediateParent = candidate === resolve(parent);
        if ((!stat.isSymbolicLink() && !stat.isDirectory()) || (isImmediateParent && stat.isSymbolicLink())) {
          throw new MigrationApplicationError(
            'unsupported-path-type',
            `Migration destination parent must be a directory: ${candidate}`,
            [publicPath],
          );
        }
        result.push({
          path: candidate,
          original: { identity: identity(stat), kind: stat.isSymbolicLink() ? 'symbolic-link' : 'directory' },
        });
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

  private async stage(context: TransactionContext): Promise<void> {
    for (const item of context.items) await this.ensureParentDirectories(item, context);
    for (const item of context.items) await this.createNamespace(item, context);
    for (const item of context.items) {
      if (item.artifact.proposed.status === 'absent') continue;
      this.assertNotInterrupted();
      item.stage = await this.createOwnedFile(item, 'stage', item.artifact.proposed.contents, context);
      const staged = await this.readOwnedFile(item, item.stage);
      if (item.artifact.kind === 'template') this.validateStagedTemplate(item.artifact.path, staged);
    }
  }

  private async ensureParentDirectories(item: RuntimeArtifact, context: TransactionContext): Promise<void> {
    for (let index = 0; index < item.directories.length; index++) {
      this.assertNotInterrupted();
      const expectation = item.directories[index];
      if (!expectation) continue;
      if (expectation.original !== 'absent') {
        await this.assertDirectoryExpectation(expectation.path, expectation.original, item.artifact.path);
        continue;
      }
      const existingCreation = context.createdDirectories.get(expectation.path);
      if (existingCreation) {
        existingCreation.publicPaths.add(item.artifact.path);
        await this.assertDirectoryIdentity(expectation.path, required(existingCreation.identity), item.artifact.path);
        continue;
      }
      await this.assertExpectedAbsent(expectation.path, item.artifact.path);
      const parentExpectation = item.directories[index - 1];
      if (parentExpectation) await this.assertExpectedDirectory(parentExpectation, item, context);
      try {
        await this.operations.mkdir(expectation.path, { mode: 0o755 });
      } catch (error: unknown) {
        this.trackUnconfirmedEntry(context, expectation.path, item.artifact.path);
        throw error;
      }
      const created: CreatedDirectory = {
        path: expectation.path,
        publicPaths: new Set([item.artifact.path]),
        exists: true,
      };
      context.createdDirectories.set(expectation.path, created);
      this.syncSignalScope(context);
      const stat = await this.operations.lstat(expectation.path);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw this.concurrentModification(item.artifact.path);
      created.identity = identity(stat);
      if (parentExpectation) await this.assertExpectedDirectory(parentExpectation, item, context);
    }
    await this.assertParentChain(item, context);
  }

  private async createNamespace(item: RuntimeArtifact, context: TransactionContext): Promise<void> {
    await this.assertParentChain(item, context);
    const namespacePath = join(dirname(item.artifact.path), `.${basename(item.artifact.path)}.${randomUUID()}.txn`);
    await this.assertExpectedAbsent(namespacePath, item.artifact.path);
    try {
      await this.operations.mkdir(namespacePath, { mode: 0o700 });
    } catch (error: unknown) {
      this.trackUnconfirmedEntry(context, namespacePath, item.artifact.path);
      throw error;
    }
    item.namespace = { path: namespacePath, publicPath: item.artifact.path, exists: true };
    this.syncSignalScope(context);
    const stat = await this.operations.lstat(namespacePath);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw this.concurrentModification(item.artifact.path);
    item.namespace.identity = identity(stat);
    await this.assertParentChain(item, context);
  }

  private async createOwnedFile(
    item: RuntimeArtifact,
    name: string,
    contents: string,
    context: TransactionContext,
  ): Promise<OwnedFile> {
    await this.assertNamespace(item);
    const owned: OwnedFile = {
      path: join(required(item.namespace).path, name),
      publicPath: item.artifact.path,
      exists: false,
      preserve: false,
    };
    item.ownedFiles.push(owned);
    await this.assertExpectedAbsent(owned.path, item.artifact.path);
    const handle = await this.operations.open(owned.path, 'wx');
    owned.exists = true;
    item.openHandle = handle;
    this.syncSignalScope(context);
    owned.identity = identity(await handle.stat());
    this.assertNotInterrupted();
    await handle.writeFile(contents, 'utf8');
    this.assertNotInterrupted();
    await handle.sync();
    this.assertNotInterrupted();
    await handle.close();
    item.openHandle = undefined;
    this.assertNotInterrupted();
    await this.assertOwnedIdentity(item, owned);
    return owned;
  }

  private validateStagedTemplate(publicPath: string, contents: string): void {
    if (this.parser.parse(contents, publicPath).status !== 'parse-error') return;
    throw new MigrationApplicationError(
      'internal-invariant',
      `Staged template failed Angular validation: ${publicPath}`,
      [publicPath],
    );
  }

  private async commit(context: TransactionContext): Promise<void> {
    for (const item of context.items) {
      this.assertNotInterrupted();
      if (item.artifact.original.status === 'present') await this.captureOriginal(item, context);
      this.assertNotInterrupted();
      if (item.artifact.proposed.status === 'present') await this.installProposed(item, context);
    }
  }

  private async captureOriginal(item: RuntimeArtifact, context: TransactionContext): Promise<void> {
    const firstCapture = await this.observePublic(item, context);
    if (
      !sameArtifactState(firstCapture, item.artifact.original) ||
      firstCapture.status !== 'present' ||
      !item.originalIdentity ||
      !sameIdentity(firstCapture.identity, item.originalIdentity)
    ) {
      throw this.concurrentModification(item.artifact.path);
    }
    item.backup = await this.createOwnedFile(item, 'backup', firstCapture.contents, context);
    if ((await this.readOwnedFile(item, item.backup)) !== firstCapture.contents) {
      throw this.ownershipFailure(item.artifact.path);
    }
    const secondCapture = await this.observePublic(item, context);
    if (
      secondCapture.status !== 'present' ||
      !sameIdentity(secondCapture.identity, firstCapture.identity) ||
      secondCapture.contents !== firstCapture.contents
    ) {
      throw this.concurrentModification(item.artifact.path);
    }
    await this.quarantineOriginal(item, firstCapture, context);
  }

  private async quarantineOriginal(
    item: RuntimeArtifact,
    captured: ObservedPresentState,
    context: TransactionContext,
  ): Promise<void> {
    await this.assertParentChain(item, context);
    await this.assertNamespace(item);
    const immediatelyBefore = await this.observePublic(item, context);
    if (
      immediatelyBefore.status !== 'present' ||
      !sameIdentity(immediatelyBefore.identity, captured.identity) ||
      immediatelyBefore.contents !== captured.contents
    ) {
      throw this.concurrentModification(item.artifact.path);
    }
    const quarantine: OwnedFile = {
      path: join(required(item.namespace).path, `quarantine-${randomUUID()}`),
      publicPath: item.artifact.path,
      exists: false,
      preserve: false,
    };
    item.quarantines.push(quarantine);
    item.ownedFiles.push(quarantine);
    await this.assertExpectedAbsent(quarantine.path, item.artifact.path);
    let renameFailure: unknown;
    try {
      await this.operations.rename(item.artifact.path, quarantine.path);
    } catch (error: unknown) {
      renameFailure = error;
    }
    const quarantinedStat = await this.lstatOrAbsent(quarantine.path);
    if (quarantinedStat !== 'absent') {
      quarantine.exists = true;
      quarantine.identity = identity(quarantinedStat);
      const quarantinedContents = await this.readOwnedFile(item, quarantine);
      if (!sameIdentity(quarantine.identity, captured.identity) || quarantinedContents !== captured.contents) {
        quarantine.preserve = true;
        await this.restorePreservedQuarantine(item, quarantine, context);
        throw this.concurrentModification(item.artifact.path, renameFailure);
      }
      const destination = await this.lstatOrAbsent(item.artifact.path);
      if (renameFailure !== undefined) throw renameFailure;
      if (destination !== 'absent') throw this.concurrentModification(item.artifact.path);
      await this.assertParentChain(item, context);
      return;
    }
    const destination = await this.lstatOrAbsent(item.artifact.path);
    if (
      renameFailure !== undefined &&
      destination !== 'absent' &&
      sameIdentity(identity(destination), captured.identity)
    ) {
      throw renameFailure;
    }
    throw this.concurrentModification(item.artifact.path, renameFailure);
  }

  private async installProposed(item: RuntimeArtifact, context: TransactionContext): Promise<void> {
    const stage = required(item.stage);
    await this.assertOwnedIdentity(item, stage);
    await this.assertParentChain(item, context);
    await this.assertExpectedAbsent(item.artifact.path, item.artifact.path);
    let linkFailure: unknown;
    try {
      await this.operations.link(stage.path, item.artifact.path);
    } catch (error: unknown) {
      linkFailure = error;
    }
    const destination = await this.lstatOrAbsent(item.artifact.path);
    if (destination !== 'absent' && stage.identity && sameIdentity(identity(destination), stage.identity)) {
      item.installedIdentity = stage.identity;
      await this.assertParentChain(item, context);
      if (linkFailure !== undefined) throw linkFailure;
      return;
    }
    if (destination !== 'absent') throw this.concurrentModification(item.artifact.path, linkFailure);
    if (linkFailure !== undefined) throw linkFailure;
    throw this.ownershipFailure(item.artifact.path);
  }

  private async restorePreservedQuarantine(
    item: RuntimeArtifact,
    quarantine: OwnedFile,
    context: TransactionContext,
    failures: unknown[] = context.recoveryFailures,
  ): Promise<void> {
    const quarantineIdentity = required(quarantine.identity);
    if ((await this.lstatOrAbsent(item.artifact.path)) !== 'absent') return;
    try {
      await this.operations.link(quarantine.path, item.artifact.path);
    } catch (error: unknown) {
      failures.push(error);
    }
    const destination = await this.lstatOrAbsent(item.artifact.path);
    if (destination !== 'absent' && sameIdentity(identity(destination), quarantineIdentity)) {
      quarantine.preserve = false;
    }
  }

  private async rollback(context: TransactionContext): Promise<RecoveryOutcome> {
    const failures = [...context.recoveryFailures];
    const cleanupPaths = new Set<string>();
    for (const item of [...context.items].reverse()) await this.restoreOriginal(item, context, failures);
    const restored = new Map<RuntimeArtifact, boolean>();
    for (const item of context.items) restored.set(item, await this.verifyOriginal(item, context, failures));
    for (const item of [...context.items].reverse()) {
      await this.closeOpenHandle(item, failures);
      for (const owned of [...item.ownedFiles].reverse()) {
        if (owned === item.backup && !restored.get(item)) {
          if (owned.exists) cleanupPaths.add(item.artifact.path);
          continue;
        }
        await this.removeOwnedFile(item, owned, cleanupPaths, failures);
      }
      await this.removeNamespace(item, cleanupPaths, failures);
      this.syncSignalScope(context);
    }
    await this.removeCreatedDirectories(context, cleanupPaths, failures);
    await this.collectUnconfirmedPaths(context, cleanupPaths, failures);
    const paths = new Set(cleanupPaths);
    for (const item of context.items) {
      if (!(await this.verifyOriginal(item, context, failures))) paths.add(item.artifact.path);
    }
    return recoveryOutcome(paths, failures);
  }

  private async restoreOriginal(
    item: RuntimeArtifact,
    context: TransactionContext,
    failures: unknown[],
  ): Promise<void> {
    let current: ObservedState | 'unknown';
    try {
      current = await this.observePublic(item, context);
    } catch (error: unknown) {
      failures.push(error);
      current = 'unknown';
    }
    if (current !== 'unknown' && sameArtifactState(current, item.artifact.original)) return;
    if (current !== 'unknown' && current.status === 'present') {
      if (
        !item.installedIdentity ||
        !sameIdentity(current.identity, item.installedIdentity) ||
        item.artifact.proposed.status !== 'present' ||
        current.contents !== item.artifact.proposed.contents
      ) {
        if (item.stage && item.installedIdentity && sameIdentity(current.identity, item.installedIdentity)) {
          item.stage.preserve = true;
        }
        return;
      }
      if (!(await this.recoveryQuarantine(item, current, context, failures))) return;
    } else if (current === 'unknown') {
      return;
    }
    if (item.artifact.original.status === 'absent') return;
    const backup = item.backup;
    if (!backup) return;
    try {
      if ((await this.readOwnedFile(item, backup)) !== item.artifact.original.contents) return;
      await this.assertParentChain(item, context);
      await this.assertExpectedAbsent(item.artifact.path, item.artifact.path);
      try {
        await this.operations.link(backup.path, item.artifact.path);
      } catch (error: unknown) {
        failures.push(error);
      }
    } catch (error: unknown) {
      failures.push(error);
    }
  }

  private async recoveryQuarantine(
    item: RuntimeArtifact,
    current: ObservedPresentState,
    context: TransactionContext,
    failures: unknown[],
  ): Promise<boolean> {
    const quarantine: OwnedFile = {
      path: join(required(item.namespace).path, `quarantine-rollback-${randomUUID()}`),
      publicPath: item.artifact.path,
      exists: false,
      preserve: false,
    };
    item.quarantines.push(quarantine);
    item.ownedFiles.push(quarantine);
    try {
      await this.assertParentChain(item, context);
      await this.assertNamespace(item);
      const before = await this.observePublic(item, context);
      if (
        before.status !== 'present' ||
        !sameIdentity(before.identity, current.identity) ||
        before.contents !== current.contents
      ) {
        return false;
      }
      await this.assertExpectedAbsent(quarantine.path, item.artifact.path);
      try {
        await this.operations.rename(item.artifact.path, quarantine.path);
      } catch (error: unknown) {
        failures.push(error);
      }
      const quarantined = await this.lstatOrAbsent(quarantine.path);
      if (quarantined === 'absent') return false;
      quarantine.exists = true;
      quarantine.identity = identity(quarantined);
      quarantine.preserve = true;
      if (!sameIdentity(quarantine.identity, current.identity)) {
        await this.restorePreservedQuarantine(item, quarantine, context, failures);
        return false;
      }
      if ((await this.readOwnedFile(item, quarantine)) !== current.contents) {
        await this.restorePreservedQuarantine(item, quarantine, context, failures);
        return false;
      }
      quarantine.preserve = false;
      return (await this.lstatOrAbsent(item.artifact.path)) === 'absent';
    } catch (error: unknown) {
      failures.push(error);
      return false;
    }
  }

  private async cleanupWithoutRollback(context: TransactionContext): Promise<RecoveryOutcome> {
    const failures = [...context.recoveryFailures];
    const cleanupPaths = new Set<string>();
    for (const item of [...context.items].reverse()) {
      await this.closeOpenHandle(item, failures);
      for (const owned of [...item.ownedFiles].reverse()) {
        await this.removeOwnedFile(item, owned, cleanupPaths, failures);
      }
      await this.removeNamespace(item, cleanupPaths, failures);
      this.syncSignalScope(context);
    }
    await this.removeCreatedDirectories(context, cleanupPaths, failures);
    await this.collectUnconfirmedPaths(context, cleanupPaths, failures);
    const paths = new Set(cleanupPaths);
    for (const item of context.items) {
      if (!(await this.verifyOriginal(item, context, failures))) paths.add(item.artifact.path);
    }
    return recoveryOutcome(paths, failures);
  }

  private async finalizeCommitted(context: TransactionContext): Promise<RecoveryOutcome> {
    const failures = [...context.recoveryFailures];
    const paths = new Set<string>();
    for (const item of context.items) {
      for (const owned of item.ownedFiles) await this.removeOwnedFile(item, owned, paths, failures);
      await this.removeNamespace(item, paths, failures);
      this.syncSignalScope(context);
    }
    await this.removeCreatedDirectories(context, paths, failures);
    await this.collectUnconfirmedPaths(context, paths, failures);
    return recoveryOutcome(paths, failures);
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

  private async removeOwnedFile(
    item: RuntimeArtifact,
    owned: OwnedFile | undefined,
    paths: Set<string>,
    failures: unknown[],
  ): Promise<void> {
    if (!owned?.exists) return;
    if (owned.preserve || !owned.identity) {
      paths.add(owned.publicPath);
      return;
    }
    try {
      await this.assertNamespace(item);
      const before = await this.operations.lstat(owned.path);
      if (!sameIdentity(identity(before), owned.identity) || before.isSymbolicLink() || !before.isFile()) {
        paths.add(owned.publicPath);
        failures.push(new Error('Invocation-owned file identity could not be confirmed.'));
        return;
      }
    } catch (error: unknown) {
      if (isEnoent(error)) {
        owned.exists = false;
        return;
      }
      paths.add(owned.publicPath);
      failures.push(error);
      return;
    }
    try {
      await this.operations.unlink(owned.path);
    } catch (error: unknown) {
      if (!isEnoent(error)) failures.push(error);
    }
    try {
      await this.operations.lstat(owned.path);
      paths.add(owned.publicPath);
    } catch (error: unknown) {
      if (isEnoent(error)) owned.exists = false;
      else {
        paths.add(owned.publicPath);
        failures.push(error);
      }
    }
  }

  private async removeNamespace(item: RuntimeArtifact, paths: Set<string>, failures: unknown[]): Promise<void> {
    const namespace = item.namespace;
    if (!namespace?.exists) return;
    if (!namespace.identity) {
      paths.add(namespace.publicPath);
      return;
    }
    try {
      const stat = await this.operations.lstat(namespace.path);
      if (!sameIdentity(identity(stat), namespace.identity) || stat.isSymbolicLink() || !stat.isDirectory()) {
        paths.add(namespace.publicPath);
        failures.push(new Error('Invocation namespace identity could not be confirmed.'));
        return;
      }
    } catch (error: unknown) {
      if (isEnoent(error)) {
        namespace.exists = false;
        return;
      }
      paths.add(namespace.publicPath);
      failures.push(error);
      return;
    }
    try {
      await this.operations.rmdir(namespace.path);
    } catch (error: unknown) {
      if (!isDirectoryNotEmpty(error) && !isEnoent(error)) failures.push(error);
    }
    try {
      await this.operations.lstat(namespace.path);
      paths.add(namespace.publicPath);
    } catch (error: unknown) {
      if (isEnoent(error)) namespace.exists = false;
      else {
        paths.add(namespace.publicPath);
        failures.push(error);
      }
    }
  }

  private async removeCreatedDirectories(
    context: TransactionContext,
    paths: Set<string>,
    failures: unknown[],
  ): Promise<void> {
    const directories = [...context.createdDirectories.values()].sort(
      (left, right) => pathDepth(right.path) - pathDepth(left.path) || compareCodeUnits(right.path, left.path),
    );
    for (const directory of directories) {
      if (!directory.exists) continue;
      if (!directory.identity) {
        for (const publicPath of directory.publicPaths) paths.add(publicPath);
        continue;
      }
      try {
        const stat = await this.operations.lstat(directory.path);
        if (!sameIdentity(identity(stat), directory.identity) || stat.isSymbolicLink() || !stat.isDirectory()) {
          for (const publicPath of directory.publicPaths) paths.add(publicPath);
          continue;
        }
        await this.operations.rmdir(directory.path);
      } catch (error: unknown) {
        if (isEnoent(error)) directory.exists = false;
        else if (!isDirectoryNotEmpty(error)) {
          for (const publicPath of directory.publicPaths) paths.add(publicPath);
          failures.push(error);
        }
        continue;
      }
      directory.exists = false;
      this.syncSignalScope(context);
    }
  }

  private trackUnconfirmedEntry(context: TransactionContext, path: string, publicPath: string): void {
    const publicPaths = context.unconfirmedEntries.get(path) ?? new Set<string>();
    publicPaths.add(publicPath);
    context.unconfirmedEntries.set(path, publicPaths);
  }

  private async collectUnconfirmedPaths(
    context: TransactionContext,
    paths: Set<string>,
    failures: unknown[],
  ): Promise<void> {
    for (const [candidate, publicPaths] of context.unconfirmedEntries) {
      try {
        await this.operations.lstat(candidate);
      } catch (error: unknown) {
        if (isEnoent(error)) continue;
        failures.push(error);
      }
      for (const publicPath of publicPaths) paths.add(publicPath);
    }
  }

  private async verifyOriginal(
    item: RuntimeArtifact,
    context: TransactionContext,
    failures: unknown[],
  ): Promise<boolean> {
    try {
      return sameArtifactState(await this.observePublic(item, context), item.artifact.original);
    } catch (error: unknown) {
      failures.push(error);
      return false;
    }
  }

  private async observePublic(item: RuntimeArtifact, context?: TransactionContext): Promise<ObservedState> {
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
    let contents: string;
    try {
      const handleBefore = identity(await handle.stat());
      if (!sameIdentity(beforeIdentity, handleBefore)) throw this.concurrentModification(item.artifact.path);
      contents = await handle.readFile({ encoding: 'utf8' });
      const handleAfter = identity(await handle.stat());
      if (!sameIdentity(handleBefore, handleAfter)) throw this.concurrentModification(item.artifact.path);
    } finally {
      await handle.close();
    }
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
    return { status: 'present', contents, identity: beforeIdentity };
  }

  private async readOwnedFile(item: RuntimeArtifact, owned: OwnedFile): Promise<string> {
    await this.assertOwnedIdentity(item, owned);
    const expected = required(owned.identity);
    const handle = await this.operations.open(owned.path, 'r');
    let contents: string;
    try {
      const before = identity(await handle.stat());
      if (!sameIdentity(before, expected)) throw this.ownershipFailure(owned.publicPath);
      contents = await handle.readFile({ encoding: 'utf8' });
      const after = identity(await handle.stat());
      if (!sameIdentity(after, expected)) throw this.ownershipFailure(owned.publicPath);
    } finally {
      await handle.close();
    }
    await this.assertOwnedIdentity(item, owned);
    return contents;
  }

  private async assertOwnedIdentity(item: RuntimeArtifact, owned: OwnedFile): Promise<void> {
    await this.assertNamespace(item);
    if (!owned.identity) throw this.ownershipFailure(owned.publicPath);
    const stat = await this.operations.lstat(owned.path);
    if (stat.isSymbolicLink() || !stat.isFile() || !sameIdentity(identity(stat), owned.identity)) {
      throw this.ownershipFailure(owned.publicPath);
    }
    await this.assertNamespace(item);
  }

  private async assertNamespace(item: RuntimeArtifact): Promise<void> {
    const namespace = required(item.namespace);
    const expectedIdentity = required(namespace.identity);
    const stat = await this.operations.lstat(namespace.path);
    if (stat.isSymbolicLink() || !stat.isDirectory() || !sameIdentity(identity(stat), expectedIdentity)) {
      throw this.ownershipFailure(namespace.publicPath);
    }
  }

  private async assertParentChain(item: RuntimeArtifact, context?: TransactionContext): Promise<void> {
    for (const expectation of item.directories) await this.assertExpectedDirectory(expectation, item, context);
  }

  private async assertExpectedDirectory(
    expectation: DirectoryExpectation,
    item: RuntimeArtifact,
    context?: TransactionContext,
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
    let stat: MigrationTransactionStat;
    try {
      stat = await this.operations.lstat(path);
    } catch (error: unknown) {
      throw this.concurrentModification(publicPath, error);
    }
    const kind = stat.isSymbolicLink() ? 'symbolic-link' : stat.isDirectory() ? 'directory' : undefined;
    if (kind !== expected.kind || !sameIdentity(identity(stat), expected.identity)) {
      throw this.concurrentModification(publicPath);
    }
  }

  private async assertDirectoryIdentity(path: string, expected: FileIdentity, publicPath: string): Promise<void> {
    let stat: MigrationTransactionStat;
    try {
      stat = await this.operations.lstat(path);
    } catch (error: unknown) {
      throw this.concurrentModification(publicPath, error);
    }
    if (stat.isSymbolicLink() || !stat.isDirectory() || !sameIdentity(identity(stat), expected)) {
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

  private decorateFailure(error: unknown, recovery: RecoveryOutcome): MigrationApplicationError {
    const interrupted = this.interruptedBy !== undefined || error instanceof TransactionInterruptedError;
    const applicationError = error instanceof MigrationApplicationError ? error : undefined;
    const code: MigrationApplicationErrorCode = interrupted
      ? 'transaction-interrupted'
      : (applicationError?.code ?? 'transaction-io');
    const validationPaths =
      applicationError && applicationError.code !== 'transaction-io' ? applicationError.paths : [];
    const paths = sortedUnique([...validationPaths, ...recovery.paths]);
    const cause = applicationError?.cause ?? error;
    const recoveryFailures = [...(applicationError?.recoveryFailures ?? []), ...recovery.failures];
    return new MigrationApplicationError(
      code,
      interrupted
        ? 'Migration transaction was interrupted.'
        : (applicationError?.message ?? 'Migration transaction failed.'),
      paths,
      { cause, recoveryFailures },
    );
  }

  private syncSignalScope(context: TransactionContext): void {
    const hasOwnedArtifacts =
      [...context.createdDirectories.values()].some(directory => directory.exists) ||
      context.items.some(
        item =>
          item.namespace?.exists ||
          item.stage?.exists ||
          item.backup?.exists ||
          item.quarantines.some(quarantine => quarantine.exists),
      );
    if (hasOwnedArtifacts && !this.unregisterSignals) {
      this.unregisterSignals = this.signalRegistrar.register(signal => {
        this.interruptedBy ??= signal;
      });
    } else if (!hasOwnedArtifacts) {
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
}

function identity(stat: MigrationTransactionStat): FileIdentity {
  return { dev: String(stat.dev), ino: String(stat.ino) };
}

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameArtifactState(left: ObservedState, right: ArtifactState): boolean {
  if (left.status !== right.status) return false;
  if (left.status === 'absent') return true;
  return right.status === 'present' && left.contents === right.contents;
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

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing transaction state.');
  return value;
}

function isEnoent(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function isDirectoryNotEmpty(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'ENOTEMPTY' || error.code === 'EEXIST')
  );
}

function pathDepth(path: string): number {
  return path.split(/[\\/]/u).filter(Boolean).length;
}

function recoveryOutcome(paths: Iterable<string>, failures: readonly unknown[]): RecoveryOutcome {
  return { paths: sortedUnique(paths), failures: Object.freeze([...failures]) };
}

function sortedUnique(paths: Iterable<string>): readonly string[] {
  return [...new Set(paths)].sort(compareCodeUnits);
}
