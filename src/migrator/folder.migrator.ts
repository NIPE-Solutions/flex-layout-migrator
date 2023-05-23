import * as path from 'path';
import * as fs from 'fs-extra';
import { BaseMigrator } from './base.migrator';
import { FileMigrator } from './file.migrator';
import { IConverter } from '../converter/converter';
import { Stack } from '@lib/stack';

export class FolderMigrator extends BaseMigrator {
  constructor(protected converter: IConverter, private inputFolder: string, private outputFolder: string) {
    super(converter);
  }

  public async migrate(): Promise<void> {
    await this.processFolder(this.inputFolder, this.outputFolder);
  }

  private async processFolder(inputFolder: string, outputFolder: string): Promise<void> {
    const stack = new Stack<{ dir: string; relativePath: string }>([{ dir: inputFolder, relativePath: '' }]);

    while (!stack.isEmpty()) {
      const { dir, relativePath } = stack.pop();

      this.notifyObservers('folderStarted', {
        id: dir,
        folderName: path.basename(dir),
      });

      const filesAndDirectories = await this.readdirWithStats(dir);

      const fileCount = filesAndDirectories.filter(({ stat }) => stat.isFile()).length;
      let processedFiles = 0;

      for (const { item, stat, currentPath } of filesAndDirectories) {
        if (stat.isDirectory()) {
          stack.push({
            dir: currentPath,
            relativePath: path.join(relativePath, item),
          });
        } else if (stat.isFile()) {
          const outputPath = path.join(outputFolder, relativePath, item);
          await this.migrateFile(currentPath, outputPath);

          processedFiles++;
          const percentage = (processedFiles / fileCount) * 100;

          this.notifyObservers('folderProgress', {
            id: dir,
            percentage,
            processedFiles,
          });
        }
      }

      this.notifyObservers('folderCompleted', {
        id: dir,
        folderName: path.basename(dir),
      });
    }
  }

  private async readdirWithStats(dir: string): Promise<{ item: string; stat: fs.Stats; currentPath: string }[]> {
    const filesAndDirectories = await fs.promises.readdir(dir);

    return await Promise.all(
      filesAndDirectories.map(async item => {
        const currentPath = path.join(dir, item);
        const stat = await fs.promises.stat(currentPath);
        return { item, stat, currentPath };
      }),
    );
  }

  private async migrateFile(currentPath: string, outputPath: string): Promise<void> {
    const fileMigrator = new FileMigrator(this.converter, currentPath, outputPath);

    for (const observer of this.observers) {
      fileMigrator.addObserver(observer);
    }

    // Ensure the output directory exists
    await fs.ensureDir(path.dirname(outputPath));

    await fileMigrator.migrate();
  }
}
