import { readFile, readdir } from 'node:fs/promises';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('Vitest discovery', () => {
  it('includes source, architecture inventory, and benchmark specifications and excludes generated output', async () => {
    const config = await readFile(new URL('../../vitest.config.ts', import.meta.url), 'utf8');

    expect(config).toContain("include: ['src/**/*.spec.ts', 'scripts/**/*.spec.ts', 'test/**/*.test.ts']");
    expect(config).toContain("exclude: ['dist/**', 'coverage/**', 'node_modules/**']");
  });

  it('discovers every pipeline specification through the source specification policy', async () => {
    const config = await readFile(new URL('../../vitest.config.ts', import.meta.url), 'utf8');
    const pipelineDirectory = new URL('../../src/pipeline/', import.meta.url);
    const pipelineSpecifications = await specificationPaths(pipelineDirectory);

    expect(config).toContain("'src/**/*.spec.ts'");
    expect(pipelineSpecifications.length).toBeGreaterThan(0);
    expect(pipelineSpecifications.every(path => path.startsWith('src/') && path.endsWith('.spec.ts'))).toBe(true);
    expect(pipelineSpecifications).toEqual(
      expect.arrayContaining([
        'src/pipeline/analyze/analyze-project.stage.spec.ts',
        'src/pipeline/discover/discover-project.stage.spec.ts',
      ]),
    );
  });
});

async function specificationPaths(directory: URL): Promise<readonly string[]> {
  const nested = await Promise.all(
    (await readdir(directory, { withFileTypes: true })).map(async entry => {
      if (entry.isDirectory()) return specificationPaths(new URL(`${entry.name}/`, directory));
      if (!entry.isFile() || !entry.name.endsWith('.spec.ts')) return [];
      return [relative(process.cwd(), fileURLToPath(new URL(entry.name, directory))).replaceAll('\\', '/')];
    }),
  );
  return nested.flat().sort();
}
