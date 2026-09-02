import type { MigrationReport, ReportResult } from './migration-report';

type MigrationApplication = MigrationReport['application'];
type StylesheetChange = NonNullable<MigrationReport['stylesheet']>['change'];

interface ApplicationPresentation {
  readonly outcome: string;
  readonly footer?: string;
}

function assertNever(value: never, subject: string): never {
  throw new Error(`Unsupported ${subject}: ${String(value)}`);
}

export interface TextOutput {
  write(text: string): void;
  readonly isTTY?: boolean;
}

export class TerminalPresenter {
  public present(report: MigrationReport, output: TextOutput): void {
    const { summary } = report;
    const application = report.application;
    const presentation = this.applicationPresentation(report);
    const totals = `Converted ${summary.converted} | Review ${summary.review} | Unsupported ${summary.unsupported} | Invalid ${summary.invalid} | Parse errors ${summary.parseErrors}`;
    const stylesheet = report.stylesheet
      ? `Stylesheet: ${this.stylesheetAction(report.stylesheet.change, application.status)} ${report.stylesheet.path}`
      : undefined;
    const diagnostics = report.files.flatMap(file =>
      file.results
        .filter((result): result is Exclude<ReportResult, { status: 'converted' }> => result.status !== 'converted')
        .map(result => `${file.path}:${result.offset} [${result.code}] ${result.reason}`),
    );

    output.write(
      [presentation.outcome, totals, stylesheet, ...diagnostics, presentation.footer, '']
        .filter((line): line is string => line !== undefined)
        .join('\n'),
    );
  }

  private applicationPresentation(report: MigrationReport): ApplicationPresentation {
    const { summary, application } = report;

    switch (application.status) {
      case 'applied':
        if (report.mode !== 'write') throw new Error('Applied application requires write mode.');
        return {
          outcome: `Applied: ${summary.filesScanned} files scanned, ${summary.filesChanged} changed`,
        };
      case 'skipped':
        switch (application.reason) {
          case 'plan-only':
            if (report.mode !== 'plan') throw new Error('Plan-only application requires plan mode.');
            return {
              outcome: `${this.modeLabel(report.mode)}: ${summary.filesScanned} files scanned, ${summary.filesChanged} would change`,
              footer: 'No project files were written. Run again with --write to apply this plan.',
            };
          case 'parse-errors':
            if (report.mode !== 'write') throw new Error('Parse-error application requires write mode.');
            return {
              outcome: `${this.modeLabel(report.mode)}: ${summary.filesScanned} files scanned, ${summary.filesChanged} would change`,
              footer: 'No project files were written because parsing failed.',
            };
          default:
            return assertNever(application.reason, 'migration application reason');
        }
      default:
        return assertNever(application, 'migration application');
    }
  }

  private modeLabel(mode: MigrationReport['mode']): 'Plan' | 'Write' {
    switch (mode) {
      case 'plan':
        return 'Plan';
      case 'write':
        return 'Write';
      default:
        return assertNever(mode, 'migration mode');
    }
  }

  private stylesheetAction(change: StylesheetChange, status: MigrationApplication['status']): string {
    switch (status) {
      case 'applied':
        return this.completedStylesheetAction(change);
      case 'skipped':
        return this.prospectiveStylesheetAction(change);
      default:
        return assertNever(status, 'migration application status');
    }
  }

  private completedStylesheetAction(change: StylesheetChange): string {
    switch (change) {
      case 'created':
        return 'created';
      case 'updated':
        return 'updated';
      case 'removed':
        return 'removed';
      case 'unchanged':
        return 'unchanged';
      default:
        return assertNever(change, 'stylesheet change');
    }
  }

  private prospectiveStylesheetAction(change: StylesheetChange): string {
    switch (change) {
      case 'created':
        return 'would create';
      case 'updated':
        return 'would update';
      case 'removed':
        return 'would remove';
      case 'unchanged':
        return 'would remain unchanged';
      default:
        return assertNever(change, 'stylesheet change');
    }
  }
}
