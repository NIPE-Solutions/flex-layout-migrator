import type { PlannedOutputArtifact } from '../migrator/migration-plan';
import type {
  DirectoryExpectation,
  FileIdentity,
  MigrationTransactionStat,
  ObservedState,
  OwnedFile,
  RuntimeArtifact,
  TransactionUnitContext,
} from './transaction-unit.state';

export type StagingJournal = Pick<
  TransactionUnitContext,
  'items' | 'createdDirectories' | 'unconfirmedEntries' | 'ownershipChanged'
>;

export interface StagingPort {
  readonly journal: StagingJournal;
  prepare(artifacts: readonly PlannedOutputArtifact[]): Promise<readonly RuntimeArtifact[]>;
  assertDirectoryExpectation(
    path: string,
    expected: Exclude<DirectoryExpectation['original'], 'absent'>,
    publicPath: string,
  ): Promise<void>;
  assertDirectoryIdentity(path: string, expected: FileIdentity, publicPath: string): Promise<void>;
  assertExpectedAbsent(path: string, publicPath: string): Promise<void>;
  assertExpectedDirectory(expectation: DirectoryExpectation, item: RuntimeArtifact): Promise<void>;
  assertNotInterrupted(signal: AbortSignal): void;
  assertParentChain(item: RuntimeArtifact): Promise<void>;
  concurrentModification(publicPath: string, cause?: unknown): Error;
  createOwnedFile(
    item: RuntimeArtifact,
    name: 'backup' | 'stage',
    contents: string,
    signal: AbortSignal,
    mode?: number,
  ): Promise<OwnedFile>;
  lstat(path: string): Promise<MigrationTransactionStat>;
  mkdir(path: string, options?: { readonly recursive?: boolean; readonly mode?: number }): Promise<unknown>;
  readOwnedFile(item: RuntimeArtifact, owned: OwnedFile): Promise<string>;
  validateStagedTemplate(publicPath: string, contents: string): void;
}

export type CommitJournal = Pick<TransactionUnitContext, 'items' | 'recoveryFailures'>;

export interface CommitPort {
  readonly journal: CommitJournal;
  assertExpectedAbsent(path: string, publicPath: string): Promise<void>;
  assertNamespace(item: RuntimeArtifact): Promise<void>;
  assertNotInterrupted(signal: AbortSignal): void;
  assertOwnedIdentity(item: RuntimeArtifact, owned: OwnedFile): Promise<void>;
  assertParentChain(item: RuntimeArtifact): Promise<void>;
  concurrentModification(publicPath: string, cause?: unknown): Error;
  createOwnedFile(
    item: RuntimeArtifact,
    name: 'backup' | 'stage',
    contents: string,
    signal: AbortSignal,
    mode?: number,
  ): Promise<OwnedFile>;
  link(existingPath: string, newPath: string): Promise<void>;
  lstatOrAbsent(path: string): Promise<MigrationTransactionStat | 'absent'>;
  observePublic(item: RuntimeArtifact): Promise<ObservedState>;
  ownershipFailure(publicPath: string): Error;
  readOwnedFile(item: RuntimeArtifact, owned: OwnedFile): Promise<string>;
  rename(source: string, destination: string): Promise<void>;
  runtimeArtifact(artifact: PlannedOutputArtifact): RuntimeArtifact;
}

export type RollbackJournal = Pick<TransactionUnitContext, 'items' | 'recoveryFailures' | 'restored'>;

export interface RollbackPort {
  readonly journal: RollbackJournal;
  assertExpectedAbsent(path: string, publicPath: string): Promise<void>;
  assertNamespace(item: RuntimeArtifact): Promise<void>;
  assertParentChain(item: RuntimeArtifact): Promise<void>;
  link(existingPath: string, newPath: string): Promise<void>;
  lstatOrAbsent(path: string): Promise<MigrationTransactionStat | 'absent'>;
  observePublic(item: RuntimeArtifact): Promise<ObservedState>;
  readOwnedFile(item: RuntimeArtifact, owned: OwnedFile): Promise<string>;
  rename(source: string, destination: string): Promise<void>;
  runtimeArtifact(artifact: PlannedOutputArtifact): RuntimeArtifact;
}

export type CleanupJournal = Pick<
  TransactionUnitContext,
  'items' | 'createdDirectories' | 'unconfirmedEntries' | 'restored' | 'ownershipChanged'
>;

export interface CleanupPort {
  readonly journal: CleanupJournal;
  assertNamespace(item: RuntimeArtifact): Promise<void>;
  closeReadHandles(item: RuntimeArtifact, failures: unknown[]): Promise<void>;
  lstat(path: string): Promise<MigrationTransactionStat>;
  lstatOrAbsent(path: string): Promise<MigrationTransactionStat | 'absent'>;
  observePublic(item: RuntimeArtifact): Promise<ObservedState>;
  rmdir(path: string): Promise<void>;
  runtimeArtifact(artifact: PlannedOutputArtifact): RuntimeArtifact;
  unlink(path: string): Promise<void>;
}
