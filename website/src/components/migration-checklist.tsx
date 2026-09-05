import { useId, useState } from 'react';

import { CopyButton } from './copy-button';

export const largeCodebaseChecklist = Object.freeze({
  requirements: Object.freeze([
    'Plan and write use the same discovery, analysis, render, validation, and preflight path when source parsing succeeds.',
    'Folder discovery is deterministic, recursive, HTML-only, and excludes invocation-owned output, report, and stylesheet paths.',
    'A source parse error skips the complete write invocation rather than applying an earlier file.',
    'Reports remain schema-versioned and preserve per-file results after a completed plan or application.',
  ]),
  recommendations: Object.freeze([
    'Pilot a representative owned slice and compare targets.',
    'Start each batch from a clean Git checkpoint and record the exact installed version.',
    'Review diagnostics and responsive families before writing.',
    'Verify diffs, builds, tests, responsive states, and remaining directives after writing.',
    'Assign owners and rationale to intentionally preserved work before dependency removal.',
  ]),
});

interface MigrationChecklistProps {
  readonly requirements: readonly string[];
  readonly recommendations: readonly string[];
}

export function MigrationChecklist({ requirements, recommendations }: MigrationChecklistProps) {
  const headingId = useId();
  const [copyStatus, setCopyStatus] = useState('');
  const copyValue = serializeChecklist(requirements, recommendations);

  return (
    <section className="migration-checklist" aria-labelledby={headingId}>
      <h3 id={headingId}>Migration checklist</h3>
      <ChecklistGroup heading="Tool behavior" items={requirements} />
      <ChecklistGroup heading="Recommended practice" items={recommendations} />
      <CopyButton label="Migration checklist" value={copyValue} onStatus={setCopyStatus} />
      <span className="sr-only" aria-live="polite">
        {copyStatus}
      </span>
    </section>
  );
}

function ChecklistGroup({ heading, items }: { readonly heading: string; readonly items: readonly string[] }) {
  return (
    <section>
      <h4>{heading}</h4>
      <ul>
        {items.map(item => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function serializeChecklist(requirements: readonly string[], recommendations: readonly string[]): string {
  return [
    'Migration checklist',
    '',
    'Tool behavior',
    ...requirements.map(item => `- ${item}`),
    '',
    'Recommended practice',
    ...recommendations.map(item => `- ${item}`),
    '',
  ].join('\n');
}
