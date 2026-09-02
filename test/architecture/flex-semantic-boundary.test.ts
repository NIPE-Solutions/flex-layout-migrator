import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const flexRoot = join(process.cwd(), 'src', 'flex');
const targetTokens = ['flex-row', 'box-border', '[@media_'];
const tailwindImport = /(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\()\s*['"][^'"]*adapter\/tailwind[^'"]*['"]/u;

function sourceFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

describe('flex semantic boundary', () => {
  test.each([
    "import { renderLayout } from '../../adapter/tailwind/directives/layout.strategy';",
    "await import('../../adapter/tailwind/tailwind.adapter');",
    "require('../../adapter/tailwind/tailwind.adapter');",
  ])('rejects Tailwind module reference: %s', source => {
    expect(source).toMatch(tailwindImport);
  });

  test('contains no Tailwind dependencies or target syntax', () => {
    for (const path of sourceFiles(flexRoot)) {
      const source = readFileSync(path, 'utf8');
      const sourcePath = relative(process.cwd(), path);

      expect(source, sourcePath).not.toMatch(tailwindImport);
      for (const token of targetTokens) {
        expect(source, sourcePath).not.toContain(token);
      }
      expect(source, sourcePath).not.toMatch(/\[[a-z-]+:/u);
    }
  });
});
