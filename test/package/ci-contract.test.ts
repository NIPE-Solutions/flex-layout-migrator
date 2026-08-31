import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('continuous integration', () => {
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
