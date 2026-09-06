import type { MigrationReport } from '../../../src/report/migration-report';

import { reportReference } from '../content/report-reference';
import { CodeBlock } from './code-block';

const planReportExample = reportReference.examples.find(example => example.id === 'plan');
if (planReportExample === undefined) throw new Error('The validated plan report example is missing.');

export const validatedReportExample = planReportExample.value;

interface ReportExampleProps {
  readonly report: MigrationReport;
  readonly label: string;
}

export function ReportExample({ report, label }: ReportExampleProps) {
  const application = report.application.status === 'applied' ? 'applied' : `skipped: ${report.application.reason}`;
  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  return (
    <section className="report-example" aria-label={label}>
      <dl>
        <div>
          <dt>Schema version</dt>
          <dd>{report.schemaVersion}</dd>
        </div>
        <div>
          <dt>Mode</dt>
          <dd>{report.mode}</dd>
        </div>
        <div>
          <dt>Target</dt>
          <dd>{report.target}</dd>
        </div>
        <div>
          <dt>Application</dt>
          <dd>{application}</dd>
        </div>
      </dl>
      <CodeBlock label={label} copyValue={serialized}>
        {serialized}
      </CodeBlock>
    </section>
  );
}
