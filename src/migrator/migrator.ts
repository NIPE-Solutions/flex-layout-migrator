import * as fs from 'fs-extra';
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
}

export class Migrator {
  constructor(
    private readonly adapter: ConversionAdapter,
    private readonly inputPath: string,
    private readonly outputPath: string,
    private readonly now: () => number = Date.now,
  ) {}

  public async migrate(options: MigrationOptions = { dryRun: false }): Promise<MigrationReport> {
    const startedAt = this.now();
    const stat = await fs.promises.stat(this.inputPath);

    await loadGitIgnore(this.inputPath);

    let files: readonly FileMigrationResult[];
    if (stat.isFile()) {
      if (path.extname(this.inputPath).toLowerCase() !== '.html') {
        throw new Error(`Unsupported file type: ${this.inputPath}`);
      }
      files = [
        await new FileMigrator(this.adapter, this.inputPath, this.outputPath).migrate({ write: !options.dryRun }),
      ];
    } else if (stat.isDirectory()) {
      files = await new FolderMigrator(this.adapter, this.inputPath, this.outputPath).migrate({
        write: !options.dryRun,
      });
    } else {
      throw new Error(`Unsupported input type: ${this.inputPath}`);
    }

    if (this.adapter.name !== 'tailwind') {
      throw new Error(`Unsupported migration target: ${this.adapter.name}`);
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
