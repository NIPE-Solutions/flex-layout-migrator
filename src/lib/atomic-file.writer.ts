import { randomUUID } from 'node:crypto';
import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

export interface AtomicFileOperations {
  readonly mkdir: typeof mkdir;
  readonly open: typeof open;
  readonly rename: typeof rename;
  readonly unlink: typeof unlink;
}

const defaultOperations: AtomicFileOperations = { mkdir, open, rename, unlink };

export class AtomicFileWriter {
  constructor(private readonly operations: AtomicFileOperations = defaultOperations) {}

  async write(targetPath: string, contents: string): Promise<void> {
    const directory = dirname(targetPath);
    const temporaryPath = join(directory, `.${basename(targetPath)}.${randomUUID()}.tmp`);

    await this.operations.mkdir(directory, { recursive: true });
    let temporaryFile: Awaited<ReturnType<typeof open>> | undefined;
    try {
      temporaryFile = await this.operations.open(temporaryPath, 'wx');
      await temporaryFile.writeFile(contents, 'utf8');
      await temporaryFile.sync();
      await temporaryFile.close();
      temporaryFile = undefined;
      await this.operations.rename(temporaryPath, targetPath);
    } catch (error) {
      await temporaryFile?.close().catch(() => undefined);
      await this.operations.unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  }
}
