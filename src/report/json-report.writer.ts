import { AtomicFileWriter } from '../lib/atomic-file.writer';
import type { MigrationReport } from './migration-report';

type ReportFileWriter = Pick<AtomicFileWriter, 'write'>;

export class JsonReportWriter {
  constructor(private readonly writer: ReportFileWriter = new AtomicFileWriter()) {}

  public async write(path: string, report: MigrationReport): Promise<void> {
    const contents = `${JSON.stringify(report, null, 2)}\n`;
    await this.writer.write(path, contents);
  }
}
