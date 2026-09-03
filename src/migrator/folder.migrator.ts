import { readdir, stat } from 'node:fs/promises';
import * as path from 'node:path';
import type { ConversionAdapter } from '../adapter/conversion-adapter';
import { shouldIgnore } from '../lib/gitignore.helper';
import { logger } from '../logger';
import { compareCodeUnits } from '../util/compare-code-units';
import type { FileMigrationOptions } from './file-migration-result';
import { FileMigrator, type FileMigratorDependencies } from './file.migrator';
import type { FileMigrationPlan } from './migration-plan';

interface FileEntry {
  readonly input: string;
  readonly relativePath: string;
}

export class FolderMigrator {
  private readonly excludedInputPaths: ReadonlySet<string>;

  constructor(
    private readonly adapter: ConversionAdapter,
    private readonly inputFolder: string,
    private readonly outputFolder: string,
    excludedInputPaths: readonly string[] = [],
    private readonly fileMigratorDependencies?: () => FileMigratorDependencies,
  ) {
    this.excludedInputPaths = new Set(excludedInputPaths.map(candidate => path.normalize(path.resolve(candidate))));
  }

  public async plan(
    options: FileMigrationOptions = { responsiveImages: false },
  ): Promise<readonly FileMigrationPlan[]> {
    const files = await this.collectFiles(this.inputFolder, '');
    files.sort((left, right) => compareCodeUnits(path.normalize(left.input), path.normalize(right.input)));

    const plans: FileMigrationPlan[] = [];
    for (const file of files) {
      const output = path.join(this.outputFolder, file.relativePath);
      const fileMigrator = new FileMigrator(
        this.adapter,
        file.input,
        output,
        undefined,
        this.fileMigratorDependencies?.(),
      );
      plans.push(await fileMigrator.plan(options));
    }

    return Object.freeze(plans);
  }

  private async collectFiles(directory: string, relativeDirectory: string): Promise<FileEntry[]> {
    const names = await readdir(directory);
    names.sort(compareCodeUnits);
    const files: FileEntry[] = [];

    for (const name of names) {
      const input = path.join(directory, name);
      logger.debug(`Processing ${input}`);
      if (shouldIgnore(this.inputFolder, input)) continue;
      if (this.excludedInputPaths.has(path.normalize(path.resolve(input)))) continue;

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
