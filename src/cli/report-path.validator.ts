import path from 'node:path';

export function validateReportPath(reportPath: string): void {
  if (reportPath.trim().length === 0) {
    throw new Error('Report path must not be empty.');
  }

  if (path.extname(reportPath).toLowerCase() !== '.json') {
    throw new Error('Report path must have a .json extension.');
  }
}
