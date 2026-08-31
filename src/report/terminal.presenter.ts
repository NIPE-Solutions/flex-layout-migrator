import type { MigrationReport, ReportResult } from './migration-report';

export interface TextOutput {
  write(text: string): void;
  readonly isTTY?: boolean;
}

export class TerminalPresenter {
  public present(report: MigrationReport, output: TextOutput): void {
    const { summary } = report;
    const outcome = `${summary.filesScanned} files scanned, ${summary.filesChanged} ${
      report.dryRun ? 'would change' : 'changed'
    }`;
    const totals = `Converted ${summary.converted} | Review ${summary.review} | Unsupported ${summary.unsupported} | Invalid ${summary.invalid} | Parse errors ${summary.parseErrors}`;
    const diagnostics = report.files.flatMap(file =>
      file.results
        .filter((result): result is Exclude<ReportResult, { status: 'converted' }> => result.status !== 'converted')
        .map(result => `${file.path}:${result.offset} [${result.code}] ${result.reason}`),
    );

    output.write([report.dryRun ? `Dry run: ${outcome}` : outcome, totals, ...diagnostics, ''].join('\n'));
  }
}
