import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('release policy', () => {
  it('publishes public packages from main without automated release commits', async () => {
    const config = JSON.parse(await readFile(new URL('../../.changeset/config.json', import.meta.url), 'utf8'));

    expect(config).toMatchObject({
      access: 'public',
      baseBranch: 'main',
      updateInternalDependencies: 'patch',
      commit: false,
    });
  });
});
