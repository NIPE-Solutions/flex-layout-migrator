import * as fs from 'fs-extra';
import * as path from 'path';
import { IConverter } from '../converter/converter';
import { FileMigrator } from './file.migrator';
import { FolderMigrator } from './folder.migrator';
import { ProgressReporter } from './observer/progress.reporter';
import { loadPrettierOptions } from '../lib/prettier.formatter';
import { loadGitIgnore } from '../lib/gitignore.helper';

export class Migrator {
  constructor(private converter: IConverter, private inputPath: string, private outputPath: string) {}

  public async migrate(): Promise<void> {
    const stat = await fs.promises.stat(this.inputPath);

    await loadGitIgnore(this.inputPath);
    await loadPrettierOptions(this.inputPath);

    let migrator: FileMigrator | FolderMigrator;
    if (stat.isFile()) {
      if (!this.converter.isSupportedFileExtension(path.extname(this.inputPath))) {
        throw new Error(`Unsupported file type: ${this.inputPath}`);
      }
      migrator = new FileMigrator(this.converter, this.inputPath, this.outputPath);
    } else if (stat.isDirectory()) {
      migrator = new FolderMigrator(this.converter, this.inputPath, this.outputPath);
    } else {
      throw new Error(`Unsupported input type: ${this.inputPath}`);
    }

    const observer = new ProgressReporter();
    migrator.addObserver(observer);

    await migrator.migrate();
  }
}
