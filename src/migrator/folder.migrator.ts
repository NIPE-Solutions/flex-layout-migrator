import * as path from 'path';
import * as fs from 'fs-extra';
import { BaseMigrator } from './base.migrator';
import { FileMigrator } from './file.migrator';
import { IConverter } from '../converter/converter';

export class FolderMigrator extends BaseMigrator {
  constructor(
    protected converter: IConverter,
    private inputFolder: string,
    private outputFolder: string,
  ) {
    super(converter);
  }

  public async migrate(): Promise<void> {
    await this.migrateRecursively(
      this.inputFolder,
      this.outputFolder,
      this.inputFolder,
    );
  }

  /**
   * Migrates a folder recursively and all its subfolders and files to the output folder.
   * @param inputFolder The input folder to migrate.
   * @param outputFolder The output folder to migrate to.
   * @param currentDir The current directory to migrate. This is used for recursion.
   */
  private async migrateRecursively(
    inputFolder: string,
    outputFolder: string,
    currentDir: string,
  ): Promise<void> {
    this.notifyObservers('folderStarted', {
      id: currentDir,
      folderName: path.basename(currentDir),
    });

    const filesAndDirectories = await fs.promises.readdir(currentDir);

    const fileCount = (
      await Promise.all(
        filesAndDirectories.map(async item => {
          const currentPath = path.join(currentDir, item);
          const stat = await fs.promises.stat(currentPath);
          return stat.isFile() ? 1 : 0;
        }),
      )
    ).reduce<number>((acc, curr) => acc + curr, 0);

    let processedFiles = 0;
    for (const item of filesAndDirectories) {
      const currentPath = path.join(currentDir, item);
      const stat = await fs.promises.stat(currentPath);

      if (stat.isFile()) {
        const outputPath = path.join(
          outputFolder,
          path.relative(inputFolder, currentPath),
        );

        const fileMigrator = new FileMigrator(
          this.converter,
          currentPath,
          outputPath,
        );

        // add observers to file migrator
        for (const observer of this.observers) {
          fileMigrator.addObserver(observer);
        }

        await fileMigrator.migrate();

        processedFiles++;

        const percentage = (processedFiles / fileCount) * 100;

        this.notifyObservers('folderProgress', {
          id: currentDir,
          percentage,
          processedFiles,
        });
      } else if (stat.isDirectory()) {
        await this.migrateRecursively(inputFolder, outputFolder, currentPath);
      }
    }

    this.notifyObservers('folderCompleted', {
      id: currentDir,
      folderName: path.basename(currentDir),
    });
  }
}
