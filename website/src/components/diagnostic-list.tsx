import type { TemplatePreviewDiagnostic } from '@core/browser/template-preview';

interface DiagnosticListProps {
  readonly diagnostics: readonly TemplatePreviewDiagnostic[];
}

export function DiagnosticList({ diagnostics }: DiagnosticListProps) {
  if (diagnostics.length === 0) return null;

  return (
    <section className="diagnostics" aria-labelledby="diagnostics-heading">
      <h3 id="diagnostics-heading">Diagnostics</h3>
      <ol>
        {diagnostics.map((diagnostic, index) => (
          <li key={`${diagnostic.code}:${index}`}>
            <p className="diagnostic__meta">
              <code>{diagnostic.code}</code>
              {'source' in diagnostic ? (
                <span>
                  Source {diagnostic.source.start}–{diagnostic.source.end}
                </span>
              ) : (
                <span>{diagnostic.inputIds.length} related inputs</span>
              )}
            </p>
            <p>{diagnostic.message}</p>
            {'suggestion' in diagnostic ? <p className="diagnostic__suggestion">{diagnostic.suggestion}</p> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
