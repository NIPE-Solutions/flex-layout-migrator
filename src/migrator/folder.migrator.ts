import { readdir, stat } from 'node:fs/promises';
import * as path from 'node:path';
import type { ConversionAdapter } from '../adapter/conversion-adapter';
import { shouldIgnore } from '../lib/gitignore.helper';
import { logger } from '../logger';
import { BaseMigrator } from './base.migrator';
import type { FileMigrationOptions, FileMigrationResult } from './file-migration-result';
import { FileMigrator } from './file.migrator';

interface FileEntry {
  readonly input: string;
  readonly relativePath: string;
}

export class FolderMigrator extends BaseMigrator<readonly FileMigrationResult[]> {
  constructor(
    private readonly adapter: ConversionAdapter,
    private readonly inputFolder: string,
    private readonly outputFolder: string,
  ) {
    super();
  }

  public async migrate(options: FileMigrationOptions = { write: true }): Promise<readonly FileMigrationResult[]> {
    const files = await this.collectFiles(this.inputFolder, '');
    files.sort((left, right) => path.normalize(left.input).localeCompare(path.normalize(right.input)));

    const results: FileMigrationResult[] = [];
    for (const file of files) {
      const output = path.join(this.outputFolder, file.relativePath);
      const fileMigrator = new FileMigrator(this.adapter, file.input, output);
      results.push(await fileMigrator.migrate(options));
    }

    return results;
  }

  private async collectFiles(directory: string, relativeDirectory: string): Promise<FileEntry[]> {
    const names = await readdir(directory);
    names.sort();
    const files: FileEntry[] = [];

    for (const name of names) {
      const input = path.join(directory, name);
      logger.debug(`Processing ${input}`);
      if (shouldIgnore(this.inputFolder, input)) continue;

      const inputStat = await stat(input);
      if (inputStat.isDirectory()) {
        files.push(...(await this.collectFiles(input, path.join(relativeDirectory, name))));
      } else if (inputStat.isFile() && path.extname(name).toLowerCase() === '.html') {
        files.push({ input, relativePath: path.join(relativeDirectory, name) });
      }
    }

    return files;
  }
}
