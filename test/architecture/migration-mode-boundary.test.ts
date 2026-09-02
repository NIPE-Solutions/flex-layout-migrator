import { join, relative } from 'node:path';

import { inspectTypeScriptProject, productionTypeScriptFiles } from './typescript-boundary';

const productionRoot = join(process.cwd(), 'src');
const fixtureRoot = join(productionRoot, '__architecture-fixture__');
const fixturePath = join(fixtureRoot, 'fixture.ts');
const wholeProjectInspectionTimeout = 20_000;

interface ExecutionModeInput {
  readonly sourcePath: string;
  readonly name: string;
}

function executionModeInputs(
  sources: ReadonlyMap<string, string>,
  entryPaths: readonly string[],
): readonly ExecutionModeInput[] {
  return inspectTypeScriptProject(entryPaths, sources).executionModeInputs;
}

function fixtureModeInputs(source: string): readonly ExecutionModeInput[] {
  return executionModeInputs(new Map([[fixturePath, source]]), [fixturePath]);
}

describe('migration mode architecture boundary', () => {
  test('detects the canonical MigrationMode type through an aliased type-only import', () => {
    const source = `
      import type { MigrationMode as RequestedExecution } from '../migrator/migration-mode.js';
      interface SemanticInput { readonly value: string }
      class CssAdapter { render(input: SemanticInput, execution: RequestedExecution) { return input; } }
    `;

    expect(fixtureModeInputs(source)).toEqual([{ sourcePath: fixturePath, name: 'execution' }]);
  });

  test("detects an inline mode: 'plan' | 'write' input", () => {
    const source = `
      interface SemanticInput { readonly value: string }
      class CssAdapter { render(input: SemanticInput, mode: 'plan' | 'write') { return input; } }
    `;

    expect(fixtureModeInputs(source)).toEqual([{ sourcePath: fixturePath, name: 'mode' }]);
  });

  test('detects a write boolean inside a planner options input', () => {
    const source = `
      class FileMigrator { plan(options: { readonly write: boolean }) { return options; } }
    `;

    expect(fixtureModeInputs(source)).toEqual([{ sourcePath: fixturePath, name: 'write' }]);
  });

  test('detects an execution mode input in private transaction internals', () => {
    const source = `
      class MigrationTransaction { private stage(mode: 'plan' | 'write') { return mode; } }
    `;

    expect(fixtureModeInputs(source)).toEqual([{ sourcePath: fixturePath, name: 'mode' }]);
  });

  test('follows imported execution-option types', () => {
    const optionsPath = join(fixtureRoot, 'execution-options.ts');
    const adapterPath = join(fixtureRoot, 'css.adapter.ts');
    const sources = new Map([
      [optionsPath, "export interface ExecutionOptions { readonly mode: 'plan' | 'write' }"],
      [
        adapterPath,
        "import type { ExecutionOptions } from './execution-options.js'; export class CssAdapter { render(options: ExecutionOptions) { return options; } }",
      ],
    ]);

    expect(executionModeInputs(sources, [adapterPath])).toEqual([{ sourcePath: adapterPath, name: 'mode' }]);
  });

  test.each([
    ['unrelated write-prefixed property', 'class Planner { plan(options: { writeDisposition: boolean }) {} }'],
    ['unrelated mode type', "class Planner { plan(mode: 'compact' | 'expanded') {} }"],
    [
      'documentation strings',
      "class Planner { plan(input: string) { return 'MigrationMode mode: plan | write and write: boolean'; } }",
    ],
    [
      'unused type-only import',
      "import type { MigrationMode } from '../migrator/migration-mode.js'; class Planner { plan(input: string) { return input; } }",
    ],
    [
      'report state consumed by a presenter',
      "import type { MigrationReport } from '../report/migration-report.js'; class TerminalPresenter { present(report: MigrationReport) { return report.mode; } }",
    ],
  ])('ignores %s', (_label, source) => {
    expect(fixtureModeInputs(source)).toEqual([]);
  });

  test(
    'keeps execution inputs out of adapters, semantic/rendering planners, file/folder planners, and transactions',
    () => {
      const scopedPaths = productionTypeScriptFiles(productionRoot).filter(path => {
        const sourcePath = relative(productionRoot, path).replaceAll('\\', '/');
        return (
          sourcePath.startsWith('adapter/') ||
          sourcePath.startsWith('analyzer/') ||
          sourcePath.startsWith('edit/') ||
          sourcePath.startsWith('flex/') ||
          sourcePath.startsWith('grid/') ||
          sourcePath.startsWith('image/') ||
          sourcePath.startsWith('planner/') ||
          sourcePath.startsWith('template/') ||
          sourcePath.startsWith('transaction/') ||
          sourcePath === 'migrator/file.migrator.ts' ||
          sourcePath === 'migrator/folder.migrator.ts' ||
          sourcePath === 'migrator/stylesheet.planner.ts'
        );
      });
      const findings = executionModeInputs(new Map(), scopedPaths);

      expect(
        findings.map(finding => ({ ...finding, sourcePath: relative(process.cwd(), finding.sourcePath) })),
      ).toEqual([]);
    },
    wholeProjectInspectionTimeout,
  );
});
