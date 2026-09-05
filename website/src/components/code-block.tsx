import { useState, type ReactNode } from 'react';

import { CopyButton } from './copy-button';

interface CodeBlockProps {
  readonly label: string;
  readonly children: ReactNode;
  readonly tone?: 'source' | 'output' | 'neutral';
  readonly copyValue?: string;
}

export function CodeBlock({ label, children, tone = 'neutral', copyValue }: CodeBlockProps) {
  const [copyStatus, setCopyStatus] = useState('');
  const copyableValue = copyValue ?? (typeof children === 'string' ? children : undefined);

  return (
    <figure className={`code-block code-block--${tone}`}>
      <figcaption>{label}</figcaption>
      {copyableValue === undefined ? null : <CopyButton label={label} value={copyableValue} onStatus={setCopyStatus} />}
      <pre tabIndex={0}>
        <code>{children}</code>
      </pre>
      {copyableValue === undefined ? null : (
        <span className="sr-only" aria-live="polite">
          {copyStatus}
        </span>
      )}
    </figure>
  );
}
