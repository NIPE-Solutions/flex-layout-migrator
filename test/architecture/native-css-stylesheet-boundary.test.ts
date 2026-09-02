import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

import {
  inspectTypeScript,
  productionTypeScriptFiles,
  runtimeModuleReferences,
  type TypeScriptInspection,
} from './typescript-boundary';

const stylesheetRoot = join(process.cwd(), 'src', 'adapter', 'css', 'stylesheet');
const fixturePath = join(stylesheetRoot, 'fixture.ts');

const nodeIoModule = /^(?:node:)?(?:fs|path)(?:\/|$)/u;
const forbiddenLayer = /(?:^|\/)(?:analyzer|cli|migrator|planner|tailwind|template)(?:\/|$)/u;
const atomicFileWriterModule = /(?:^|\/)atomic-file\.writer(?:\.[cm]?[jt]s)?$/u;
const absolutePath = /^(?:\/(?![*/])|[a-z]:[\\/]|\\\\)/iu;
const packageVersionIdentifier = /^(?:PACKAGE_VERSION|npm_package_version|packageVersion)$/u;
const packageManifestModule = /(?:^|\/)package\.json$/u;
const ownedBlockSerializerModule = /(?:^|\/)owned-css-block\.serializer(?:\.[cm]?[jt]s)?$/u;
const breakpointCatalogModule = /(?:^|\/)breakpoint-catalog(?:\.[cm]?[jt]s)?$/u;
const generatedMarkerForms = new Set([
  '/* flex-layout-codemod:start schema=1 */',
  '/* flex-layout-codemod:rule id=${} */',
  '/* flex-layout-codemod:end */',
]);

function forbiddenDependency(inspection: TypeScriptInspection): string | undefined {
  return (
    inspection.moduleReferences.find(
      reference =>
        nodeIoModule.test(reference) || forbiddenLayer.test(reference) || atomicFileWriterModule.test(reference),
    ) ?? inspection.identifiers.find(identifier => identifier === 'AtomicFileWriter')
  );
}

function sourceFile(source: string, sourcePath: string): ts.SourceFile {
  return ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function runtimeLocalDependencies(source: string, sourcePath: string): readonly string[] {
  return runtimeModuleReferences(source, sourcePath).flatMap(reference => {
    if (!reference.startsWith('.')) return [];
    const base = resolve(dirname(sourcePath), reference);
    const target = [`${base}.ts`, join(base, 'index.ts')].find(candidate => existsSync(candidate));
    return target === undefined ? [] : [target];
  });
}

function runtimeDependencyClosure(entry: string): readonly string[] {
  const visited = new Set<string>();
  const pending = [entry];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || visited.has(current)) continue;
    visited.add(current);
    pending.push(...runtimeLocalDependencies(readFileSync(current, 'utf8'), current));
  }
  return [...visited];
}

function isCssDelimiterComparison(node: ts.Node): boolean {
  if (!ts.isStringLiteralLike(node) || node.text !== '/' || !ts.isBinaryExpression(node.parent)) return false;

  const parent = node.parent;
  const isEqualityOperator = [
    ts.SyntaxKind.EqualsEqualsToken,
    ts.SyntaxKind.EqualsEqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsToken,
    ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ].includes(parent.operatorToken.kind);
  const compared = parent.left === node ? parent.right : parent.left;

  return (
    isEqualityOperator &&
    ((ts.isIdentifier(compared) && compared.text === 'codeUnit') || ts.isElementAccessExpression(compared))
  );
}

function generatedMarkers(source: string, sourcePath: string): readonly string[] {
  const markers: string[] = [];

  function visit(node: ts.Node): void {
    if (ts.isStringLiteralLike(node) && node.text.startsWith('/* flex-layout-codemod:')) {
      markers.push(node.text);
    } else if (ts.isTemplateExpression(node) && node.head.text.startsWith('/* flex-layout-codemod:')) {
      markers.push(node.head.text + node.templateSpans.map(span => '${}' + span.literal.text).join(''));
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile(source, sourcePath));
  return markers;
}

function absolutePathLiteral(source: string, sourcePath: string): string | undefined {
  let match: string | undefined;

  function visit(node: ts.Node): void {
    if (match !== undefined) return;
    if (
      (ts.isStringLiteralLike(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node)) &&
      absolutePath.test(node.text) &&
      !isCssDelimiterComparison(node)
    ) {
      match = node.text;
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile(source, sourcePath));
  return match;
}

function packageVersionRead(inspection: TypeScriptInspection): string | undefined {
  return (
    inspection.moduleReferences.find(reference => packageManifestModule.test(reference)) ??
    [...inspection.identifiers, ...inspection.literalTexts].find(token => packageVersionIdentifier.test(token))
  );
}

function usesOwnedBlockSerializer(inspection: TypeScriptInspection): boolean {
  return (
    inspection.moduleReferences.some(reference => ownedBlockSerializerModule.test(reference)) &&
    inspection.identifiers.includes('serializeOwnedCssBlock')
  );
}

describe('native CSS stylesheet architecture boundary', () => {
  test.each([
    ['Node filesystem import', "import { readFileSync } from 'node:fs';"],
    ['Node filesystem import type', "type Path = import('node:fs').PathLike;"],
    ['Node path re-export', "export { join } from 'node:path';"],
    ['CLI dynamic import', "const cli = import('../../../cli/run-cli');"],
    ['migrator require', "const migrator = require('../../../migrator/file.migrator');"],
    ['planner import-equals', "import planner = require('../../../planner/native-css.planner');"],
    ['template type import', "import type { Template } from '../../../template/template.model';"],
    ['Tailwind side-effect import', "import '../../tailwind/tailwind.adapter';"],
    ['analyzer re-export', "export * from '../../../analyzer/flex-layout-attribute.analyzer';"],
    ['breakpoint catalog import', "import { allBreakpointDefinitions } from '../../../breakpoint/breakpoint-catalog';"],
    ['AtomicFileWriter import', "import { AtomicFileWriter } from '../../../lib/atomic-file.writer';"],
  ])('rejects the %s dependency mutation', (_label, source) => {
    expect(
      forbiddenDependency(inspectTypeScript(source, fixturePath)) ??
        runtimeModuleReferences(source, fixturePath).find(reference => breakpointCatalogModule.test(reference)),
    ).toBeDefined();
  });

  test('keeps stylesheet runtime production code independent from the breakpoint catalog', () => {
    for (const path of productionTypeScriptFiles(stylesheetRoot)) {
      expect(
        runtimeModuleReferences(readFileSync(path, 'utf8'), path).find(reference =>
          breakpointCatalogModule.test(reference),
        ),
        relative(process.cwd(), path),
      ).toBeUndefined();
    }
  });

  test('keeps stylesheet production runtime dependency closures independent from breakpoint catalog and analyzer modules', () => {
    const breakpointCatalogPath = join(process.cwd(), 'src', 'breakpoint', 'breakpoint-catalog.ts');
    const analyzerRoot = `${join(process.cwd(), 'src', 'analyzer')}/`;
    for (const entry of productionTypeScriptFiles(stylesheetRoot)) {
      const forbidden = runtimeDependencyClosure(entry).find(
        path => path === breakpointCatalogPath || path.startsWith(analyzerRoot),
      );
      expect(forbidden, relative(process.cwd(), entry)).toBeUndefined();
    }
  });

  test.each([
    ['side-effect import', "import './breakpoint-catalog';"],
    ['re-export', "export * from './breakpoint-catalog';"],
    ['import-equals', "import catalog = require('./breakpoint-catalog');"],
    ['dynamic import', "void import('./breakpoint-catalog');"],
    ['require call', "require('./breakpoint-catalog');"],
  ])('finds a runtime %s edge', (_label, source) => {
    expect(runtimeModuleReferences(source, fixturePath)).toContain('./breakpoint-catalog');
  });

  test.each([
    "import type { BreakpointDefinition } from './breakpoint-catalog';",
    "import { type BreakpointDefinition } from './breakpoint-catalog';",
    "import type Catalog = require('./breakpoint-catalog');",
    "export type { BreakpointDefinition } from './breakpoint-catalog';",
  ])('excludes a type-only edge from the runtime dependency graph: %s', source => {
    expect(runtimeModuleReferences(source, fixturePath)).toEqual([]);
  });

  test('recursively keeps stylesheet production modules independent from I/O and application layers', () => {
    for (const path of productionTypeScriptFiles(stylesheetRoot)) {
      expect(
        forbiddenDependency(inspectTypeScript(readFileSync(path, 'utf8'), path)),
        relative(process.cwd(), path),
      ).toBeUndefined();
    }
  });

  test.each([
    ['POSIX root', "const target = '/';"],
    ['POSIX root comparison', "const isRoot = target === '/';"],
    ['POSIX', "const target = '/tmp/owned.css';"],
    ['Windows drive', String.raw`const target = 'C:\\temp\\owned.css';`],
    ['Windows UNC', String.raw`const target = '\\\\server\\share\\owned.css';`],
  ])('rejects a %s absolute-path mutation', (_label, source) => {
    expect(absolutePathLiteral(source, fixturePath)).toBeDefined();
  });

  test.each([
    ['CSS slash delimiter comparison', "const isSlash = codeUnit === '/';"],
    ['ownership comment prefix', "const marker = '/* flex-layout-codemod:start schema=1 */';"],
    ['line-comment prefix', "const prefix = '//';"],
  ])('does not mistake a %s for an absolute path', (_label, source) => {
    expect(absolutePathLiteral(source, fixturePath)).toBeUndefined();
  });

  test.each([
    ['package manifest import', "import manifest from '../../../../package.json';"],
    ['npm package environment read', 'const value = process.env.npm_package_version;'],
    ['package-version identifier', "const packageVersion = '2.0.0';"],
  ])('rejects a %s mutation', (_label, source) => {
    expect(packageVersionRead(inspectTypeScript(source, fixturePath))).toBeDefined();
  });

  test('keeps absolute paths and package-version reads out of stylesheet production modules', () => {
    for (const path of productionTypeScriptFiles(stylesheetRoot)) {
      const source = readFileSync(path, 'utf8');
      const inspection = inspectTypeScript(source, path);
      const sourcePath = relative(process.cwd(), path);

      expect(absolutePathLiteral(source, path), sourcePath).toBeUndefined();
      expect(packageVersionRead(inspection), sourcePath).toBeUndefined();
    }
  });

  test.each([
    ['schema drift', "const marker = '/* flex-layout-codemod:start schema=2 */';"],
    ['rule grammar drift', 'const marker = `/* flex-layout-codemod:rule id=${id} generated */`;'],
    ['end-marker drift', "const marker = '/* flex-layout-codemod:end schema=1 */';"],
  ])('rejects a %s mutation', (_label, source) => {
    expect(generatedMarkers(source, fixturePath).some(marker => !generatedMarkerForms.has(marker))).toBe(true);
  });

  test('permits exactly the three schema-1 generated marker forms in production', () => {
    const markers = productionTypeScriptFiles(stylesheetRoot).flatMap(path =>
      generatedMarkers(readFileSync(path, 'utf8'), path),
    );

    expect([...new Set(markers)].sort()).toEqual([...generatedMarkerForms].sort());
  });

  test.each([
    [
      'direct call and concatenation',
      `
        import { serializeOwnedCssBlock } from './owned-css-block.serializer';
        export function compose(existing: string, rules: readonly OwnedCssRule[]): string {
          const block = serializeOwnedCssBlock(rules, '\\n');
          return existing + block;
        }
      `,
    ],
    [
      'aliased call with renamed values and template interpolation',
      `
        import { serializeOwnedCssBlock as emitOwned } from './owned-css-block.serializer';
        export function compose(original: string, artifacts: readonly OwnedCssRule[]): string {
          const generated = emitOwned(artifacts, '\\n');
          return \`\${original}\${generated}\`;
        }
      `,
    ],
  ])('detects a non-merger owned-block serializer import: %s', (_label, source) => {
    expect(usesOwnedBlockSerializer(inspectTypeScript(source, fixturePath))).toBe(true);
  });

  test('makes the merger the only stylesheet module that imports and uses the owned-block serializer', () => {
    const consumers = productionTypeScriptFiles(stylesheetRoot).flatMap(path => {
      const inspection = inspectTypeScript(readFileSync(path, 'utf8'), path);
      return usesOwnedBlockSerializer(inspection) ? [basename(path)] : [];
    });

    expect(consumers).toEqual(['owned-stylesheet.merger.ts']);
  });

  test('ignores prohibited dependency, marker, path, version, and composition text in comments', () => {
    const source = `
      // import { readFileSync } from 'node:fs';
      // import { serializeOwnedCssBlock } from './owned-css-block.serializer';
      // export * from '../../../planner/native-css.planner';
      // const target = '/tmp/owned.css';
      // const packageVersion = process.env.npm_package_version;
      // const marker = '/* flex-layout-codemod:start schema=2 */';
      // const block = serializeOwnedCssBlock(rules, '\\n');
      // return existing + block;
      export const harmless = 'relative.css';
    `;
    const inspection = inspectTypeScript(source, fixturePath);

    expect(forbiddenDependency(inspection)).toBeUndefined();
    expect(absolutePathLiteral(source, fixturePath)).toBeUndefined();
    expect(packageVersionRead(inspection)).toBeUndefined();
    expect(generatedMarkers(source, fixturePath)).toEqual([]);
    expect(usesOwnedBlockSerializer(inspection)).toBe(false);
  });
});
