import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Vitest discovery', () => {
  it('includes source and benchmark specifications and excludes generated output', async () => {
    const config = await readFile(new URL('../../vitest.config.ts', import.meta.url), 'utf8');

    expect(config).toContain("include: ['src/**/*.spec.ts', 'scripts/**/*.spec.ts', 'test/**/*.test.ts']");
    expect(config).toContain("exclude: ['dist/**', 'coverage/**', 'node_modules/**']");
  });
});
