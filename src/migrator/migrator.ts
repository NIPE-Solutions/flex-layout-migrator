import * as fs from 'fs-extra';
import { IConverter } from '../converter/converter';
import { FileMigrator } from './file.migrator';
import { FolderMigrator } from './folder.migrator';
import { ProgressReporter } from './observer/progress.reporter';

export class Migrator {
  constructor(
    private converter: IConverter,
    private inputPath: string,
    private outputPath: string,
  ) {}

  public async migrate(): Promise<void> {
    const stat = await fs.promises.stat(this.inputPath);

    let migrator: FileMigrator | FolderMigrator;
    if (stat.isFile()) {
      migrator = new FileMigrator(
        this.converter,
        this.inputPath,
        this.outputPath,
      );
    } else if (stat.isDirectory()) {
      migrator = new FolderMigrator(
        this.converter,
        this.inputPath,
        this.outputPath,
      );
    } else {
      throw new Error(`Unsupported input type: ${this.inputPath}`);
    }

    const observer = new ProgressReporter();
    migrator.addObserver(observer);

    await migrator.migrate();
  }
}
