import { AtomicFileWriter } from '../lib/atomic-file.writer';
import { MigrationApplicationError } from '../migrator/migration-application.error';
import { pathsEquivalentOnFileSystem, pathsOverlapOnFileSystem } from '../migrator/migration-path.validator';
import type { MigrationReport } from './migration-report';

type ReportFileWriter = Pick<AtomicFileWriter, 'write'>;

export interface JsonReportWriteOptions {
  readonly protectedPaths?: readonly string[];
}

export class JsonReportWriter {
  constructor(private readonly writer: ReportFileWriter = new AtomicFileWriter()) {}

  public async write(path: string, report: MigrationReport, options: JsonReportWriteOptions = {}): Promise<void> {
    for (const protectedPath of options.protectedPaths ?? []) {
      if (!(await pathsOverlapOnFileSystem(protectedPath, path))) continue;
      const collisionPaths = (await pathsEquivalentOnFileSystem(protectedPath, path))
        ? [protectedPath]
        : [protectedPath, path];
      throw new MigrationApplicationError(
        'path-collision',
        `Report path collides with a migration output: ${path}`,
        collisionPaths,
      );
    }
    const contents = `${JSON.stringify(report, null, 2)}\n`;
    await this.writer.write(path, contents);
  }
}
