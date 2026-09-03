import type { MigrationReport } from '../report/migration-report';
import { resolveExitCode } from './exit-policy';

function report(overrides: Partial<MigrationReport['summary']> = {}): MigrationReport {
  return {
    schemaVersion: 2,
    mode: 'write',
    target: 'tailwind',
    application: { status: 'applied' },
    input: 'templates',
    output: 'generated',
    durationMs: 0,
    summary: {
      filesScanned: 1,
      filesChanged: 1,
      converted: 1,
      review: 0,
      unsupported: 0,
      invalid: 0,
      parseErrors: 0,
      ...overrides,
    },
    files: [],
  };
}

const cleanReport = report();
const reviewReport = report({ review: 1 });
const unsupportedReport = report({ unsupported: 1 });
const invalidReport = report({ invalid: 1 });
const parseErrorReport = report({ parseErrors: 1 });
const parseErrorWithUnresolvedReport = report({ parseErrors: 1, review: 1, unsupported: 1, invalid: 1 });

describe('resolveExitCode', () => {
  test.each([
    [cleanReport, false, 0],
    [reviewReport, false, 2],
    [unsupportedReport, false, 2],
    [invalidReport, false, 2],
    [reviewReport, true, 0],
    [unsupportedReport, true, 0],
    [invalidReport, true, 0],
    [parseErrorReport, false, 1],
    [parseErrorReport, true, 1],
    [parseErrorWithUnresolvedReport, false, 1],
    [parseErrorWithUnresolvedReport, true, 1],
  ] as const)('resolves the documented exit code', (migrationReport, allowed, expected) => {
    expect(resolveExitCode(migrationReport, allowed)).toBe(expected);
  });
});
