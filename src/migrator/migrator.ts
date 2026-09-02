import { stat } from 'node:fs/promises';
import * as path from 'node:path';
import type { ConversionAdapter } from '../adapter/conversion-adapter';
import { loadGitIgnore } from '../lib/gitignore.helper';
import { MigrationReportBuilder } from '../report/migration-report.builder';
import type { MigrationReport } from '../report/migration-report';
import type { FileMigrationResult } from './file-migration-result';
import { FileMigrator } from './file.migrator';
import { FolderMigrator } from './folder.migrator';

export interface MigrationOptions {
  readonly dryRun: boolean;
  readonly responsiveImages?: boolean;
}

export class Migrator {
  constructor(
    private readonly adapter: ConversionAdapter,
    private readonly inputPath: string,
    private readonly outputPath: string,
    private readonly now: () => number = Date.now,
  ) {}

  public async migrate(options: MigrationOptions = { dryRun: false }): Promise<MigrationReport> {
    if (this.adapter.name !== 'tailwind') {
      throw new Error(`Unsupported migration target: ${this.adapter.name}`);
    }

    const startedAt = this.now();
    const inputStat = await stat(this.inputPath);

    await loadGitIgnore(this.inputPath);

    let files: readonly FileMigrationResult[];
    if (inputStat.isFile()) {
      if (path.extname(this.inputPath).toLowerCase() !== '.html') {
        throw new Error(`Unsupported file type: ${this.inputPath}`);
      }
      if (path.extname(this.outputPath).toLowerCase() !== '.html') {
        throw new Error('Single-file output path must have a .html extension.');
      }
      files = [
        await new FileMigrator(this.adapter, this.inputPath, this.outputPath).migrate({
          write: !options.dryRun,
          responsiveImages: options.responsiveImages ?? false,
        }),
      ];
    } else if (inputStat.isDirectory()) {
      files = await new FolderMigrator(this.adapter, this.inputPath, this.outputPath).migrate({
        write: !options.dryRun,
        responsiveImages: options.responsiveImages ?? false,
      });
    } else {
      throw new Error(`Unsupported input type: ${this.inputPath}`);
    }

    return new MigrationReportBuilder().build(
      this.inputPath,
      this.outputPath,
      this.adapter.name,
      options.dryRun,
      this.now() - startedAt,
      files,
    );
  }
}
