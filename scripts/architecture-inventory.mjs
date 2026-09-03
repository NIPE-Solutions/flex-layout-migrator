import { execFileSync } from 'node:child_process';
import { builtinModules } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { posix, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const builtinModuleNames = new Set([...builtinModules, ...builtinModules.map(name => `node:${name}`)]);
const policySymbols = Object.freeze([
  ['artifact identity', 'CssArtifactRegistry'],
  ['breakpoint classification', 'BreakpointCatalog'],
  ['diagnostics', 'DiagnosticCode'],
  ['responsive precedence', 'SharedResponsiveFamilyPlanner'],
  ['semantic planning', 'ConversionPlanner'],
  ['transaction recovery', 'MigrationTransaction'],
]);

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizedPath(path) {
  return path.replaceAll('\\', '/').replace(/^\.\//u, '');
}

function physicalLineCount(source) {
  if (source.length === 0) return 0;
  const lineBreaks = source.match(/\r\n|\r|\n/gu)?.length ?? 0;
  return lineBreaks + (/(?:\r\n|\r|\n)$/u.test(source) ? 0 : 1);
}

function moduleText(expression) {
  return expression && ts.isStringLiteralLike(expression) ? expression.text : undefined;
}

function runtimeImportReference(node) {
  const reference = moduleText(node.moduleSpecifier);
  if (reference === undefined) return undefined;
  const clause = node.importClause;
  if (clause === undefined) return reference;
  if (clause.isTypeOnly) return undefined;
  if (clause.name !== undefined || clause.namedBindings === undefined) return reference;
  if (ts.isNamespaceImport(clause.namedBindings)) return reference;
  return clause.namedBindings.elements.some(element => !element.isTypeOnly) ? reference : undefined;
}

function runtimeExportReference(node) {
  const reference = moduleText(node.moduleSpecifier);
  if (reference === undefined || node.isTypeOnly) return undefined;
  if (node.exportClause === undefined || !ts.isNamedExports(node.exportClause)) return reference;
  return node.exportClause.elements.some(element => !element.isTypeOnly) ? reference : undefined;
}

function inspectSource(path, source) {
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const moduleReferences = [];
  const runtimeReferences = [];
  const symbols = new Set();

  function visit(node) {
    let moduleReference;
    let runtimeReference;
    if (ts.isImportDeclaration(node)) {
      moduleReference = moduleText(node.moduleSpecifier);
      runtimeReference = runtimeImportReference(node);
    } else if (ts.isExportDeclaration(node)) {
      moduleReference = moduleText(node.moduleSpecifier);
      runtimeReference = runtimeExportReference(node);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      moduleReference = moduleText(node.moduleReference.expression);
      if (!node.isTypeOnly) runtimeReference = moduleReference;
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      moduleReference = moduleText(node.arguments[0]);
      runtimeReference = moduleReference;
    }
    if (moduleReference !== undefined) moduleReferences.push(moduleReference);
    if (runtimeReference !== undefined) runtimeReferences.push(runtimeReference);

    if (
      (ts.isClassDeclaration(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isEnumDeclaration(node)) &&
      node.name !== undefined
    ) {
      symbols.add(node.name.text);
    } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      symbols.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { moduleReferences, runtimeReferences, symbols };
}

function packageName(reference) {
  if (reference.startsWith('.') || reference.startsWith('/') || builtinModuleNames.has(reference)) return undefined;
  const segments = reference.split('/');
  return reference.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
}

function relativeTarget(from, reference, knownPaths) {
  const unresolved = posix.normalize(posix.join(posix.dirname(from), reference));
  const withoutExtension = unresolved.replace(/\.[cm]?[jt]sx?$/u, '');
  const candidates = [`${withoutExtension}.ts`, posix.join(withoutExtension, 'index.ts')];
  return candidates.find(candidate => knownPaths.has(candidate)) ?? unresolved;
}

function lockfileVersion(packageLock, name) {
  return packageLock?.packages?.[`node_modules/${name}`]?.version ?? null;
}

/**
 * Builds a deterministic architecture inventory from in-memory project inputs.
 * The function performs no filesystem or process I/O.
 */
export function inventoryProject(input) {
  const files = input.productionFiles
    .map(file => ({ path: normalizedPath(file.path), source: file.source }))
    .sort((left, right) => compareCodeUnits(left.path, right.path));
  const knownPaths = new Set(files.map(file => file.path));
  const inspections = files.map(file => ({ ...file, ...inspectSource(file.path, file.source) }));
  const importedByPackage = new Map();
  const moduleEdges = [];

  for (const file of inspections) {
    for (const reference of new Set(file.moduleReferences)) {
      if (reference.startsWith('.')) {
        moduleEdges.push({ from: file.path, kind: 'relative', to: relativeTarget(file.path, reference, knownPaths) });
      }
    }
    for (const reference of new Set(file.runtimeReferences)) {
      if (reference.startsWith('.')) continue;
      if (builtinModuleNames.has(reference)) {
        moduleEdges.push({ from: file.path, kind: 'builtin', to: reference });
        continue;
      }
      const name = packageName(reference);
      if (name === undefined) continue;
      moduleEdges.push({ from: file.path, kind: 'external', to: name });
      const importers = importedByPackage.get(name) ?? new Set();
      importers.add(file.path);
      importedByPackage.set(name, importers);
    }
  }

  moduleEdges.sort((left, right) =>
    compareCodeUnits(`${left.from}\0${left.to}\0${left.kind}`, `${right.from}\0${right.to}\0${right.kind}`),
  );

  const dependencies = input.packageJson.dependencies ?? {};
  const dependencyNames = new Set([...Object.keys(dependencies), ...importedByPackage.keys()]);
  const runtimeDependencies = [...dependencyNames].sort(compareCodeUnits).map(name => {
    const importedBy = [...(importedByPackage.get(name) ?? [])].sort(compareCodeUnits);
    return {
      name,
      declared: dependencies[name] ?? null,
      resolved: lockfileVersion(input.packageLock, name),
      importedBy,
      status: importedBy.length > 0 ? 'used' : 'unused',
    };
  });

  const productionFiles = files.map(file => ({ path: file.path, lines: physicalLineCount(file.source) }));
  const largestFiles = [...productionFiles]
    .sort((left, right) => right.lines - left.lines || compareCodeUnits(left.path, right.path))
    .slice(0, 20);
  const policyOwners = policySymbols.flatMap(([policy, symbol]) =>
    inspections.filter(file => file.symbols.has(symbol)).map(file => ({ policy, module: file.path, symbol })),
  );

  return { productionFiles, runtimeDependencies, largestFiles, moduleEdges, policyOwners };
}

function parseOutputPath(argv) {
  if (argv.length !== 2 || argv[0] !== '--json' || !argv[1]) {
    throw new Error('Usage: npm run architecture:inventory -- --json <path>');
  }
  return resolve(argv[1]);
}

function trackedProductionPaths(repository) {
  return execFileSync('git', ['ls-files', '--', ':(glob)src/**/*.ts'], { cwd: repository, encoding: 'utf8' })
    .split(/\r?\n/u)
    .filter(path => path !== '' && !path.endsWith('.spec.ts'))
    .sort(compareCodeUnits);
}

export async function main(argv = process.argv.slice(2)) {
  const repository = resolve(import.meta.dirname, '..');
  const outputPath = parseOutputPath(argv);
  const productionFiles = await Promise.all(
    trackedProductionPaths(repository).map(async path => ({
      path,
      source: await readFile(resolve(repository, path), 'utf8'),
    })),
  );
  const [packageJson, packageLock] = await Promise.all(
    ['package.json', 'package-lock.json'].map(async path =>
      JSON.parse(await readFile(resolve(repository, path), 'utf8')),
    ),
  );
  const inventory = inventoryProject({ productionFiles, packageJson, packageLock });
  await writeFile(outputPath, `${JSON.stringify(inventory, null, 2)}\n`, 'utf8');
  process.stdout.write(`Architecture inventory written to ${outputPath}\n`);
}

function isDirectInvocation() {
  return process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isDirectInvocation()) {
  void main().catch(error => {
    process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
