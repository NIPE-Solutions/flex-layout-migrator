import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('continuous integration', () => {
  it('prepares release pull requests from main and manual dispatch with pinned tooling', async () => {
    const workflow = await readFile(new URL('../../.github/workflows/release-pr.yml', import.meta.url), 'utf8');

    expect(workflow).toContain('branches: [main]');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1');
    expect(workflow).toContain('actions/setup-node@820762786026740c76f36085b0efc47a31fe5020');
    expect(workflow).toContain('node-version: 24');
    expect(workflow).toContain('npm install --global npm@11.19.0');
    expect(workflow).toContain('npm ci');
    expect(workflow).toContain('version: npm run release:version');
    expect(workflow).toContain('changesets/action@a45c4d594aa4e2c509dc14a9f2b3b67ba3780d0d');
  });

  it('defines stable, least-privilege required jobs on Node 24', async () => {
    const workflow = await readFile(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');

    for (const job of ['quality:', 'test:', 'package:', 'dependency-review:']) {
      expect(workflow).toContain(job);
    }
    expect(workflow).toContain('node-version: 24');
    expect(workflow).toContain('npm ci');
    expect(workflow).toContain('contents: read');
    expect(workflow).not.toContain('contents: write');
  });
});
