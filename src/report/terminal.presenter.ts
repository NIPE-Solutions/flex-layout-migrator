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
    const stylesheet = report.stylesheet
      ? `Stylesheet: ${this.stylesheetAction(report.stylesheet.change, report.dryRun)} ${report.stylesheet.path}`
      : undefined;
    const diagnostics = report.files.flatMap(file =>
      file.results
        .filter((result): result is Exclude<ReportResult, { status: 'converted' }> => result.status !== 'converted')
        .map(result => `${file.path}:${result.offset} [${result.code}] ${result.reason}`),
    );

    output.write(
      [report.dryRun ? `Dry run: ${outcome}` : outcome, totals, stylesheet, ...diagnostics, '']
        .filter((line): line is string => line !== undefined)
        .join('\n'),
    );
  }

  private stylesheetAction(change: NonNullable<MigrationReport['stylesheet']>['change'], dryRun: boolean): string {
    if (change === 'unchanged' || !dryRun) return change;
    if (change === 'created') return 'would create';
    if (change === 'updated') return 'would update';
    return 'would remove';
  }
}
