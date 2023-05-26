import * as fs from 'fs-extra';
import { IConverter } from '../converter/converter';
import { FileMigrator } from './file.migrator';
import { FolderMigrator } from './folder.migrator';
import { ProgressReporter } from './observer/progress.reporter';
import { loadPrettierOptions } from '../lib/prettier.formatter';
import { loadGitIgnore } from '../lib/gitignore.helper';
import { Statistics } from '../statistics';
import { StatisticsReporter } from './observer/statistics.reporter';

export class Migrator {
  constructor(private converter: IConverter, private inputPath: string, private outputPath: string) {}

  public async migrate(): Promise<void> {
    const stat = await fs.promises.stat(this.inputPath);

    await loadGitIgnore(this.inputPath);
    await loadPrettierOptions(this.inputPath);

    let migrator: FileMigrator | FolderMigrator;
    if (stat.isFile()) {
      migrator = new FileMigrator(this.converter, this.inputPath, this.outputPath);
    } else if (stat.isDirectory()) {
      migrator = new FolderMigrator(this.converter, this.inputPath, this.outputPath);
    } else {
      throw new Error(`Unsupported input type: ${this.inputPath}`);
    }

    const statistics = new Statistics();

    const progressReporter = new ProgressReporter();
    const statisticsReporter = new StatisticsReporter(statistics);

    migrator.addObserver(progressReporter, statisticsReporter);

    await migrator.migrate();

    statistics.end();
    statistics.print();
  }
}
