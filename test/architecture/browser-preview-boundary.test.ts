import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';

import { runtimeModuleReferences } from './typescript-boundary';

const productionRoot = join(process.cwd(), 'src');
const entryPath = join(productionRoot, 'browser', 'template-preview.ts');
const forbiddenPackages = new Set(['fs', 'fs/promises', 'path', 'process']);
const forbiddenSourceRoots = [
  join(productionRoot, 'cli'),
  join(productionRoot, 'report'),
  join(productionRoot, 'pipeline', 'discover'),
  join(productionRoot, 'pipeline', 'apply'),
  join(productionRoot, 'transaction'),
];

describe('browser preview architecture boundary', () => {
  test('keeps the complete static import graph free of Node and application-side authorities', () => {
    expect(existsSync(entryPath), relative(process.cwd(), entryPath)).toBe(true);

    const findings: string[] = [];
    const pending = [entryPath];
    const visited = new Set<string>();
    while (pending.length > 0) {
      const sourcePath = pending.pop();
      if (sourcePath === undefined || visited.has(sourcePath)) continue;
      visited.add(sourcePath);

      for (const reference of runtimeModuleReferences(readFileSync(sourcePath, 'utf8'), sourcePath)) {
        if (reference.startsWith('node:') || forbiddenPackages.has(reference)) {
          findings.push(`${relative(process.cwd(), sourcePath)} -> ${reference}`);
          continue;
        }

        const dependencyPath = resolveLocalTypeScript(reference, sourcePath);
        if (dependencyPath === undefined) continue;
        if (forbiddenSourceRoots.some(root => dependencyPath === root || dependencyPath.startsWith(`${root}/`))) {
          findings.push(`${relative(process.cwd(), sourcePath)} -> ${relative(process.cwd(), dependencyPath)}`);
          continue;
        }
        pending.push(dependencyPath);
      }
    }

    expect(findings).toEqual([]);
  });
});

function resolveLocalTypeScript(reference: string, sourcePath: string): string | undefined {
  if (!reference.startsWith('.')) return undefined;
  const unresolved = resolve(dirname(sourcePath), reference);
  const withoutExtension = extname(unresolved) === '' ? unresolved : unresolved.slice(0, -extname(unresolved).length);
  const candidates = [`${withoutExtension}.ts`, join(withoutExtension, 'index.ts')];
  return candidates.find(candidate => existsSync(candidate));
}
