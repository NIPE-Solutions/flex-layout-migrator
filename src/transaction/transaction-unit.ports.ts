import type { PlannedOutputArtifact } from '../migrator/migration-plan';
import type {
  DirectoryExpectation,
  FileIdentity,
  MigrationTransactionStat,
  ObservedState,
} from './transaction-unit.state';

export interface OwnedFileView {
  readonly path: string;
  readonly publicPath: string;
  readonly identity?: FileIdentity;
  readonly exists: boolean;
  readonly preserve: boolean;
}

export interface OwnedNamespaceView {
  readonly path: string;
  readonly publicPath: string;
  readonly identity?: FileIdentity;
  readonly exists: boolean;
}

export interface CreatedDirectoryView {
  readonly path: string;
  readonly identity?: FileIdentity;
  readonly publicPaths: readonly string[];
  readonly exists: boolean;
}

export interface UnconfirmedEntryView {
  readonly path: string;
  readonly publicPaths: readonly string[];
}

export interface StagingArtifactView {
  readonly artifact: PlannedOutputArtifact;
  readonly directories: readonly DirectoryExpectation[];
  readonly originalMode?: number;
  readonly stagingPath?: string;
}

export interface CommitArtifactView {
  readonly artifact: PlannedOutputArtifact;
  readonly originalIdentity?: FileIdentity;
  readonly namespace?: OwnedNamespaceView;
  readonly stage?: OwnedFileView;
  readonly backup?: OwnedFileView;
  readonly quarantines: readonly OwnedFileView[];
  readonly installedIdentity?: FileIdentity;
}

export interface RollbackArtifactView {
  readonly artifact: PlannedOutputArtifact;
  readonly originalIdentity?: FileIdentity;
  readonly namespace?: OwnedNamespaceView;
  readonly stage?: OwnedFileView;
  readonly backup?: OwnedFileView;
  readonly installedIdentity?: FileIdentity;
  readonly restoredIdentity?: FileIdentity;
}

export interface CleanupArtifactView {
  readonly artifact: PlannedOutputArtifact;
  readonly directories: readonly DirectoryExpectation[];
  readonly originalIdentity?: FileIdentity;
  readonly namespace?: OwnedNamespaceView;
  readonly ownedFiles: readonly OwnedFileView[];
  readonly backupPath?: string;
  readonly restoredIdentity?: FileIdentity;
}

export interface StagingJournal {
  prepare(artifacts: readonly PlannedOutputArtifact[]): Promise<void>;
  artifacts(): readonly StagingArtifactView[];
  createdDirectory(path: string): CreatedDirectoryView | undefined;
  addCreatedDirectoryPublicPath(path: string, publicPath: string): void;
  recordUnconfirmedEntry(path: string, publicPath: string): void;
  recordCreatedDirectory(path: string, publicPath: string): void;
  confirmCreatedDirectory(path: string, identity: FileIdentity): void;
  recordNamespace(item: StagingArtifactView, path: string): void;
  confirmNamespace(item: StagingArtifactView, identity: FileIdentity): void;
}

export interface StagingPort {
  readonly journal: StagingJournal;
  assertDirectoryExpectation(
    path: string,
    expected: Exclude<DirectoryExpectation['original'], 'absent'>,
    publicPath: string,
  ): Promise<void>;
  assertDirectoryIdentity(path: string, expected: FileIdentity, publicPath: string): Promise<void>;
  assertExpectedAbsent(path: string, publicPath: string): Promise<void>;
  assertExpectedDirectory(expectation: DirectoryExpectation, item: StagingArtifactView): Promise<void>;
  assertNotInterrupted(signal: AbortSignal): void;
  assertParentChain(item: StagingArtifactView): Promise<void>;
  concurrentModification(publicPath: string, cause?: unknown): Error;
  createStageFile(
    item: StagingArtifactView,
    contents: string,
    signal: AbortSignal,
    mode?: number,
  ): Promise<OwnedFileView>;
  lstat(path: string): Promise<MigrationTransactionStat>;
  mkdir(path: string, options?: { readonly recursive?: boolean; readonly mode?: number }): Promise<unknown>;
  readOwnedFile(item: StagingArtifactView, ownedPath: string): Promise<string>;
  validateStagedTemplate(publicPath: string, contents: string): void;
}

export interface CommitJournal {
  artifact(artifact: PlannedOutputArtifact): CommitArtifactView;
  artifacts(): readonly CommitArtifactView[];
  addQuarantine(item: CommitArtifactView, path: string): OwnedFileView;
  confirmOwnedFile(item: CommitArtifactView, ownedPath: string, identity: FileIdentity): OwnedFileView;
  setOwnedFilePreserved(item: CommitArtifactView, ownedPath: string, preserve: boolean): void;
  recordInstalledIdentity(item: CommitArtifactView, identity: FileIdentity): void;
  recordRecoveryFailure(error: unknown): void;
}

export interface CommitPort {
  readonly journal: CommitJournal;
  assertExpectedAbsent(path: string, publicPath: string): Promise<void>;
  assertNamespace(item: CommitArtifactView): Promise<void>;
  assertNotInterrupted(signal: AbortSignal): void;
  assertOwnedIdentity(item: CommitArtifactView, ownedPath: string): Promise<void>;
  assertParentChain(item: CommitArtifactView): Promise<void>;
  concurrentModification(publicPath: string, cause?: unknown): Error;
  createBackupFile(
    item: CommitArtifactView,
    contents: string,
    signal: AbortSignal,
    mode?: number,
  ): Promise<OwnedFileView>;
  link(existingPath: string, newPath: string): Promise<void>;
  lstatOrAbsent(path: string): Promise<MigrationTransactionStat | 'absent'>;
  observePublic(item: CommitArtifactView): Promise<ObservedState>;
  ownershipFailure(publicPath: string): Error;
  readOwnedFile(item: CommitArtifactView, ownedPath: string): Promise<string>;
  rename(source: string, destination: string): Promise<void>;
}

export interface RollbackJournal {
  artifact(artifact: PlannedOutputArtifact): RollbackArtifactView;
  artifacts(): readonly RollbackArtifactView[];
  recoveryFailures(): readonly unknown[];
  addQuarantine(item: RollbackArtifactView, path: string): OwnedFileView;
  confirmOwnedFile(item: RollbackArtifactView, ownedPath: string, identity: FileIdentity): OwnedFileView;
  setOwnedFilePreserved(item: RollbackArtifactView, ownedPath: string, preserve: boolean): void;
  recordRestoredIdentity(item: RollbackArtifactView, identity: FileIdentity): void;
  recordRestored(item: RollbackArtifactView, restored: boolean): void;
}

export interface RollbackPort {
  readonly journal: RollbackJournal;
  assertExpectedAbsent(path: string, publicPath: string): Promise<void>;
  assertNamespace(item: RollbackArtifactView): Promise<void>;
  assertParentChain(item: RollbackArtifactView): Promise<void>;
  link(existingPath: string, newPath: string): Promise<void>;
  lstatOrAbsent(path: string): Promise<MigrationTransactionStat | 'absent'>;
  observePublic(item: RollbackArtifactView): Promise<ObservedState>;
  readOwnedFile(item: RollbackArtifactView, ownedPath: string): Promise<string>;
  rename(source: string, destination: string): Promise<void>;
}

export interface CleanupJournal {
  artifact(artifact: PlannedOutputArtifact): CleanupArtifactView;
  artifacts(): readonly CleanupArtifactView[];
  createdDirectories(): readonly CreatedDirectoryView[];
  unconfirmedEntries(): readonly UnconfirmedEntryView[];
  restored(item: CleanupArtifactView): boolean | undefined;
  markOwnedFileAbsent(item: CleanupArtifactView, ownedPath: string): void;
  markNamespaceAbsent(item: CleanupArtifactView): void;
  markCreatedDirectoryAbsent(path: string): void;
  finishArtifactCleanup(): void;
}

export interface CleanupPort {
  readonly journal: CleanupJournal;
  assertNamespace(item: CleanupArtifactView): Promise<void>;
  closeReadHandles(item: CleanupArtifactView, failures: unknown[]): Promise<void>;
  closeOpenHandle(item: CleanupArtifactView, failures: unknown[]): Promise<void>;
  lstat(path: string): Promise<MigrationTransactionStat>;
  lstatOrAbsent(path: string): Promise<MigrationTransactionStat | 'absent'>;
  observePublic(item: CleanupArtifactView): Promise<ObservedState>;
  rmdir(path: string): Promise<void>;
  unlink(path: string): Promise<void>;
}
