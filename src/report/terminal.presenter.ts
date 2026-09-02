import type { MigrationReport, ReportResult } from './migration-report';

export interface TextOutput {
  write(text: string): void;
  readonly isTTY?: boolean;
}

export class TerminalPresenter {
  public present(report: MigrationReport, output: TextOutput): void {
    const { summary } = report;
    const applicationApplied = report.application.status === 'applied';
    const outcome = applicationApplied
      ? `Applied: ${summary.filesScanned} files scanned, ${summary.filesChanged} changed`
      : `Plan: ${summary.filesScanned} files scanned, ${summary.filesChanged} would change`;
    const totals = `Converted ${summary.converted} | Review ${summary.review} | Unsupported ${summary.unsupported} | Invalid ${summary.invalid} | Parse errors ${summary.parseErrors}`;
    const stylesheet = report.stylesheet
      ? `Stylesheet: ${this.stylesheetAction(report.stylesheet.change, applicationApplied)} ${report.stylesheet.path}`
      : undefined;
    const skippedMessage = applicationApplied
      ? undefined
      : report.application.reason === 'parse-errors'
        ? 'No project files were written because parsing failed.'
        : 'No project files were written. Run again with --write to apply this plan.';
    const diagnostics = report.files.flatMap(file =>
      file.results
        .filter((result): result is Exclude<ReportResult, { status: 'converted' }> => result.status !== 'converted')
        .map(result => `${file.path}:${result.offset} [${result.code}] ${result.reason}`),
    );

    output.write(
      [outcome, totals, stylesheet, ...diagnostics, skippedMessage, '']
        .filter((line): line is string => line !== undefined)
        .join('\n'),
    );
  }

  private stylesheetAction(change: NonNullable<MigrationReport['stylesheet']>['change'], applied: boolean): string {
    if (change === 'unchanged' || applied) return change;
    if (change === 'created') return 'would create';
    if (change === 'updated') return 'would update';
    return 'would remove';
  }
}
