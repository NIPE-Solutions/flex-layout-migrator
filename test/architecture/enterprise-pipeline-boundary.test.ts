import { builtinModules } from 'node:module';
import { readFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

import { describe, expect, test } from 'vitest';

import {
  inspectTypeScript,
  inspectTypeScriptProject,
  moduleReferenceContainsPath,
  productionTypeScriptFiles,
  runtimeModuleReferences,
} from './typescript-boundary';

const productionRoot = join(process.cwd(), 'src');
const flexRoot = join(productionRoot, 'flex');
const atomicWriterPath = join(productionRoot, 'lib', 'atomic-file.writer.ts');
const packageManifest = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
  readonly dependencies?: Readonly<Record<string, string>>;
};
const declaredRuntimePackages = new Set(Object.keys(packageManifest.dependencies ?? {}));
const builtins = new Set([...builtinModules, ...builtinModules.map(moduleName => `node:${moduleName}`)]);

function externalPackage(reference: string): string | undefined {
  if (reference.startsWith('.') || reference.startsWith('/') || builtins.has(reference)) return undefined;
  const segments = reference.split('/');
  return reference.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
}

function containsLayer(reference: string, layers: readonly string[]): boolean {
  return layers.some(layer => moduleReferenceContainsPath(reference, layer));
}

describe('enterprise pipeline dependency boundary', { timeout: 20_000 }, () => {
  test('keeps Flex semantics independent from both target adapters', () => {
    for (const path of productionTypeScriptFiles(flexRoot)) {
      const targetImport = inspectTypeScript(readFileSync(path, 'utf8'), path).moduleReferences.find(reference =>
        containsLayer(reference, ['adapter/css', 'adapter/tailwind']),
      );

      expect(targetImport, relative(process.cwd(), path)).toBeUndefined();
    }
  });

  test('keeps renderers independent from filesystem and application control layers', () => {
    const rendererPaths = productionTypeScriptFiles(productionRoot).filter(path =>
      /(?:^|[.-])renderer\.ts$/u.test(basename(path)),
    );

    for (const path of rendererPaths) {
      const forbidden = inspectTypeScript(readFileSync(path, 'utf8'), path).moduleReferences.find(
        reference =>
          /^(?:node:)?fs(?:\/|$)/u.test(reference) || containsLayer(reference, ['cli', 'report', 'transaction']),
      );

      expect(forbidden, relative(process.cwd(), path)).toBeUndefined();
    }
  });

  test('keeps presenters independent from implementation and mutation layers', () => {
    const presenterPaths = productionTypeScriptFiles(productionRoot).filter(path =>
      /(?:^|[.-])presenter\.ts$/u.test(basename(path)),
    );

    for (const path of presenterPaths) {
      const forbidden = inspectTypeScript(readFileSync(path, 'utf8'), path).moduleReferences.find(reference =>
        containsLayer(reference, ['adapter', 'planner', 'migrator', 'transaction']),
      );

      expect(forbidden, relative(process.cwd(), path)).toBeUndefined();
    }
  });

  test('reserves project mutation APIs for transaction and atomic-writer modules', () => {
    const forbidden = inspectTypeScriptProject(
      productionTypeScriptFiles(productionRoot),
    ).filesystemMutationCalls.filter(
      finding =>
        !finding.sourcePath.startsWith(`${join(productionRoot, 'transaction')}/`) &&
        finding.sourcePath !== atomicWriterPath,
    );

    expect(forbidden).toEqual([]);
  });

  test('allows only the known undeclared ignore runtime package until the dependency slice', () => {
    const undeclared = productionTypeScriptFiles(productionRoot).flatMap(path =>
      runtimeModuleReferences(readFileSync(path, 'utf8'), path).flatMap(reference => {
        const packageName = externalPackage(reference);
        return packageName === undefined || declaredRuntimePackages.has(packageName) ? [] : [packageName];
      }),
    );

    expect([...new Set(undeclared)].sort()).toEqual(['ignore']);
  });
});
