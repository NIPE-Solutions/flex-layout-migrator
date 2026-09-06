import { useState } from 'react';

import { diagnosticReference } from '../content/diagnostic-reference';

export function DiagnosticReference() {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase('en');
  const diagnostics = diagnosticReference.filter(diagnostic =>
    [diagnostic.code, diagnostic.family, diagnostic.meaning]
      .join(' ')
      .toLocaleLowerCase('en')
      .includes(normalizedQuery),
  );

  return (
    <section className="diagnostic-reference" aria-labelledby="diagnostic-reference-heading">
      <h3 id="diagnostic-reference-heading">Diagnostic-code reference</h3>
      <label className="diagnostic-search">
        Search diagnostics
        <input
          type="search"
          value={query}
          onChange={event => setQuery(event.currentTarget.value)}
          placeholder="Code, message, or family"
        />
      </label>
      <p className="reference-result-count" aria-live="polite">
        {diagnostics.length} {diagnostics.length === 1 ? 'diagnostic' : 'diagnostics'} shown.
      </p>
      {diagnostics.length === 0 ? (
        <p>No diagnostics match this search.</p>
      ) : (
        <div className="diagnostic-reference__entries">
          {diagnostics.map(diagnostic => (
            <article className="diagnostic-reference__entry" aria-labelledby={diagnostic.code} key={diagnostic.code}>
              <aside role="note" aria-labelledby={diagnostic.code}>
                <p>{diagnostic.family}</p>
                <h3 id={diagnostic.code}>
                  <a href={`/docs/diagnostics#${diagnostic.code}`}>{diagnostic.code}</a>
                </h3>
                <h4>Meaning</h4>
                <p>{diagnostic.meaning}</p>
                <h4>Why the tool cannot guess</h4>
                <p>{diagnostic.unsafeToGuess}</p>
                <h4>Resolution</h4>
                <ul>
                  {diagnostic.resolution.map(step => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
                <h4>Preservation behavior</h4>
                <p>The affected source remains unchanged; resolve the cause before replacing or removing it.</p>
                <h4>Rerun guidance</h4>
                <p>{rerunGuidance(diagnostic.code, diagnostic.rerunEligible)}</p>
              </aside>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function rerunGuidance(code: string, rerunEligible: boolean): string {
  if (code === 'generated-template-parse-error') {
    return 'Report a minimal reproduction, keep the original source, and rerun only after the generator issue is resolved.';
  }
  if (rerunEligible) return 'Rerun the same scope after applying the registry resolution and review the new result.';
  return 'Complete a manual migration or select a supported target; rerunning unchanged source will preserve it again.';
}
