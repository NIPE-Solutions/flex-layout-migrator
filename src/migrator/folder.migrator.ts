import * as fs from 'fs-extra';
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
    protected override adapter: ConversionAdapter,
    private readonly inputFolder: string,
    private readonly outputFolder: string,
  ) {
    super(adapter);
  }

  public async migrate(options: FileMigrationOptions = { write: true }): Promise<readonly FileMigrationResult[]> {
    const files = await this.collectFiles(this.inputFolder, '');
    files.sort((left, right) => path.normalize(left.input).localeCompare(path.normalize(right.input)));

    const results: FileMigrationResult[] = [];
    for (const [index, file] of files.entries()) {
      const output = path.join(this.outputFolder, file.relativePath);
      const fileMigrator = new FileMigrator(this.adapter, file.input, output);
      fileMigrator.addObserver(...this.observers);
      results.push(await fileMigrator.migrate(options));
      this.notifyObservers('folderProgress', {
        id: this.inputFolder,
        percentage: Math.round(((index + 1) / files.length) * 100),
        processedFiles: index + 1,
      });
    }

    this.notifyObservers('folderCompleted', {
      id: this.inputFolder,
      folderName: path.basename(this.inputFolder),
    });
    return results;
  }

  private async collectFiles(directory: string, relativeDirectory: string): Promise<FileEntry[]> {
    this.notifyObservers('folderStarted', { id: directory, folderName: path.basename(directory) });
    const names = await fs.promises.readdir(directory);
    names.sort();
    const files: FileEntry[] = [];

    for (const name of names) {
      const input = path.join(directory, name);
      logger.debug(`Processing ${input}`);
      if (shouldIgnore(this.inputFolder, input)) continue;

      const stat = await fs.promises.stat(input);
      if (stat.isDirectory()) {
        files.push(...(await this.collectFiles(input, path.join(relativeDirectory, name))));
      } else if (stat.isFile() && path.extname(name).toLowerCase() === '.html') {
        files.push({ input, relativePath: path.join(relativeDirectory, name) });
      }
    }

    return files;
  }
}
