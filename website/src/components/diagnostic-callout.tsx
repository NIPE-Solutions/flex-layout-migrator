import { useId } from 'react';

import { diagnosticReference } from '../content/diagnostic-reference';

type DiagnosticReferenceCode = (typeof diagnosticReference)[number]['code'];

interface DiagnosticCalloutProps {
  readonly code: DiagnosticReferenceCode;
}

export function DiagnosticCallout({ code }: DiagnosticCalloutProps) {
  const headingId = useId();
  const diagnostic = diagnosticReference.find(entry => entry.code === code);
  if (diagnostic === undefined) throw new Error(`Unknown diagnostic code: ${code}`);

  return (
    <aside className="diagnostic-callout" role="note" aria-labelledby={headingId}>
      <p>Migration diagnostic</p>
      <h3 id={headingId}>
        <a href={`/docs/diagnostics#${code}`}>{code}</a>
      </h3>
      <p>{diagnostic.meaning}</p>
      <h4>Why the tool preserves source</h4>
      <p>{diagnostic.unsafeToGuess}</p>
      <h4>Resolution</h4>
      <ul>
        {diagnostic.resolution.map(step => (
          <li key={step}>{step}</li>
        ))}
      </ul>
      {diagnostic.rerunEligible ? <p>Rerun the same scope after resolving the cause.</p> : null}
    </aside>
  );
}
