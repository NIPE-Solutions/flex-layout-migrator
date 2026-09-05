import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve, sep, win32 } from 'node:path';

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
  test.each(['node:crypto', 'fs', 'fs/promises', 'fs-extra', 'fs-extra/esm', 'path', 'process'])(
    'recognizes forbidden runtime package %s',
    reference => {
      expect(isForbiddenPackage(reference)).toBe(true);
    },
  );

  test('recognizes forbidden source descendants with Windows path separators', () => {
    const root = String.raw`C:\workspace\src\cli`;

    expect(isForbiddenSourcePath(String.raw`C:\workspace\src\cli\run-cli.ts`, [root], win32)).toBe(true);
    expect(isForbiddenSourcePath(String.raw`C:\workspace\src\cli-tools\run.ts`, [root], win32)).toBe(false);
    expect(isForbiddenSourcePath(String.raw`D:\workspace\src\cli\run-cli.ts`, [root], win32)).toBe(false);
  });

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
        if (isForbiddenPackage(reference)) {
          findings.push(`${relative(process.cwd(), sourcePath)} -> ${reference}`);
          continue;
        }

        const dependencyPath = resolveLocalTypeScript(reference, sourcePath);
        if (dependencyPath === undefined) continue;
        if (isForbiddenSourcePath(dependencyPath, forbiddenSourceRoots)) {
          findings.push(`${relative(process.cwd(), sourcePath)} -> ${relative(process.cwd(), dependencyPath)}`);
          continue;
        }
        pending.push(dependencyPath);
      }
    }

    expect(findings).toEqual([]);
  });
});

function isForbiddenPackage(reference: string): boolean {
  return (
    reference.startsWith('node:') ||
    forbiddenPackages.has(reference) ||
    reference === 'fs-extra' ||
    reference.startsWith('fs-extra/')
  );
}

interface PathContainment {
  readonly isAbsolute: (path: string) => boolean;
  readonly relative: (from: string, to: string) => string;
  readonly sep: string;
}

function isForbiddenSourcePath(
  dependencyPath: string,
  roots: readonly string[],
  paths: PathContainment = { isAbsolute, relative, sep },
): boolean {
  return roots.some(root => {
    const descendant = paths.relative(root, dependencyPath);
    return (
      descendant === '' ||
      (descendant !== '..' && !descendant.startsWith(`..${paths.sep}`) && !paths.isAbsolute(descendant))
    );
  });
}

function resolveLocalTypeScript(reference: string, sourcePath: string): string | undefined {
  if (!reference.startsWith('.')) return undefined;
  const unresolved = resolve(dirname(sourcePath), reference);
  const withoutExtension = extname(unresolved) === '' ? unresolved : unresolved.slice(0, -extname(unresolved).length);
  const candidates = [`${withoutExtension}.ts`, join(withoutExtension, 'index.ts')];
  return candidates.find(candidate => existsSync(candidate));
}
