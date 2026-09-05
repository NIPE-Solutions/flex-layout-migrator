import { useId } from 'react';

interface MigrationChecklistProps {
  readonly requirements: readonly string[];
  readonly recommendations: readonly string[];
}

export function MigrationChecklist({ requirements, recommendations }: MigrationChecklistProps) {
  const headingId = useId();

  return (
    <section className="migration-checklist" aria-labelledby={headingId}>
      <h2 id={headingId}>Migration checklist</h2>
      <ChecklistGroup heading="Tool behavior" items={requirements} />
      <ChecklistGroup heading="Recommended practice" items={recommendations} />
    </section>
  );
}

function ChecklistGroup({ heading, items }: { readonly heading: string; readonly items: readonly string[] }) {
  return (
    <section>
      <h3>{heading}</h3>
      <ul>
        {items.map(item => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
