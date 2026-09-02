import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const flexRoot = join(process.cwd(), 'src', 'flex');
const tailwindRoot = join(process.cwd(), 'src', 'adapter', 'tailwind');
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

  test('Tailwind modules no longer originate target-neutral semantic exports', () => {
    const semanticModel = readFileSync(join(tailwindRoot, 'tailwind-semantic.model.ts'), 'utf8');
    const valueParser = readFileSync(join(tailwindRoot, 'tailwind-value.parser.ts'), 'utf8');

    expect(semanticModel).not.toMatch(/\b(?:CssLength|ParsedValue|SemanticDiagnostic|SemanticResult)\b/u);
    expect(valueParser).not.toMatch(/\b(?:CssLength|CssLengthOptions|ParsedValue|parseCssLength)\b/u);
  });
});
