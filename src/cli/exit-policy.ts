import type { MigrationReport } from '../report/migration-report';

export function resolveExitCode(report: MigrationReport, allowUnresolved: boolean): 0 | 1 | 2 {
  if (report.summary.parseErrors > 0) return 1;

  const hasUnresolved = report.summary.review > 0 || report.summary.unsupported > 0 || report.summary.invalid > 0;

  return hasUnresolved && !allowUnresolved ? 2 : 0;
}
