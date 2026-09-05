interface CopyButtonProps {
  readonly label: string;
  readonly value: string;
  readonly onStatus: (message: string) => void;
}

export function CopyButton({ label, value, onStatus }: CopyButtonProps) {
  async function copy(): Promise<void> {
    try {
      if (navigator.clipboard === undefined) throw new Error('Clipboard access is unavailable.');
      await navigator.clipboard.writeText(value);
      onStatus(`${label} copied to clipboard.`);
    } catch {
      onStatus(`Could not copy ${label}. Select and copy it manually.`);
    }
  }

  return (
    <button className="copy-button" type="button" onClick={() => void copy()}>
      Copy {label}
    </button>
  );
}
