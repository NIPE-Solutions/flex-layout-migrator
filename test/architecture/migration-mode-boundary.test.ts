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

describe('migration mode architecture boundary', { timeout: wholeProjectInspectionTimeout }, () => {
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
    [
      'renamed property',
      `
        import type { MigrationMode as RequestedExecution } from '../migrator/migration-mode.js';
        class CssAdapter { render(options: { execution: RequestedExecution }) { return options; } }
      `,
      'execution',
    ],
    [
      'nested option',
      `
        import type { MigrationMode as RequestedExecution } from '../migrator/migration-mode.js';
        class CssAdapter { render(options: { request: { execution: RequestedExecution } }) { return options; } }
      `,
      'execution',
    ],
    [
      'doubly nested optional option',
      `
        import type { MigrationMode as RequestedExecution } from '../migrator/migration-mode.js';
        class CssAdapter {
          render(options: { request?: { execution?: { selected?: RequestedExecution } } }) { return options; }
        }
      `,
      'selected',
    ],
    [
      'optional structural mode',
      "class CssAdapter { render(options: { mode?: 'plan' | 'write' }) { return options; } }",
      'mode',
    ],
    [
      'optional write authorization',
      'class FileMigrator { plan(options: { write?: boolean }) { return options; } }',
      'write',
    ],
  ])('follows a canonical or structural execution input through a %s', (_label, source, expectedName) => {
    expect(fixtureModeInputs(source)).toEqual([{ sourcePath: fixturePath, name: expectedName }]);
  });

  test.each([
    [
      'nullable and optional union',
      `
        import type { MigrationMode as RequestedExecution } from '../migrator/migration-mode.js';
        class CssAdapter { render(execution: RequestedExecution | null | undefined) { return execution; } }
      `,
      'execution',
    ],
    [
      'union with a non-authorizing alternative',
      `
        import type { MigrationMode as RequestedExecution } from '../migrator/migration-mode.js';
        class CssAdapter { render(execution: RequestedExecution | 'inherit') { return execution; } }
      `,
      'execution',
    ],
    [
      'array container',
      `
        import type { MigrationMode as RequestedExecution } from '../migrator/migration-mode.js';
        class CssAdapter { render(executions: RequestedExecution[]) { return executions; } }
      `,
      'executions',
    ],
    [
      'readonly array container',
      `
        import type { MigrationMode as RequestedExecution } from '../migrator/migration-mode.js';
        class CssAdapter { render(executions: ReadonlyArray<RequestedExecution>) { return executions; } }
      `,
      'executions',
    ],
    [
      'nested generic containers',
      `
        import type { MigrationMode as RequestedExecution } from '../migrator/migration-mode.js';
        interface Box<T> { readonly value: T }
        class CssAdapter {
          render(request: Promise<Box<ReadonlyArray<RequestedExecution | null>>>) { return request; }
        }
      `,
      'request',
    ],
  ])('follows canonical MigrationMode through a %s', (_label, source, expectedName) => {
    expect(fixtureModeInputs(source)).toEqual([{ sourcePath: fixturePath, name: expectedName }]);
  });

  test.each([
    [
      'named tuple member',
      `
        import type { MigrationMode as RequestedExecution } from '../migrator/migration-mode.js';
        class CssAdapter { render(request: [execution: RequestedExecution]) { return request; } }
      `,
    ],
    [
      'optional named tuple member',
      `
        import type { MigrationMode as RequestedExecution } from '../migrator/migration-mode.js';
        class CssAdapter { render(request: [execution?: RequestedExecution]) { return request; } }
      `,
    ],
    [
      'rest named tuple member',
      `
        import type { MigrationMode as RequestedExecution } from '../migrator/migration-mode.js';
        class CssAdapter { render(request: [...executions: RequestedExecution[]]) { return request; } }
      `,
    ],
  ])('unwraps a canonical MigrationMode in a %s', (_label, source) => {
    expect(fixtureModeInputs(source)).toEqual([{ sourcePath: fixturePath, name: 'request' }]);
  });

  test.each([
    ['unrelated write-prefixed property', 'class Planner { plan(options: { writeDisposition: boolean }) {} }'],
    ['unrelated mode type', "class Planner { plan(mode: 'compact' | 'expanded') {} }"],
    [
      'structural mode union under an unrelated property name',
      "class Planner { plan(options: { execution: 'plan' | 'write' }) {} }",
    ],
    ['non-boolean write option', "class Planner { plan(options: { write?: 'enabled' | 'disabled' }) {} }"],
    [
      'same-named local mode alias without canonical provenance',
      "type MigrationMode = 'plan' | 'write'; class Planner { plan(options: { execution: MigrationMode }) {} }",
    ],
    [
      'same-shaped named type inside nested generic containers',
      `
        type PreviewMode = 'plan' | 'write';
        interface Box<T> { readonly value: T }
        class Planner { plan(request: Promise<Box<ReadonlyArray<PreviewMode | null>>>) { return request; } }
      `,
    ],
    [
      'same-shaped named type in a named tuple member',
      `
        type PreviewMode = 'plan' | 'write';
        class Planner { plan(request: [preview: PreviewMode]) { return request; } }
      `,
    ],
    [
      'same-shaped named type in an optional named tuple member',
      `
        type PreviewMode = 'plan' | 'write';
        class Planner { plan(request: [preview?: PreviewMode]) { return request; } }
      `,
    ],
    [
      'same-shaped named type in a rest named tuple member',
      `
        type PreviewMode = 'plan' | 'write';
        class Planner { plan(request: [...previews: PreviewMode[]]) { return request; } }
      `,
    ],
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
