import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, rename, rmdir, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

interface AtomicFileIdentity {
  readonly dev: string;
  readonly ino: string;
}

export interface AtomicFileStat {
  readonly dev: number | bigint;
  readonly ino: number | bigint;
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
}

export interface AtomicFileHandle {
  writeFile(contents: string, encoding: BufferEncoding): Promise<void>;
  stat(): Promise<AtomicFileStat>;
  sync(): Promise<void>;
  close(): Promise<void>;
}

export interface AtomicFileOperations {
  mkdir(path: string, options?: { readonly recursive?: boolean; readonly mode?: number }): Promise<unknown>;
  open(path: string, flags: 'wx'): Promise<AtomicFileHandle>;
  lstat(path: string): Promise<AtomicFileStat>;
  rename(source: string, destination: string): Promise<void>;
  rmdir(path: string): Promise<void>;
  unlink(path: string): Promise<void>;
}

const defaultOperations: AtomicFileOperations = { lstat, mkdir, open, rename, rmdir, unlink };

export class AtomicFileWriter {
  constructor(private readonly operations: AtomicFileOperations = defaultOperations) {}

  async write(targetPath: string, contents: string): Promise<void> {
    const directory = dirname(targetPath);
    const namespacePath = join(directory, `.${basename(targetPath)}.${randomUUID()}.txn`);
    const temporaryPath = join(namespacePath, 'stage');

    await this.operations.mkdir(directory, { recursive: true });
    await this.operations.mkdir(namespacePath, { mode: 0o700 });
    const namespaceIdentity = await this.captureNamespaceIdentity(namespacePath, targetPath);
    let temporaryFile: AtomicFileHandle | undefined;
    let temporaryIdentity: AtomicFileIdentity | undefined;
    try {
      temporaryFile = await this.operations.open(temporaryPath, 'wx');
      temporaryIdentity = identity(await temporaryFile.stat());
      await temporaryFile.writeFile(contents, 'utf8');
      await temporaryFile.sync();
      await temporaryFile.close();
      temporaryFile = undefined;
      await this.assertNamespaceIdentity(namespacePath, namespaceIdentity, targetPath);
      await this.assertTemporaryIdentity(temporaryPath, temporaryIdentity, targetPath);
      await this.operations.rename(temporaryPath, targetPath);
    } catch (error: unknown) {
      await temporaryFile?.close().catch(() => undefined);
      const cleanupConfirmed = await this.cleanupOwnedTemporary(
        namespacePath,
        namespaceIdentity,
        temporaryPath,
        temporaryIdentity,
        targetPath,
      );
      if (!cleanupConfirmed) throw cleanupError(targetPath, error);
      throw error;
    }
    if (!(await this.cleanupNamespace(namespacePath, namespaceIdentity, targetPath))) {
      throw cleanupError(targetPath);
    }
  }

  private async captureNamespaceIdentity(path: string, targetPath: string): Promise<AtomicFileIdentity> {
    const stat = await this.operations.lstat(path);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw ownershipError(targetPath);
    return identity(stat);
  }

  private async assertNamespaceIdentity(path: string, expected: AtomicFileIdentity, targetPath: string): Promise<void> {
    const stat = await this.operations.lstat(path);
    if (stat.isSymbolicLink() || !stat.isDirectory() || !sameIdentity(identity(stat), expected)) {
      throw ownershipError(targetPath);
    }
  }

  private async assertTemporaryIdentity(path: string, expected: AtomicFileIdentity, targetPath: string): Promise<void> {
    const stat = await this.operations.lstat(path);
    if (stat.isSymbolicLink() || !stat.isFile() || !sameIdentity(identity(stat), expected)) {
      throw ownershipError(targetPath);
    }
  }

  private async cleanupOwnedTemporary(
    namespacePath: string,
    namespaceIdentity: AtomicFileIdentity,
    temporaryPath: string,
    temporaryIdentity: AtomicFileIdentity | undefined,
    targetPath: string,
  ): Promise<boolean> {
    if (temporaryIdentity) {
      try {
        await this.assertNamespaceIdentity(namespacePath, namespaceIdentity, targetPath);
        await this.assertTemporaryIdentity(temporaryPath, temporaryIdentity, targetPath);
      } catch (error: unknown) {
        if (!isEnoent(error)) return false;
      }
      try {
        await this.operations.unlink(temporaryPath);
      } catch {
        // The operation may have taken effect before reporting failure; inspect below.
      }
      try {
        await this.operations.lstat(temporaryPath);
        return false;
      } catch (error: unknown) {
        if (!isEnoent(error)) return false;
      }
    }
    return this.cleanupNamespace(namespacePath, namespaceIdentity, targetPath);
  }

  private async cleanupNamespace(
    namespacePath: string,
    namespaceIdentity: AtomicFileIdentity,
    targetPath: string,
  ): Promise<boolean> {
    try {
      await this.assertNamespaceIdentity(namespacePath, namespaceIdentity, targetPath);
      await this.operations.rmdir(namespacePath);
    } catch {
      // The operation may have taken effect before reporting failure; inspect below.
    }
    try {
      await this.operations.lstat(namespacePath);
      return false;
    } catch (error: unknown) {
      return isEnoent(error);
    }
  }
}

function identity(stat: AtomicFileStat): AtomicFileIdentity {
  return { dev: String(stat.dev), ino: String(stat.ino) };
}

function sameIdentity(left: AtomicFileIdentity, right: AtomicFileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function ownershipError(targetPath: string): Error {
  return new Error(`Atomic write ownership could not be confirmed for ${targetPath}.`);
}

function cleanupError(targetPath: string, cause?: unknown): Error {
  return new Error(
    `Atomic write cleanup could not be confirmed for ${targetPath}.`,
    cause === undefined ? undefined : { cause },
  );
}

function isEnoent(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
