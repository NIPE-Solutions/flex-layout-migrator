import { MigrationApplicationError } from '../migrator/migration-application.error';
import type { ArtifactState, PlannedOutputArtifact } from '../migrator/migration-plan';
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

export function runtimeArtifact(
  context: Pick<TransactionUnitContext, 'items'>,
  artifact: PlannedOutputArtifact,
): RuntimeArtifact {
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
