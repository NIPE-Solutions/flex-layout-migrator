export interface SourceDiffLine {
  readonly kind: 'removed' | 'added' | 'preserved';
  readonly value: string;
}

const linePresentation = {
  removed: { marker: '-', label: 'Removed line' },
  added: { marker: '+', label: 'Added line' },
  preserved: { marker: '=', label: 'Preserved line' },
} as const;

export function SourceDiff({ label, lines }: { readonly label: string; readonly lines: readonly SourceDiffLine[] }) {
  return (
    <figure className="source-diff" aria-label={label}>
      <figcaption>{label}</figcaption>
      <ol aria-label={`${label} lines`} tabIndex={0}>
        {lines.map((line, index) => {
          const presentation = linePresentation[line.kind];
          return (
            <li
              className={`source-diff__line source-diff__line--${line.kind}`}
              aria-label={`${presentation.label}: ${line.value}`}
              key={index}
            >
              <span className="source-diff__marker" aria-hidden="true">
                {presentation.marker}
              </span>
              <code>{line.value}</code>
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
