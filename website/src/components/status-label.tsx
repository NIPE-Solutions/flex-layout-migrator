export type MigrationStatus = 'converted' | 'review' | 'preserved' | 'unsupported' | 'invalid' | 'informational';

const statusPresentation: Readonly<Record<MigrationStatus, { readonly icon: string; readonly label: string }>> = {
  converted: { icon: '✓', label: 'Converted' },
  review: { icon: '!', label: 'Review' },
  preserved: { icon: '=', label: 'Preserved' },
  unsupported: { icon: '×', label: 'Unsupported' },
  invalid: { icon: '!', label: 'Invalid' },
  informational: { icon: 'i', label: 'Informational' },
};

export function StatusLabel({ status }: { readonly status: MigrationStatus }) {
  const presentation = statusPresentation[status];
  return (
    <span className={`status-label status-label--${status}`} aria-label={`Status: ${presentation.label}`}>
      <span className="status-label__icon" aria-hidden="true">
        {presentation.icon}
      </span>
      <span className="status-label__text">{presentation.label}</span>
    </span>
  );
}
