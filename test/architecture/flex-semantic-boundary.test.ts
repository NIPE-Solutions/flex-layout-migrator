import { readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

const flexRoot = join(process.cwd(), 'src', 'flex');
const tailwindRoot = join(process.cwd(), 'src', 'adapter', 'tailwind');
const strategyFixturePath = join(tailwindRoot, 'directives', 'strategy.ts');
const targetTokens = ['flex-row', 'box-border', '[@media_'];
const tailwindModuleReference = 'adapter/tailwind';
const adapterModuleReference = 'adapter/';

const scopedStrategies = [
  ['layout.strategy.ts', 'parseLayout', 'layout.semantic'],
  ['layout-align.strategy.ts', 'planLayoutAlignment', 'layout-align.semantic'],
  ['layout-gap.strategy.ts', 'planLayoutGapSemantics', 'layout-gap.semantic'],
  ['flex-item.strategy.ts', 'planFlexItemSemantics', 'flex-item.semantic'],
  ['flex-align.strategy.ts', 'planFlexAlignSemantics', 'flex-align.semantic'],
  ['flex-fill.strategy.ts', 'planFlexFillSemantics', 'flex-fill.semantic'],
  ['flex-offset.strategy.ts', 'planFlexOffsetSemantics', 'flex-offset.semantic'],
  ['flex-order.strategy.ts', 'planFlexOrderSemantics', 'flex-order.semantic'],
] as const;

function hasSemanticCoreReExport(source: string, sourcePath = strategyFixturePath): boolean {
  const sourceFile = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const semanticCoreImports = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !isSemanticCoreModule(statement.moduleSpecifier, sourcePath)) continue;

    const importClause = statement.importClause;
    if (!importClause) continue;
    if (importClause.name) semanticCoreImports.add(importClause.name.text);

    const bindings = importClause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) {
      semanticCoreImports.add(bindings.name.text);
    } else if (bindings) {
      for (const element of bindings.elements) semanticCoreImports.add(element.name.text);
    }
  }

  return sourceFile.statements.some(statement => {
    if (ts.isExportAssignment(statement)) {
      return ts.isIdentifier(statement.expression) && semanticCoreImports.has(statement.expression.text);
    }
    if (!ts.isExportDeclaration(statement)) return false;
    if (statement.moduleSpecifier) return isSemanticCoreModule(statement.moduleSpecifier, sourcePath);
    if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) return false;

    return statement.exportClause.elements.some(element =>
      semanticCoreImports.has((element.propertyName ?? element.name).text),
    );
  });
}

function isSemanticCoreModule(moduleSpecifier: ts.Expression, sourcePath: string): boolean {
  if (!ts.isStringLiteralLike(moduleSpecifier) || !/^\.{1,2}(?:\/|$)/u.test(moduleSpecifier.text)) return false;

  const resolvedModule = resolve(dirname(sourcePath), moduleSpecifier.text);
  const pathFromFlexRoot = relative(flexRoot, resolvedModule);

  return (
    pathFromFlexRoot === '' ||
    (pathFromFlexRoot !== '..' && !isAbsolute(pathFromFlexRoot) && !pathFromFlexRoot.startsWith(`..${sep}`))
  );
}

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
    "import '../../adapter/tailwind/directives/layout.strategy';",
    "import /* target renderer */ '../../adapter/tailwind/directives/layout.strategy';",
  ])('rejects Tailwind module reference: %s', source => {
    expect(source).toContain(tailwindModuleReference);
  });

  test('contains no Tailwind dependencies or target syntax', () => {
    for (const path of sourceFiles(flexRoot)) {
      const source = readFileSync(path, 'utf8');
      const sourcePath = relative(process.cwd(), path);

      expect(source, sourcePath).not.toContain(tailwindModuleReference);
      expect(source, sourcePath).not.toContain(adapterModuleReference);
      for (const token of targetTokens) {
        expect(source, sourcePath).not.toContain(token);
      }
      expect(source, sourcePath).not.toMatch(/\[[a-z-]+:/u);
    }
  });

  test.each(scopedStrategies)('%s imports its target-neutral planner', (fileName, planner, semanticModule) => {
    const source = readFileSync(join(tailwindRoot, 'directives', fileName), 'utf8');
    const plannerImport = new RegExp(
      String.raw`import\s*\{[^}]*\b${planner}\b[^}]*\}\s*from\s*['"]\.\./\.\./\.\./flex/${semanticModule}['"]`,
      'u',
    );

    expect(source).toMatch(plannerImport);
  });

  test.each(scopedStrategies)('%s does not re-export target-neutral semantic-core types', fileName => {
    const sourcePath = join(tailwindRoot, 'directives', fileName);
    const source = readFileSync(sourcePath, 'utf8');

    expect(hasSemanticCoreReExport(source, sourcePath)).toBe(false);
  });

  test.each([
    "export type * from '../../../flex/flex-item.semantic';",
    ["import type { FlexItemInput } from '../../../flex/flex-item.semantic';", 'export type { FlexItemInput };'].join(
      '\n',
    ),
  ])('rejects semantic-core type re-export: %s', source => {
    expect(hasSemanticCoreReExport(source)).toBe(true);
  });

  test('rejects an imported semantic-core planner assigned as the default export', () => {
    const source = [
      "import { planFlexItemSemantics } from '../../../flex/flex-item.semantic';",
      'export default planFlexItemSemantics;',
    ].join('\n');

    expect(hasSemanticCoreReExport(source)).toBe(true);
  });

  test.each(["export * from '@vendor/flex/helpers';", "export * from '../../../';"])(
    'allows modules outside the project semantic core: %s',
    source => {
      expect(hasSemanticCoreReExport(source)).toBe(false);
    },
  );

  test('Tailwind modules no longer originate target-neutral semantic exports', () => {
    const semanticModel = readFileSync(join(tailwindRoot, 'tailwind-semantic.model.ts'), 'utf8');
    const valueParser = readFileSync(join(tailwindRoot, 'tailwind-value.parser.ts'), 'utf8');

    expect(semanticModel).not.toMatch(/\b(?:CssLength|ParsedValue|SemanticDiagnostic|SemanticResult)\b/u);
    expect(valueParser).not.toMatch(/\b(?:CssLength|CssLengthOptions|ParsedValue|parseCssLength)\b/u);
  });
});
