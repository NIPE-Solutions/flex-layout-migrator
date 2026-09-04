export interface DiscoveryEntry {
  readonly name: string;
  readonly kind: 'file' | 'directory' | 'other';
}

export interface DiscoveryFileSystem {
  kind(path: string): Promise<'file' | 'directory' | 'other'>;
  entries(directory: string): Promise<readonly DiscoveryEntry[]>;
}
