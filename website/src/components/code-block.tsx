import type { ReactNode } from 'react';

interface CodeBlockProps {
  readonly label: string;
  readonly children: ReactNode;
  readonly tone?: 'source' | 'output' | 'neutral';
}

export function CodeBlock({ label, children, tone = 'neutral' }: CodeBlockProps) {
  return (
    <figure className={`code-block code-block--${tone}`}>
      <figcaption>{label}</figcaption>
      <pre tabIndex={0}>
        <code>{children}</code>
      </pre>
    </figure>
  );
}
