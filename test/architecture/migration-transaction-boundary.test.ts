import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import {
  createTypeScriptProjectInspectionSession,
  inspectTypeScript,
  inspectTypeScriptProject,
  inspectSemanticAuthorityCalls,
  productionTypeScriptFiles,
  runtimeModuleReferences,
  type TypeScriptInspection,
  type TypeScriptProjectInspection,
} from './typescript-boundary';

const productionRoot = join(process.cwd(), 'src');
const transactionRoot = join(productionRoot, 'transaction');
const migrationTransactionPath = join(transactionRoot, 'migration-transaction.ts');
const transactionUnitPaths = [
  join(transactionRoot, 'staging.unit.ts'),
  join(transactionRoot, 'commit.unit.ts'),
  join(transactionRoot, 'rollback.unit.ts'),
  join(transactionRoot, 'cleanup.unit.ts'),
];
const applyProjectStagePath = join(productionRoot, 'pipeline', 'apply', 'apply-project.stage.ts');
const adapterRoot = join(productionRoot, 'adapter');
const migratorRoot = join(productionRoot, 'migrator');
const migrationRunnerPath = join(productionRoot, 'pipeline', 'migration-runner.ts');
const reportRoot = join(productionRoot, 'report');
const atomicFileWriterPath = join(productionRoot, 'lib', 'atomic-file.writer.ts');
const jsonReportWriterPath = join(productionRoot, 'report', 'json-report.writer.ts');
const terminalPresenterPath = join(reportRoot, 'terminal.presenter.ts');
const fixturePath = join(productionRoot, 'fixture.ts');
const projectFixtureRoot = join(productionRoot, '__architecture-fixture__');
const wholeProjectInspectionTimeout = 60_000;

const forbiddenMigratorCalls = new Set(['rename', 'unlink', 'writeFile']);
const atomicFileWriterModule = /(?:^|\/)atomic-file\.writer(?:\.[cm]?[jt]s)?$/u;

function inspectProject(
  sources: ReadonlyMap<string, string>,
  entryPaths: readonly string[],
): TypeScriptProjectInspection {
  return inspectTypeScriptProject(entryPaths, sources);
}

function mutationCall(source: string, sourcePath = fixturePath): string | undefined {
  return inspectProject(new Map([[sourcePath, source]]), [sourcePath]).filesystemMutationCalls[0]?.name;
}

function forbiddenMigratorMutation(inspection: TypeScriptInspection): string | undefined {
  return (
    (inspection.callExpressionNames ?? []).find(name => forbiddenMigratorCalls.has(name)) ??
    (inspection.constructedExpressionNames ?? []).find(name => name === 'AtomicFileWriter') ??
    inspection.moduleReferences.find(reference => atomicFileWriterModule.test(reference))
  );
}

function adapterPathInput(source: string, sourcePath = fixturePath): string | undefined {
  return inspectProject(new Map([[sourcePath, source]]), [sourcePath]).adapterPathInputs[0]?.name;
}

interface TransactionApplyCall {
  readonly sourcePath: string;
  readonly name: 'apply';
}

interface ProjectWriteAuthorityCall {
  readonly sourcePath: string;
  readonly name: 'apply' | 'migrate' | 'run';
}

function transactionApplyCalls(
  sources: ReadonlyMap<string, string>,
  entryPaths: readonly string[],
): readonly TransactionApplyCall[] {
  return inspectProject(sources, entryPaths).transactionApplyCalls;
}

function projectWriteAuthorityCalls(
  sources: ReadonlyMap<string, string>,
  entryPaths: readonly string[],
): readonly ProjectWriteAuthorityCall[] {
  return inspectProject(sources, entryPaths).projectWriteAuthorityCalls;
}

describe('migration transaction architecture boundary', { timeout: wholeProjectInspectionTimeout }, () => {
  test.each([
    [
      'direct write',
      "import { writeFile } from 'node:fs/promises'; void writeFile('output.html', contents);",
      'writeFile',
    ],
    ['namespace rename', "import * as fs from 'node:fs/promises'; void fs.rename(source, destination);", 'rename'],
    ['computed unlink', "import * as fs from 'node:fs/promises'; void fs['unlink'](temporary);", 'unlink'],
    [
      'aliased filesystem write',
      "import { writeFile as persist } from 'node:fs/promises'; void persist('output.html', contents);",
      'writeFile',
    ],
    [
      'local alias of a filesystem write',
      "import { writeFile } from 'node:fs/promises'; const persist = writeFile; void persist('output.html', contents);",
      'writeFile',
    ],
    [
      'destructured dynamic filesystem write',
      "async function save() { const { writeFile: persist } = await import('node:fs/promises'); await persist('output.html', contents); }",
      'writeFile',
    ],
    [
      'aliased member of a dynamic filesystem namespace',
      "async function save() { const fs = await import('node:fs/promises'); const persist = fs.writeFile; await persist('output.html', contents); }",
      'writeFile',
    ],
    [
      'destructured CommonJS filesystem write',
      "const { writeFile: persist } = require('node:fs/promises'); void persist('output.html', contents);",
      'writeFile',
    ],
    [
      'filesystem write routed through a local operations object',
      "import { writeFile } from 'node:fs/promises'; const operations = { persist: writeFile }; void operations.persist('output.html', contents);",
      'writeFile',
    ],
  ])('detects a %s call expression', (_label, source, expected) => {
    expect(mutationCall(source)).toBe(expected);
  });

  test.each([
    ['constructor parameter', 'class Adapter { constructor(readonly stylesheetPath: string) {} }', 'stylesheetPath'],
    ['method parameter', 'class Adapter { plan(reportPath: string) {} }', 'reportPath'],
    [
      'typed method option',
      'interface AdapterOptions { readonly reportPath: string; } class Adapter { plan(options: AdapterOptions) {} }',
      'reportPath',
    ],
  ])('detects an adapter %s input', (_label, source, expected) => {
    expect(adapterPathInput(source)).toBe(expected);
  });

  test('detects a destructured adapter path input', () => {
    const source = `
      interface AdapterOptions { stylesheetPath: string }
      class Adapter { plan({ stylesheetPath }: AdapterOptions): string { return stylesheetPath; } }
    `;

    expect(adapterPathInput(source)).toBe('stylesheetPath');
  });

  test('ignores path-shaped properties on types that are not adapter inputs', () => {
    const source = `
      interface InternalReport { reportPath: string }
      class Adapter { plan(source: string): string { return source; } }
    `;

    expect(adapterPathInput(source)).toBeUndefined();
  });

  test('detects AtomicFileWriter construction without scanning comments or strings', () => {
    const used = inspectTypeScript('const writer = new AtomicFileWriter();', fixturePath);
    const commentsOnly = inspectTypeScript(
      "// new AtomicFileWriter();\nconst message = 'AtomicFileWriter.writeFile';",
      fixturePath,
    );

    expect(forbiddenMigratorMutation(used)).toBe('AtomicFileWriter');
    expect(forbiddenMigratorMutation(commentsOnly)).toBeUndefined();
  });

  test(
    'makes the transaction the sole coordinated project-output mutation authority',
    () => {
      const findings = inspectTypeScriptProject(
        productionTypeScriptFiles(productionRoot),
      ).filesystemMutationCalls.filter(
        finding => !finding.sourcePath.startsWith(`${transactionRoot}/`) && finding.sourcePath !== atomicFileWriterPath,
      );

      expect(findings).toEqual([]);
    },
    wholeProjectInspectionTimeout,
  );

  test('makes concrete Apply the sole production caller of transaction application', () => {
    expect(transactionApplyCalls(new Map(), productionTypeScriptFiles(productionRoot))).toEqual([
      { sourcePath: applyProjectStagePath, name: 'apply' },
    ]);
  });

  test('keeps node filesystem mechanics out of the transaction coordinator', () => {
    const inspection = inspectTypeScript(readFileSync(migrationTransactionPath, 'utf8'), migrationTransactionPath);

    expect(inspection.moduleReferences.filter(reference => reference.startsWith('node:fs'))).toEqual([]);
    expect(inspectProject(new Map(), [migrationTransactionPath]).filesystemMutationCalls).toEqual([]);
  });

  test('limits focused transaction-unit runtime consumption to the transaction coordinator', () => {
    const consumers = productionTypeScriptFiles(productionRoot).flatMap(sourcePath => {
      const references = runtimeModuleReferences(readFileSync(sourcePath, 'utf8'), sourcePath);
      return references.some(reference =>
        /(?:staging|commit|rollback|cleanup)\.unit(?:\.[cm]?[jt]s)?$/u.test(reference),
      )
        ? [sourcePath]
        : [];
    });

    expect(productionTypeScriptFiles(transactionRoot)).toEqual(expect.arrayContaining(transactionUnitPaths));
    expect(consumers).toEqual([migrationTransactionPath]);
  });

  test('keeps FileMigrator and FolderMigrator free of direct writes and AtomicFileWriter usage', () => {
    for (const fileName of ['file.migrator.ts', 'folder.migrator.ts']) {
      const path = join(migratorRoot, fileName);
      expect(
        forbiddenMigratorMutation(inspectTypeScript(readFileSync(path, 'utf8'), path)),
        relative(process.cwd(), path),
      ).toBeUndefined();
    }
  });

  test('keeps MigrationRunner downstream of semantic planning, rendering, and render-session finalization', () => {
    const runnerInspection = createTypeScriptProjectInspectionSession([migrationRunnerPath]);
    const forbiddenRuntimeSymbols = runnerInspection
      .inspectRuntimeSymbolProvenance()
      .filter(symbol =>
        [
          join(productionRoot, 'semantic'),
          join(productionRoot, 'render'),
          join(productionRoot, 'planner', 'conversion-planner.ts'),
          join(productionRoot, 'adapter', 'conversion-adapter.session.ts'),
        ].some(namespace => symbol.declarationPath === namespace || symbol.declarationPath.startsWith(`${namespace}/`)),
      );
    const renderAuthorities = runnerInspection
      .inspectSemanticAuthorityCalls()
      .filter(call => call.name === 'RenderProjectStage.run' || call.name === 'RenderSession.finalize');

    expect(forbiddenRuntimeSymbols).toEqual([]);
    expect(renderAuthorities).toEqual([]);
    expect(runnerInspection.programConstructionCount).toBe(1);
  });

  test('keeps validation, topology, reference collection, and stylesheet planning out of MigrationRunner', () => {
    const forbiddenAuthorities = new Set([
      'ChangedTemplateValidation.parse',
      'CssReferenceCollector.collect',
      'CssReferenceParser.parse',
      'DestinationTemplateSource.read',
      'MigrationPathValidation.validate',
      'SourceEditor.apply',
      'StylesheetPlanner.plan',
      'TemplateProposalValidator.validate',
    ]);

    expect(
      inspectSemanticAuthorityCalls([migrationRunnerPath]).filter(call => forbiddenAuthorities.has(call.name)),
    ).toEqual([]);
  });

  test('keeps direct transaction application authority out of MigrationRunner', () => {
    const inspection = inspectProject(new Map(), [migrationRunnerPath]);

    expect(inspection.transactionApplyCalls).toEqual([]);
    expect(inspection.filesystemMutationCalls).toEqual([]);
  });

  test('reserves AtomicFileWriter for the independent JSON report', () => {
    const consumers = productionTypeScriptFiles(productionRoot).filter(path =>
      inspectTypeScript(readFileSync(path, 'utf8'), path).moduleReferences.some(reference =>
        atomicFileWriterModule.test(reference),
      ),
    );

    expect(consumers).toEqual([jsonReportWriterPath]);
  });

  test('detects a presenter invoking MigrationTransaction.apply', () => {
    const presenter = join(projectFixtureRoot, 'terminal.presenter.ts');
    const source = `
      import type { MigrationReport } from '../report/migration-report.js';
      import type { MigrationTransaction } from '../transaction/migration-transaction.js';
      import type { MigrationPlan } from '../migrator/migration-plan.js';
      declare const transaction: Pick<MigrationTransaction, 'apply'>;
      declare const plan: MigrationPlan;
      class TerminalPresenter {
        async present(report: MigrationReport) { await transaction.apply(plan); return report; }
      }
    `;

    expect(transactionApplyCalls(new Map([[presenter, source]]), [presenter])).toEqual([
      { sourcePath: presenter, name: 'apply' },
    ]);
  });

  test.each([
    [
      'bound alias',
      `
        const applyPlan = transaction.apply.bind(transaction);
        await applyPlan(plan);
      `,
    ],
    [
      'destructured method via Function.call',
      `
        const { apply } = transaction;
        await apply.call(transaction, plan);
      `,
    ],
    [
      'local object property',
      `
        const operations = { commit: transaction.apply };
        await operations.commit(plan);
      `,
    ],
  ])('detects MigrationTransaction.apply routed through a %s', (_label, invocation) => {
    const presenter = join(projectFixtureRoot, 'terminal.presenter.ts');
    const source = `
      import type { MigrationTransaction } from '../transaction/migration-transaction.js';
      import type { MigrationPlan } from '../migrator/migration-plan.js';
      declare const transaction: Pick<MigrationTransaction, 'apply'>;
      declare const plan: MigrationPlan;
      async function present() { ${invocation} }
    `;

    expect(transactionApplyCalls(new Map([[presenter, source]]), [presenter])).toContainEqual({
      sourcePath: presenter,
      name: 'apply',
    });
  });

  test('detects MigrationTransaction acquired through CommonJS', () => {
    const presenter = join(projectFixtureRoot, 'commonjs.presenter.ts');
    const source = `
      import type { MigrationPlan } from '../migrator/migration-plan.js';
      const { MigrationTransaction: Coordinator } = require('../transaction/migration-transaction.js');
      declare const plan: MigrationPlan;
      async function present() { const transaction = new Coordinator(); await transaction.apply(plan); }
    `;

    expect(transactionApplyCalls(new Map([[presenter, source]]), [presenter])).toEqual([
      { sourcePath: presenter, name: 'apply' },
    ]);
  });

  test('detects a CommonJS transaction constructor routed through a local re-export', () => {
    const bridge = join(projectFixtureRoot, 'transaction-bridge.ts');
    const presenter = join(projectFixtureRoot, 'commonjs-reexport.presenter.ts');
    const inspection = inspectProject(
      new Map([
        [bridge, "export { MigrationTransaction as Coordinator } from '../transaction/migration-transaction.js';"],
        [
          presenter,
          `
            import type { MigrationPlan } from '../migrator/migration-plan.js';
            const { Coordinator } = require('./transaction-bridge.js');
            declare const plan: MigrationPlan;
            async function present() { const transaction = new Coordinator(); await transaction.apply(plan); }
          `,
        ],
      ]),
      [bridge, presenter],
    );

    expect(inspection.transactionApplyCalls).toEqual([{ sourcePath: presenter, name: 'apply' }]);
  });

  test('detects an imported helper that exports a bound transaction apply callable', () => {
    const helper = join(projectFixtureRoot, 'transaction-apply.helper.ts');
    const presenter = join(projectFixtureRoot, 'imported-apply.presenter.ts');
    const inspection = inspectProject(
      new Map([
        [
          helper,
          `
            import type { MigrationTransaction } from '../transaction/migration-transaction.js';
            declare const transaction: Pick<MigrationTransaction, 'apply'>;
            export const applyPlan = transaction.apply.bind(transaction);
          `,
        ],
        [
          presenter,
          `
            import { applyPlan as execute } from './transaction-apply.helper.js';
            import type { MigrationPlan } from '../migrator/migration-plan.js';
            declare const plan: MigrationPlan;
            void execute(plan);
          `,
        ],
      ]),
      [presenter],
    );

    expect(inspection.transactionApplyCalls).toEqual([{ sourcePath: presenter, name: 'apply' }]);
  });

  test('detects an imported helper whose function body applies the transaction', () => {
    const helper = join(projectFixtureRoot, 'transaction-apply.helper.ts');
    const presenter = join(projectFixtureRoot, 'imported-apply.presenter.ts');
    const inspection = inspectProject(
      new Map([
        [
          helper,
          `
            import type { MigrationTransaction } from '../transaction/migration-transaction.js';
            import type { MigrationPlan } from '../migrator/migration-plan.js';
            declare const transaction: Pick<MigrationTransaction, 'apply'>;
            export async function applyPlan(plan: MigrationPlan) { await transaction.apply(plan); }
          `,
        ],
        [
          presenter,
          `
            import { applyPlan as execute } from './transaction-apply.helper.js';
            import type { MigrationPlan } from '../migrator/migration-plan.js';
            declare const plan: MigrationPlan;
            void execute(plan);
          `,
        ],
      ]),
      [presenter],
    );

    expect(inspection.transactionApplyCalls).toEqual([{ sourcePath: presenter, name: 'apply' }]);
  });

  test.each([
    [
      'destructured require',
      "const { applyPlan } = require('./commonjs-transaction.helper.js'); void applyPlan(plan);",
    ],
    [
      'required namespace member',
      "const helpers = require('./commonjs-transaction.helper.js'); void helpers.applyPlan(plan);",
    ],
  ])('detects a CommonJS helper whose exported callable applies the transaction through %s', (_label, source) => {
    const helper = join(projectFixtureRoot, 'commonjs-transaction.helper.ts');
    const presenter = join(projectFixtureRoot, 'commonjs-helper.presenter.ts');
    const inspection = inspectProject(
      new Map([
        [
          helper,
          `
            import type { MigrationTransaction } from '../transaction/migration-transaction.js';
            import type { MigrationPlan } from '../migrator/migration-plan.js';
            declare const transaction: Pick<MigrationTransaction, 'apply'>;
            export async function applyPlan(plan: MigrationPlan) { await transaction.apply(plan); }
          `,
        ],
        [
          presenter,
          `
            import type { MigrationPlan } from '../migrator/migration-plan.js';
            declare const plan: MigrationPlan;
            ${source}
          `,
        ],
      ]),
      [presenter],
    );

    expect(inspection.transactionApplyCalls).toEqual([{ sourcePath: presenter, name: 'apply' }]);
  });

  test('follows a CommonJS helper callable through a renamed re-export, barrel, and export cycle', () => {
    const helper = join(projectFixtureRoot, 'commonjs-transaction.helper.ts');
    const reexport = join(projectFixtureRoot, 'commonjs-transaction.reexport.ts');
    const barrel = join(projectFixtureRoot, 'commonjs-transaction.index.ts');
    const cycle = join(projectFixtureRoot, 'commonjs-transaction.cycle.ts');
    const presenter = join(projectFixtureRoot, 'commonjs-cycle.presenter.ts');
    const inspection = inspectProject(
      new Map([
        [
          helper,
          `
            import type { MigrationTransaction } from '../transaction/migration-transaction.js';
            import type { MigrationPlan } from '../migrator/migration-plan.js';
            declare const transaction: Pick<MigrationTransaction, 'apply'>;
            export function applyPlan(plan: MigrationPlan) { return transaction.apply(plan); }
          `,
        ],
        [reexport, "export { applyPlan as commitPlan } from './commonjs-transaction.helper.js';"],
        [
          barrel,
          "export * from './commonjs-transaction.reexport.js'; export * from './commonjs-transaction.cycle.js';",
        ],
        [cycle, "export * from './commonjs-transaction.index.js';"],
        [
          presenter,
          `
            import type { MigrationPlan } from '../migrator/migration-plan.js';
            const operations = require('./commonjs-transaction.index.js');
            declare const plan: MigrationPlan;
            void operations.commitPlan(plan);
          `,
        ],
      ]),
      [presenter],
    );

    expect(inspection.transactionApplyCalls).toEqual([{ sourcePath: presenter, name: 'apply' }]);
  });

  test('does not confuse an imported helper whose function body calls an unrelated apply method', () => {
    const helper = join(projectFixtureRoot, 'formatter.helper.ts');
    const presenter = join(projectFixtureRoot, 'formatter.presenter.ts');
    const inspection = inspectProject(
      new Map([
        [
          helper,
          `
            interface Formatter { apply(value: string): string }
            declare const formatter: Formatter;
            export function applyFormat(value: string) { return formatter.apply(value); }
          `,
        ],
        [presenter, "import { applyFormat as execute } from './formatter.helper.js'; void execute('text');"],
      ]),
      [presenter],
    );

    expect(inspection.transactionApplyCalls).toEqual([]);
  });

  test.each([
    {
      label: 'DiscoverProjectStage.run',
      authority: 'DiscoverProjectStage.run',
      declaration:
        "import type { DiscoverProjectStage as Stage } from '../pipeline/discover/discover-project.stage.js';",
      receiver: 'discover',
      input: 'invocation',
      inputDeclaration: "declare const invocation: Parameters<Stage['run']>[0];",
    },
    {
      label: 'AnalyzeProjectStage.run',
      authority: 'AnalyzeProjectStage.run',
      declaration: "import type { AnalyzeProjectStage as Stage } from '../pipeline/analyze/analyze-project.stage.js';",
      receiver: 'analyze',
      input: 'manifest',
      inputDeclaration: "declare const manifest: Parameters<Stage['run']>[0];",
    },
  ])('detects $label through direct, alias, call, apply, computed, and Reflect routes', fixture => {
    const caller = join(projectFixtureRoot, `${fixture.receiver}-routes.ts`);
    const source = `
      ${fixture.declaration}
      declare const ${fixture.receiver}: Stage;
      ${fixture.inputDeclaration}
      const execute = ${fixture.receiver}.run.bind(${fixture.receiver});
      const method = 'run' as const;
      const unknownMethod: string = method;
      void ${fixture.receiver}.run(${fixture.input});
      void execute(${fixture.input});
      void ${fixture.receiver}.run.call(${fixture.receiver}, ${fixture.input});
      void ${fixture.receiver}.run.apply(${fixture.receiver}, [${fixture.input}]);
      void ${fixture.receiver}[unknownMethod](${fixture.input});
      void Reflect.apply(${fixture.receiver}[method], ${fixture.receiver}, [${fixture.input}]);
    `;

    expect(
      inspectSemanticAuthorityCalls([caller], new Map([[caller, source]]))
        .map(call => call.name)
        .filter(authority => authority === fixture.authority),
    ).toEqual(Array.from({ length: 6 }, () => fixture.authority));
  });

  test.each([
    [
      'dynamic import',
      "const { DiscoverProjectStage: Stage } = await import('../pipeline/discover/discover-project.stage.js');",
    ],
    [
      'CommonJS require',
      "const { DiscoverProjectStage: Stage } = require('../pipeline/discover/discover-project.stage.js');",
    ],
  ])('detects DiscoverProjectStage.run acquired through %s', (_label, setup) => {
    const caller = join(projectFixtureRoot, 'runtime-discover.ts');
    const source = `
      async function execute() {
        ${setup}
        const discover = new Stage();
        await discover.run(undefined as never);
      }
    `;

    expect(inspectSemanticAuthorityCalls([caller], new Map([[caller, source]]))).toEqual([
      { sourcePath: caller, name: 'DiscoverProjectStage.run' },
    ]);
  });

  test.each([
    'interface Stage { run(value: unknown): void } declare const discover: Stage; discover.run(undefined);',
    'class DiscoverProjectStage { run(value: unknown): void {} } new DiscoverProjectStage().run(undefined);',
    'interface Analyzer { analyze(value: unknown): void } declare const analyzer: Analyzer; analyzer.analyze(undefined);',
  ])('does not confuse an unrelated same-named callable with pipeline authority', source => {
    const caller = join(projectFixtureRoot, 'unrelated-stage.ts');

    expect(inspectSemanticAuthorityCalls([caller], new Map([[caller, source]]))).toEqual([]);
  });

  test.each([
    {
      authority: 'DiscoveryFileSystem.entries',
      importType:
        "import type { DiscoveryFileSystem as Port } from '../pipeline/discover/discovery-file-system.port.js';",
      member: 'entries',
      arguments: "'/project'",
    },
    {
      authority: 'IgnoreMatcherFactory.load',
      importType: "import type { IgnoreMatcherFactory as Port } from '../pipeline/discover/ignore-matcher.port.js';",
      member: 'load',
      arguments: "'/project'",
    },
    {
      authority: 'TemplateSourceReader.read',
      importType:
        "import type { TemplateSourceReader as Port } from '../pipeline/analyze/template-source-reader.port.js';",
      member: 'read',
      arguments: "'/project/card.html'",
    },
    {
      authority: 'AngularTemplateParser.parse',
      importType: "import type { TemplateParser as Port } from '../pipeline/analyze/template-parser.port.js';",
      member: 'parse',
      arguments: "'<div></div>', '/project/card.html'",
    },
    {
      authority: 'TemplateInputAnalyzer.analyze',
      importType:
        "import type { TemplateInputAnalyzer as Port } from '../pipeline/analyze/template-input-analyzer.port.js';",
      member: 'analyze',
      arguments: "'/project/card.html', []",
    },
  ])('follows $authority through aliases and invocation indirection', fixture => {
    const caller = join(projectFixtureRoot, `semantic-${fixture.member}.ts`);
    const source = `
      ${fixture.importType}
      declare const port: Port;
      const direct = port.${fixture.member};
      const operations = { execute: direct };
      void operations.execute.call(port, ${fixture.arguments});
      void Reflect.apply(port.${fixture.member}, port, [${fixture.arguments}]);
    `;

    expect(inspectSemanticAuthorityCalls([caller], new Map([[caller, source]])).map(call => call.name)).toEqual([
      fixture.authority,
      fixture.authority,
    ]);
  });

  test('detects a caller invoking canonical MigrationRunner#run in write mode', () => {
    const presenter = join(projectFixtureRoot, 'migration-runner.presenter.ts');
    const source = `
      import { MigrationRunner as Runner } from '../pipeline/migration-runner.js';
      declare const runner: Runner;
      void runner.run({ inputPath: 'input.html', outputPath: 'output.html', options: { mode: 'write' } });
    `;

    expect(projectWriteAuthorityCalls(new Map([[presenter, source]]), [presenter])).toEqual([
      { sourcePath: presenter, name: 'run' },
    ]);
  });

  test('treats a type-only canonical MigrationRunner as project-write authority', () => {
    const presenter = join(projectFixtureRoot, 'migration-runner-type.presenter.ts');
    const source = `
      import type { MigrationRunner as Runner } from '../pipeline/migration-runner.js';
      declare const runner: Runner;
      void runner.run({ inputPath: 'input.html', outputPath: 'output.html', options: { mode: 'write' } });
    `;

    expect(projectWriteAuthorityCalls(new Map([[presenter, source]]), [presenter])).toEqual([
      { sourcePath: presenter, name: 'run' },
    ]);
  });

  test('follows MigrationRunner through a re-exported type alias', () => {
    const barrel = join(projectFixtureRoot, 'migration-runner.index.ts');
    const presenter = join(projectFixtureRoot, 'aliased-migration-runner.presenter.ts');
    const sources = new Map([
      [barrel, "export type { MigrationRunner as RunnerPort } from '../pipeline/migration-runner.js';"],
      [
        presenter,
        `
          import type { RunnerPort as ImportedPort } from './migration-runner.index.js';
          declare const runner: ImportedPort;
          void runner.run({ inputPath: 'input.html', outputPath: 'output.html', options: { mode: 'write' } });
        `,
      ],
    ]);

    expect(projectWriteAuthorityCalls(sources, [presenter])).toEqual([{ sourcePath: presenter, name: 'run' }]);
  });

  test.each([
    ['a const literal method alias', "const method = 'run' as const;"],
    ['an unknown computed method', 'declare const method: string;'],
  ])('fails closed for canonical MigrationRunner invocation through %s', (_label, methodDeclaration) => {
    const presenter = join(projectFixtureRoot, 'computed-migration-runner-port.presenter.ts');
    const source = `
      import type { MigrationRunner as RunnerPort } from '../pipeline/migration-runner.js';
      declare const runner: RunnerPort;
      ${methodDeclaration}
      void runner[method]({ inputPath: 'input.html', outputPath: 'output.html', options: { mode: 'write' } });
    `;

    expect(projectWriteAuthorityCalls(new Map([[presenter, source]]), [presenter])).toEqual([
      { sourcePath: presenter, name: 'run' },
    ]);
  });

  test.each([
    [
      'direct bound callable',
      "const execute = runner.run.bind(runner, { inputPath: 'input.html', outputPath: 'output.html', options: { mode: 'write' } }); void execute();",
    ],
    [
      'aliased bound callable',
      "const execute = runner.run.bind(runner); const run = execute; void run({ inputPath: 'input.html', outputPath: 'output.html', options: { mode: 'write' } });",
    ],
  ])('detects canonical MigrationRunner write authority through a %s', (_label, invocation) => {
    const presenter = join(projectFixtureRoot, 'bound-migration-runner.presenter.ts');
    const source = `
      import { MigrationRunner as Runner } from '../pipeline/migration-runner.js';
      declare const runner: Runner;
      ${invocation}
    `;

    expect(projectWriteAuthorityCalls(new Map([[presenter, source]]), [presenter])).toEqual([
      { sourcePath: presenter, name: 'run' },
    ]);
  });

  test('follows MigrationRunner write authority through a re-export alias', () => {
    const barrel = join(projectFixtureRoot, 'migration-runner.index.ts');
    const presenter = join(projectFixtureRoot, 'barrel-migration-runner.presenter.ts');
    const sources = new Map([
      [barrel, "export { MigrationRunner as Runner } from '../pipeline/migration-runner.js';"],
      [
        presenter,
        `
          import { Runner as ImportedRunner } from './migration-runner.index.js';
          declare const runner: ImportedRunner;
          void runner.run({ inputPath: 'input.html', outputPath: 'output.html', options: { mode: 'write' } });
        `,
      ],
    ]);

    expect(projectWriteAuthorityCalls(sources, [presenter])).toEqual([{ sourcePath: presenter, name: 'run' }]);
  });

  test.each([
    [
      'dynamic import',
      `
        const { MigrationRunner: Runner } = await import('../pipeline/migration-runner.js');
        const runner = new Runner(undefined as never, undefined as never, undefined as never);
      `,
    ],
    [
      'CommonJS require',
      `
        const { MigrationRunner: Runner } = require('../pipeline/migration-runner.js');
        const runner = new Runner(undefined, undefined, undefined);
      `,
    ],
  ])('detects canonical MigrationRunner write authority acquired through %s', (_label, setup) => {
    const presenter = join(projectFixtureRoot, 'runtime-migration-runner.presenter.ts');
    const source = `
      async function present() {
        ${setup}
        await runner.run({ inputPath: 'input.html', outputPath: 'output.html', options: { mode: 'write' } });
      }
    `;

    expect(projectWriteAuthorityCalls(new Map([[presenter, source]]), [presenter])).toEqual([
      { sourcePath: presenter, name: 'run' },
    ]);
  });

  test('fails closed for a mutable MigrationRunner invocation', () => {
    const presenter = join(projectFixtureRoot, 'mutable-migration-runner.presenter.ts');
    const source = `
      import { MigrationRunner as Runner } from '../pipeline/migration-runner.js';
      declare const runner: Runner;
      const invocation = { inputPath: 'input.html', outputPath: 'output.html', options: { mode: 'plan' } };
      void runner.run(invocation);
    `;

    expect(projectWriteAuthorityCalls(new Map([[presenter, source]]), [presenter])).toEqual([
      { sourcePath: presenter, name: 'run' },
    ]);
  });

  test('allows an immutable explicit plan through MigrationRunner without granting write authority', () => {
    const presenter = join(projectFixtureRoot, 'plan-migration-runner.presenter.ts');
    const source = `
      import { MigrationRunner as Runner } from '../pipeline/migration-runner.js';
      declare const runner: Runner;
      const invocation = {
        inputPath: 'input.html',
        outputPath: 'output.html',
        options: { mode: 'plan' },
      } as const;
      void runner.run(invocation);
    `;

    expect(projectWriteAuthorityCalls(new Map([[presenter, source]]), [presenter])).toEqual([]);
  });

  test.each([
    [
      'an unrelated run method',
      `
        interface Previewer { run(invocation: { options: { mode: 'write' } }): void }
        declare const previewer: Previewer;
        previewer.run({ options: { mode: 'write' } });
      `,
    ],
    [
      'a same-named local class',
      `
        class MigrationRunner { run(invocation: { options: { mode: 'write' } }): void {} }
        new MigrationRunner().run({ options: { mode: 'write' } });
      `,
    ],
    [
      'a same-named local runner port',
      `
        interface MigrationRunner { run(invocation: { options: { mode: 'write' } }): void }
        declare const runner: MigrationRunner;
        runner.run({ options: { mode: 'write' } });
      `,
    ],
    [
      'an unrelated receiver with an unknown computed method',
      `
        interface Previewer { run(invocation: { options: { mode: 'write' } }): void }
        declare const previewer: Previewer;
        declare const method: string;
        previewer[method]({ options: { mode: 'write' } });
      `,
    ],
  ])('does not confuse %s with MigrationRunner write authority', (_label, source) => {
    const presenter = join(projectFixtureRoot, 'unrelated-migration-runner.presenter.ts');

    expect(projectWriteAuthorityCalls(new Map([[presenter, source]]), [presenter])).toEqual([]);
  });

  test('terminates safely on cyclic helper calls with no project-write authority', () => {
    const helper = join(projectFixtureRoot, 'cyclic-migrator.helper.ts');
    const presenter = join(projectFixtureRoot, 'cyclic-migrator.presenter.ts');
    const sources = new Map([
      [helper, 'export function first() { return second(); } export function second() { return first(); }'],
      [presenter, "import { first as execute } from './cyclic-migrator.helper.js'; void execute();"],
    ]);

    expect(projectWriteAuthorityCalls(sources, [presenter])).toEqual([]);
  });

  test('follows a bound transaction apply callable through re-export and barrel aliases', () => {
    const helper = join(projectFixtureRoot, 'transaction-apply.helper.ts');
    const reexport = join(projectFixtureRoot, 'transaction-apply.reexport.ts');
    const barrel = join(projectFixtureRoot, 'transaction-apply.index.ts');
    const presenter = join(projectFixtureRoot, 'barrel-apply.presenter.ts');
    const inspection = inspectProject(
      new Map([
        [
          helper,
          `
            import type { MigrationTransaction } from '../transaction/migration-transaction.js';
            declare const transaction: Pick<MigrationTransaction, 'apply'>;
            export const applyPlan = transaction.apply.bind(transaction);
          `,
        ],
        [reexport, "export { applyPlan as commitPlan } from './transaction-apply.helper.js';"],
        [barrel, "export * from './transaction-apply.reexport.js';"],
        [
          presenter,
          `
            import { commitPlan as execute } from './transaction-apply.index.js';
            import type { MigrationPlan } from '../migrator/migration-plan.js';
            declare const plan: MigrationPlan;
            void execute(plan);
          `,
        ],
      ]),
      [presenter],
    );

    expect(inspection.transactionApplyCalls).toEqual([{ sourcePath: presenter, name: 'apply' }]);
  });

  test('detects an invoked default export of a bound transaction apply callable', () => {
    const helper = join(projectFixtureRoot, 'default-transaction-apply.helper.ts');
    const presenter = join(projectFixtureRoot, 'default-apply.presenter.ts');
    const inspection = inspectProject(
      new Map([
        [
          helper,
          `
            import type { MigrationTransaction } from '../transaction/migration-transaction.js';
            declare const transaction: Pick<MigrationTransaction, 'apply'>;
            export default transaction.apply.bind(transaction);
          `,
        ],
        [
          presenter,
          `
            import execute from './default-transaction-apply.helper.js';
            import type { MigrationPlan } from '../migrator/migration-plan.js';
            declare const plan: MigrationPlan;
            void execute(plan);
          `,
        ],
      ]),
      [presenter],
    );

    expect(inspection.transactionApplyCalls).toEqual([{ sourcePath: presenter, name: 'apply' }]);
  });

  test('follows a default transaction apply callable through renamed re-export and barrel aliases', () => {
    const helper = join(projectFixtureRoot, 'default-transaction-apply.helper.ts');
    const reexport = join(projectFixtureRoot, 'default-transaction-apply.reexport.ts');
    const barrel = join(projectFixtureRoot, 'default-transaction-apply.index.ts');
    const presenter = join(projectFixtureRoot, 'default-barrel-apply.presenter.ts');
    const inspection = inspectProject(
      new Map([
        [
          helper,
          `
            import type { MigrationTransaction } from '../transaction/migration-transaction.js';
            declare const transaction: Pick<MigrationTransaction, 'apply'>;
            export default transaction.apply.bind(transaction);
          `,
        ],
        [reexport, "export { default as commitPlan } from './default-transaction-apply.helper.js';"],
        [barrel, "export { commitPlan as default } from './default-transaction-apply.reexport.js';"],
        [
          presenter,
          `
            import execute from './default-transaction-apply.index.js';
            import type { MigrationPlan } from '../migrator/migration-plan.js';
            declare const plan: MigrationPlan;
            void execute(plan);
          `,
        ],
      ]),
      [presenter],
    );

    expect(inspection.transactionApplyCalls).toEqual([{ sourcePath: presenter, name: 'apply' }]);
  });

  test('does not report a default transaction apply helper that a presenter only imports', () => {
    const helper = join(projectFixtureRoot, 'default-transaction-apply.helper.ts');
    const presenter = join(projectFixtureRoot, 'deferred-default-apply.presenter.ts');
    const inspection = inspectProject(
      new Map([
        [
          helper,
          `
            import type { MigrationTransaction } from '../transaction/migration-transaction.js';
            declare const transaction: Pick<MigrationTransaction, 'apply'>;
            export default transaction.apply.bind(transaction);
          `,
        ],
        [presenter, "import execute from './default-transaction-apply.helper.js'; export { execute as deferred };"],
      ]),
      [presenter],
    );

    expect(inspection.transactionApplyCalls).toEqual([]);
  });

  test('does not confuse an invoked default bound formatter callable with transaction application', () => {
    const helper = join(projectFixtureRoot, 'default-formatter-apply.helper.ts');
    const presenter = join(projectFixtureRoot, 'default-formatter.presenter.ts');
    const inspection = inspectProject(
      new Map([
        [
          helper,
          `
            interface Formatter { apply(value: string): string }
            declare const formatter: Formatter;
            export default formatter.apply.bind(formatter);
          `,
        ],
        [presenter, "import execute from './default-formatter-apply.helper.js'; void execute('text');"],
      ]),
      [presenter],
    );

    expect(inspection.transactionApplyCalls).toEqual([]);
  });

  test('terminates safely on a cyclic alias behind a default export', () => {
    const helper = join(projectFixtureRoot, 'cyclic-default-apply.helper.ts');
    const presenter = join(projectFixtureRoot, 'cyclic-default-apply.presenter.ts');
    const inspection = inspectProject(
      new Map([
        [helper, 'const first = second; const second = first; export default first;'],
        [presenter, "import execute from './cyclic-default-apply.helper.js'; void execute('text');"],
      ]),
      [presenter],
    );

    expect(inspection.transactionApplyCalls).toEqual([]);
  });

  test('does not report a bound transaction apply helper that a presenter only imports', () => {
    const helper = join(projectFixtureRoot, 'transaction-apply.helper.ts');
    const presenter = join(projectFixtureRoot, 'deferred-apply.presenter.ts');
    const inspection = inspectProject(
      new Map([
        [
          helper,
          `
            import type { MigrationTransaction } from '../transaction/migration-transaction.js';
            declare const transaction: Pick<MigrationTransaction, 'apply'>;
            export const applyPlan = transaction.apply.bind(transaction);
          `,
        ],
        [presenter, "import { applyPlan } from './transaction-apply.helper.js'; export { applyPlan as deferred };"],
      ]),
      [presenter],
    );

    expect(inspection.transactionApplyCalls).toEqual([]);
  });

  test('does not confuse an imported bound formatter callable with transaction application', () => {
    const helper = join(projectFixtureRoot, 'formatter-apply.helper.ts');
    const presenter = join(projectFixtureRoot, 'imported-formatter.presenter.ts');
    const inspection = inspectProject(
      new Map([
        [
          helper,
          `
            interface Formatter { apply(value: string): string }
            declare const formatter: Formatter;
            export const applyFormat = formatter.apply.bind(formatter);
          `,
        ],
        [presenter, "import { applyFormat as execute } from './formatter-apply.helper.js'; void execute('text');"],
      ]),
      [presenter],
    );

    expect(inspection.transactionApplyCalls).toEqual([]);
  });

  test('terminates safely on cyclic callable aliases', () => {
    const helper = join(projectFixtureRoot, 'cyclic-apply.helper.ts');
    const presenter = join(projectFixtureRoot, 'cyclic-apply.presenter.ts');
    const inspection = inspectProject(
      new Map([
        [helper, 'export const first = second; export const second = first;'],
        [presenter, "import { first as execute } from './cyclic-apply.helper.js'; void execute('text');"],
      ]),
      [presenter],
    );

    expect(inspection.transactionApplyCalls).toEqual([]);
  });

  test.each([
    [
      'destructured require',
      "const { applyFormat: execute } = require('./commonjs-formatter.helper.js'); void execute('text');",
    ],
    [
      'required namespace member',
      "const helpers = require('./commonjs-formatter.helper.js'); void helpers.applyFormat('text');",
    ],
  ])(
    'does not confuse an unrelated CommonJS helper acquired through %s with transaction application',
    (_label, source) => {
      const helper = join(projectFixtureRoot, 'commonjs-formatter.helper.ts');
      const presenter = join(projectFixtureRoot, 'commonjs-formatter.presenter.ts');
      const inspection = inspectProject(
        new Map([
          [
            helper,
            `
            interface Formatter { apply(value: string): string }
            declare const formatter: Formatter;
            export function applyFormat(value: string) { return formatter.apply(value); }
          `,
          ],
          [presenter, source],
        ]),
        [presenter],
      );

      expect(inspection.transactionApplyCalls).toEqual([]);
    },
  );

  test('terminates safely on a CommonJS re-export cycle with no transaction authority', () => {
    const first = join(projectFixtureRoot, 'commonjs-cycle-first.ts');
    const second = join(projectFixtureRoot, 'commonjs-cycle-second.ts');
    const presenter = join(projectFixtureRoot, 'commonjs-unrelated-cycle.presenter.ts');
    const inspection = inspectProject(
      new Map([
        [first, "export * from './commonjs-cycle-second.js'; export const format = (value: string) => value;"],
        [second, "export * from './commonjs-cycle-first.js';"],
        [presenter, "const helpers = require('./commonjs-cycle-second.js'); void helpers.format('text');"],
      ]),
      [presenter],
    );

    expect(inspection.transactionApplyCalls).toEqual([]);
  });

  test('does not confuse presenter text output or an unrelated apply method with application authority', () => {
    const presenter = join(projectFixtureRoot, 'terminal.presenter.ts');
    const source = `
      interface TextOutput { write(text: string): void }
      interface Formatter { apply(value: string): string }
      declare const formatter: Formatter;
      class TerminalPresenter {
        present(text: string, output: TextOutput) { output.write(formatter.apply(text)); }
      }
    `;
    const inspection = inspectProject(new Map([[presenter, source]]), [presenter]);

    expect(inspection.filesystemMutationCalls).toEqual([]);
    expect(transactionApplyCalls(new Map([[presenter, source]]), [presenter])).toEqual([]);
  });

  test.each([
    ['bound method', 'const routed = formatter.apply.bind(formatter); routed(text);'],
    ['destructured method via Function.call', 'const { apply } = formatter; apply.call(formatter, text);'],
    ['local object property', 'const operations = { format: formatter.apply }; operations.format(text);'],
  ])('ignores an unrelated apply %s', (_label, invocation) => {
    const presenter = join(projectFixtureRoot, 'unrelated.presenter.ts');
    const source = `
      interface Formatter { apply(value: string): string }
      declare const formatter: Formatter;
      declare const text: string;
      function present() { ${invocation} }
    `;

    expect(transactionApplyCalls(new Map([[presenter, source]]), [presenter])).toEqual([]);
  });

  test('detects a re-exported MigrationTransaction.apply target invoked through Reflect.apply', () => {
    const helper = join(projectFixtureRoot, 'reflected-transaction.helper.ts');
    const barrel = join(projectFixtureRoot, 'reflected-transaction.index.ts');
    const presenter = join(projectFixtureRoot, 'reflected-transaction.presenter.ts');
    const sources = new Map([
      [
        helper,
        `
          import type { MigrationTransaction } from '../transaction/migration-transaction.js';
          declare const transaction: Pick<MigrationTransaction, 'apply'>;
          export const applyPlan = transaction.apply;
        `,
      ],
      [barrel, "export { applyPlan as execute } from './reflected-transaction.helper.js';"],
      [
        presenter,
        `
          import { execute as target } from './reflected-transaction.index.js';
          import type { MigrationPlan } from '../migrator/migration-plan.js';
          declare const plan: MigrationPlan;
          void Reflect.apply(target, undefined, [plan]);
        `,
      ],
    ]);

    expect(projectWriteAuthorityCalls(sources, [presenter])).toEqual([{ sourcePath: presenter, name: 'apply' }]);
  });

  test('detects a computed MigrationRunner.run target through a re-exported Reflect.apply alias', () => {
    const helper = join(projectFixtureRoot, 'reflect-apply.helper.ts');
    const barrel = join(projectFixtureRoot, 'reflect-apply.index.ts');
    const presenter = join(projectFixtureRoot, 'reflected-migration-runner.presenter.ts');
    const sources = new Map([
      [helper, 'export const invokeReflect = Reflect.apply;'],
      [barrel, "export { invokeReflect as invoke } from './reflect-apply.helper.js';"],
      [
        presenter,
        `
          import { invoke as invokeReflect } from './reflect-apply.index.js';
          import { MigrationRunner as Runner } from '../pipeline/migration-runner.js';
          declare const runner: Runner;
          const method = 'run' as const;
          void invokeReflect(runner[method], runner, [{
            inputPath: 'input.html',
            outputPath: 'output.html',
            options: { mode: 'write' },
          }]);
        `,
      ],
    ]);

    expect(projectWriteAuthorityCalls(sources, [presenter])).toEqual([{ sourcePath: presenter, name: 'run' }]);
  });

  test.each([
    [
      'MigrationRunner class',
      `
        import { MigrationRunner as Runner } from '../pipeline/migration-runner.js';
        declare const runner: Runner;
      `,
    ],
    [
      're-exported MigrationRunner type',
      `
        import type { RunnerPort as Runner } from './reflected-runner.index.js';
        declare const runner: Runner;
      `,
    ],
  ])('detects a computed %s target invoked through computed Reflect.apply', (_label, setup) => {
    const barrel = join(projectFixtureRoot, 'reflected-runner.index.ts');
    const presenter = join(projectFixtureRoot, 'reflected-runner.presenter.ts');
    const sources = new Map([
      [barrel, "export type { MigrationRunner as RunnerPort } from '../pipeline/migration-runner.js';"],
      [
        presenter,
        `
          ${setup}
          const reflectMethod = 'apply' as const;
          declare const runMethod: string;
          void Reflect[reflectMethod](runner[runMethod], runner, [{
            inputPath: 'input.html',
            outputPath: 'output.html',
            options: { mode: 'write' },
          }]);
        `,
      ],
    ]);

    expect(projectWriteAuthorityCalls(sources, [presenter])).toEqual([{ sourcePath: presenter, name: 'run' }]);
  });

  const reflectiveAuthorityFixtures = [
    {
      label: 'MigrationTransaction.apply',
      name: 'apply' as const,
      reflectedCall: `
        void Reflect.apply(transaction.apply.call, transaction.apply, [transaction, plan]);
      `,
      setup: `
        import type { MigrationTransaction } from '../transaction/migration-transaction.js';
        import type { MigrationPlan } from '../migrator/migration-plan.js';
        declare const transaction: Pick<MigrationTransaction, 'apply'>;
        declare const plan: MigrationPlan;
        const target = transaction.apply;
        const receiver = transaction;
        const values = [plan];
      `,
    },
    {
      label: 'MigrationRunner.run',
      name: 'run' as const,
      reflectedCall: `
        void Reflect.apply(runner.run.call, runner.run, [runner, {
          inputPath: 'input.html',
          outputPath: 'output.html',
          options: { mode: 'write' },
        }]);
      `,
      setup: `
        import type { MigrationRunner } from '../pipeline/migration-runner.js';
        declare const runner: MigrationRunner;
        const target = runner.run;
        const receiver = runner;
        const values = [{
          inputPath: 'input.html',
          outputPath: 'output.html',
          options: { mode: 'write' as const },
        }];
      `,
    },
  ];

  test.each(reflectiveAuthorityFixtures)(
    'detects $label through single and nested Function.call routes to Reflect.apply',
    ({ setup, name }) => {
      const presenter = join(projectFixtureRoot, `nested-reflect-${name}.presenter.ts`);
      const source = `
        ${setup}
        void Reflect.apply.call(undefined, target, receiver, values);
        void Reflect.apply.call.call(Reflect.apply, undefined, target, receiver, values);
      `;

      expect(projectWriteAuthorityCalls(new Map([[presenter, source]]), [presenter])).toEqual([
        { sourcePath: presenter, name },
        { sourcePath: presenter, name },
      ]);
    },
  );

  test.each(reflectiveAuthorityFixtures)(
    'detects $label when Reflect.apply invokes the authority nested Function.call target',
    ({ setup, reflectedCall, name }) => {
      const presenter = join(projectFixtureRoot, `reflected-call-target-${name}.presenter.ts`);
      const source = `${setup}${reflectedCall}`;

      expect(projectWriteAuthorityCalls(new Map([[presenter, source]]), [presenter])).toEqual([
        { sourcePath: presenter, name },
      ]);
    },
  );

  test.each(reflectiveAuthorityFixtures)(
    'detects $label through Reflect.apply with its target and receiver prebound',
    ({ setup, name }) => {
      const presenter = join(projectFixtureRoot, `prebound-reflect-${name}.presenter.ts`);
      const source = `
        ${setup}
        const invoke = Reflect.apply.bind(undefined, target, receiver);
        void invoke(values);
      `;

      expect(projectWriteAuthorityCalls(new Map([[presenter, source]]), [presenter])).toEqual([
        { sourcePath: presenter, name },
      ]);
    },
  );

  test.each([
    [
      'MigrationRunner plan',
      `
        import type { MigrationRunner as Runner } from '../pipeline/migration-runner.js';
        declare const runner: Runner;
        void Reflect.apply(runner.run, runner, [{
          inputPath: 'input.html',
          outputPath: 'output.html',
          options: { mode: 'plan' },
        }]);
      `,
    ],
    [
      'prebound MigrationRunner plan',
      `
        import type { MigrationRunner as Runner } from '../pipeline/migration-runner.js';
        declare const runner: Runner;
        const invoke = Reflect.apply.bind(undefined, runner.run, runner);
        void invoke([{
          inputPath: 'input.html',
          outputPath: 'output.html',
          options: { mode: 'plan' },
        }]);
      `,
    ],
  ])('does not assign write authority to an explicit reflected %s', (_label, source) => {
    const presenter = join(projectFixtureRoot, 'reflected-plan.presenter.ts');

    expect(projectWriteAuthorityCalls(new Map([[presenter, source]]), [presenter])).toEqual([]);
  });

  test.each([
    [
      'unrelated formatter target',
      `
        interface Formatter { apply(value: string): string }
        declare const formatter: Formatter;
        void Reflect.apply(formatter.apply, formatter, ['text']);
      `,
    ],
    [
      'locally shadowed Reflect object',
      `
        import { MigrationRunner as Runner } from '../pipeline/migration-runner.js';
        declare const runner: Runner;
        const Reflect = { apply: (target: Function, receiver: unknown, values: unknown[]) =>
          target.apply(receiver, values) };
        void Reflect.apply(runner.run, runner, [{
          inputPath: 'input.html',
          outputPath: 'output.html',
          options: { mode: 'write' },
        }]);
      `,
    ],
    [
      'unrelated target through nested Function.call',
      `
        interface Formatter { format(value: string): string }
        declare const formatter: Formatter;
        void Reflect.apply.call.call(Reflect.apply, undefined, formatter.format, formatter, ['text']);
      `,
    ],
    [
      'unrelated prebound target',
      `
        interface Formatter { format(value: string): string }
        declare const formatter: Formatter;
        const invoke = Reflect.apply.bind(undefined, formatter.format, formatter);
        void invoke(['text']);
      `,
    ],
    [
      'unrelated nested Function.call target',
      `
        interface Formatter { format(value: string): string }
        declare const formatter: Formatter;
        void Reflect.apply(formatter.format.call, formatter.format, [formatter, 'text']);
      `,
    ],
  ])('does not confuse a Reflect.apply-shaped %s with write authority', (_label, source) => {
    const presenter = join(projectFixtureRoot, 'unrelated-reflect-apply.presenter.ts');

    expect(projectWriteAuthorityCalls(new Map([[presenter, source]]), [presenter])).toEqual([]);
  });

  test('ignores a same-named CommonJS class without transaction provenance', () => {
    const localModule = join(projectFixtureRoot, 'local-transaction.ts');
    const presenter = join(projectFixtureRoot, 'local-commonjs.presenter.ts');
    const inspection = inspectProject(
      new Map([
        [localModule, 'export class MigrationTransaction { apply(value: string): string { return value; } }'],
        [
          presenter,
          `
            const { MigrationTransaction } = require('./local-transaction.js');
            const transaction = new MigrationTransaction();
            transaction.apply('not a migration plan');
          `,
        ],
      ]),
      [localModule, presenter],
    );

    expect(inspection.transactionApplyCalls).toEqual([]);
  });

  test('keeps filesystem and transaction application authority out of the full report boundary', () => {
    const reportPaths = productionTypeScriptFiles(reportRoot);
    const inspection = inspectProject(new Map(), reportPaths);

    expect(reportPaths).toContain(terminalPresenterPath);
    expect(reportPaths).toContain(jsonReportWriterPath);
    expect(inspection.filesystemMutationCalls.filter(finding => finding.sourcePath !== jsonReportWriterPath)).toEqual(
      [],
    );
    expect(inspection.transactionApplyCalls).toEqual([]);
    expect(inspection.projectWriteAuthorityCalls).toEqual([]);
  });

  test(
    'keeps stylesheet and report paths out of adapter inputs',
    () => {
      expect(inspectTypeScriptProject(productionTypeScriptFiles(adapterRoot)).adapterPathInputs).toEqual([]);
    },
    wholeProjectInspectionTimeout,
  );

  test('does not confuse declarations with mutation calls', () => {
    const source = `
        interface Operations { writeFile(contents: string): Promise<void>; }
        const writeFile = 'documentation only';
        function rename(source: string): string { return source; }
      `;

    expect(mutationCall(source)).toBeUndefined();
  });

  test.each([
    ['unrelated receiver open', "cache.open('entry');"],
    ['unrelated receiver write', "handle.writeFile('body {}');"],
    [
      'local filesystem-shaped function',
      "function writeFile(value: string): string { return value; } const persist = writeFile; persist('not a path');",
    ],
    ['unrelated receiver rename', "operations.rename('a', 'b');"],
    [
      'local function routed through an operations object',
      "function writeFile(value: string): string { return value; } const operations = { persist: writeFile }; operations.persist('not a path');",
    ],
  ])('does not confuse a %s with a filesystem mutation', (_label, source) => {
    expect(mutationCall(source)).toBeUndefined();
  });

  test('follows a filesystem mutation through a local re-export and aliased import', () => {
    const bridge = join(projectFixtureRoot, 'filesystem-bridge.ts');
    const consumer = join(projectFixtureRoot, 'consumer.ts');
    const inspection = inspectProject(
      new Map([
        [bridge, "export { writeFile as save } from 'node:fs/promises';"],
        [consumer, "import { save as persist } from './filesystem-bridge.js'; void persist('output.html', 'body {}');"],
      ]),
      [consumer],
    );

    expect(inspection.filesystemMutationCalls).toEqual([{ sourcePath: consumer, name: 'writeFile' }]);
  });

  test('does not treat an identically named local re-export as filesystem provenance', () => {
    const bridge = join(projectFixtureRoot, 'local-bridge.ts');
    const consumer = join(projectFixtureRoot, 'local-consumer.ts');
    const inspection = inspectProject(
      new Map([
        [bridge, 'export function writeFile(value: string): string { return value; }'],
        [consumer, "import { writeFile as persist } from './local-bridge.js'; void persist('not a path');"],
      ]),
      [consumer],
    );

    expect(inspection.filesystemMutationCalls).toEqual([]);
  });

  test('follows a filesystem mutation through a local export-star barrel', () => {
    const bridge = join(projectFixtureRoot, 'filesystem-barrel.ts');
    const consumer = join(projectFixtureRoot, 'barrel-consumer.ts');
    const inspection = inspectProject(
      new Map([
        [bridge, "export * from 'node:fs/promises';"],
        [consumer, "import { unlink as remove } from './filesystem-barrel.js'; void remove('output.html');"],
      ]),
      [consumer],
    );

    expect(inspection.filesystemMutationCalls).toEqual([{ sourcePath: consumer, name: 'unlink' }]);
  });

  test('tracks destructuring from a dynamic filesystem import but not an unrelated module', () => {
    const filesystemConsumer = join(projectFixtureRoot, 'dynamic-filesystem.ts');
    const localModule = join(projectFixtureRoot, 'cache.ts');
    const localConsumer = join(projectFixtureRoot, 'dynamic-cache.ts');
    const inspection = inspectProject(
      new Map([
        [
          filesystemConsumer,
          "async function save() { const { writeFile: persist } = await import('node:fs/promises'); await persist('output.html', 'body {}'); }",
        ],
        [localModule, 'export function writeFile(value: string): string { return value; }'],
        [
          localConsumer,
          "async function save() { const { writeFile: persist } = await import('./cache.js'); persist('not a path'); }",
        ],
      ]),
      [filesystemConsumer, localConsumer],
    );

    expect(inspection.filesystemMutationCalls).toEqual([{ sourcePath: filesystemConsumer, name: 'writeFile' }]);
  });

  test('follows imported nested adapter option types', () => {
    const options = join(projectFixtureRoot, 'adapter-options.ts');
    const adapter = join(projectFixtureRoot, 'adapter.ts');
    const inspection = inspectProject(
      new Map([
        [
          options,
          'export interface AdapterOptions { output: { stylesheetPath: string }; metadata: { reportPath: string } }',
        ],
        [
          adapter,
          "import type { AdapterOptions } from './adapter-options.js'; export class Adapter { plan(options: AdapterOptions) { return options; } }",
        ],
      ]),
      [adapter],
    );

    expect(inspection.adapterPathInputs).toEqual([
      { sourcePath: adapter, name: 'stylesheetPath' },
      { sourcePath: adapter, name: 'reportPath' },
    ]);
  });
});
