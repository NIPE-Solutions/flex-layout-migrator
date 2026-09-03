import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import {
  inspectTypeScript,
  inspectTypeScriptProject,
  productionTypeScriptFiles,
  type TypeScriptInspection,
  type TypeScriptProjectInspection,
} from './typescript-boundary';

const productionRoot = join(process.cwd(), 'src');
const transactionRoot = join(productionRoot, 'transaction');
const adapterRoot = join(productionRoot, 'adapter');
const migratorRoot = join(productionRoot, 'migrator');
const reportRoot = join(productionRoot, 'report');
const atomicFileWriterPath = join(productionRoot, 'lib', 'atomic-file.writer.ts');
const jsonReportWriterPath = join(productionRoot, 'report', 'json-report.writer.ts');
const terminalPresenterPath = join(reportRoot, 'terminal.presenter.ts');
const fixturePath = join(productionRoot, 'fixture.ts');
const projectFixtureRoot = join(productionRoot, '__architecture-fixture__');
const wholeProjectInspectionTimeout = 20_000;

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
  readonly name: 'apply' | 'migrate';
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

describe('migration transaction architecture boundary', () => {
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

  test('keeps FileMigrator and FolderMigrator free of direct writes and AtomicFileWriter usage', () => {
    for (const fileName of ['file.migrator.ts', 'folder.migrator.ts']) {
      const path = join(migratorRoot, fileName);
      expect(
        forbiddenMigratorMutation(inspectTypeScript(readFileSync(path, 'utf8'), path)),
        relative(process.cwd(), path),
      ).toBeUndefined();
    }
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

  test('detects a presenter invoking canonical Migrator#migrate in write mode', () => {
    const presenter = join(projectFixtureRoot, 'migrator.presenter.ts');
    const source = `
      import { Migrator as Coordinator } from '../migrator/migrator.js';
      declare const migrator: Coordinator;
      void migrator.migrate({ mode: 'write' });
    `;

    expect(projectWriteAuthorityCalls(new Map([[presenter, source]]), [presenter])).toEqual([
      { sourcePath: presenter, name: 'migrate' },
    ]);
  });

  test.each([
    ['an explicit plan', "void migrator.migrate({ mode: 'plan' });"],
    ['the default plan', 'void migrator.migrate();'],
  ])('allows a presenter to request %s without acquiring project-write authority', (_label, invocation) => {
    const presenter = join(projectFixtureRoot, 'plan-migrator.presenter.ts');
    const source = `
      import { Migrator as Coordinator } from '../migrator/migrator.js';
      declare const migrator: Coordinator;
      ${invocation}
    `;

    expect(projectWriteAuthorityCalls(new Map([[presenter, source]]), [presenter])).toEqual([]);
  });

  test('follows canonical write-mode migration through barrel and import aliases', () => {
    const barrel = join(projectFixtureRoot, 'migrator.index.ts');
    const presenter = join(projectFixtureRoot, 'barrel-migrator.presenter.ts');
    const sources = new Map([
      [barrel, "export { Migrator as Coordinator } from '../migrator/migrator.js';"],
      [
        presenter,
        `
          import { Coordinator as ImportedCoordinator } from './migrator.index.js';
          declare const migrator: ImportedCoordinator;
          void migrator.migrate({ mode: 'write' });
        `,
      ],
    ]);

    expect(projectWriteAuthorityCalls(sources, [presenter])).toEqual([{ sourcePath: presenter, name: 'migrate' }]);
  });

  test.each([
    [
      'dynamic import',
      `
        const { Migrator: Coordinator } = await import('../migrator/migrator.js');
        const migrator = new Coordinator(undefined as never, 'input.html', 'output.html');
      `,
    ],
    [
      'CommonJS require',
      `
        const { Migrator: Coordinator } = require('../migrator/migrator.js');
        const migrator = new Coordinator(undefined, 'input.html', 'output.html');
      `,
    ],
  ])('detects canonical write-mode migration acquired through %s', (_label, setup) => {
    const presenter = join(projectFixtureRoot, 'runtime-migrator.presenter.ts');
    const source = `
      async function present() {
        ${setup}
        await migrator.migrate({ mode: 'write' });
      }
    `;

    expect(projectWriteAuthorityCalls(new Map([[presenter, source]]), [presenter])).toEqual([
      { sourcePath: presenter, name: 'migrate' },
    ]);
  });

  test.each([
    [
      'an unrelated migrate method',
      `
        interface Previewer { migrate(options: { mode: 'write' }): void }
        declare const previewer: Previewer;
        previewer.migrate({ mode: 'write' });
      `,
    ],
    [
      'an unused type-only Migrator import',
      "import type { Migrator } from '../migrator/migrator.js'; export type DeferredMigrator = Migrator;",
    ],
  ])('does not confuse %s with project-write authority', (_label, source) => {
    const presenter = join(projectFixtureRoot, 'unrelated-migrator.presenter.ts');

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
    'keeps project-write authority out of production code except the CLI and Migrator orchestration boundaries',
    () => {
      const runCliPath = join(productionRoot, 'cli', 'run-cli.ts');
      const migratorPath = join(migratorRoot, 'migrator.ts');
      const findings = projectWriteAuthorityCalls(new Map(), productionTypeScriptFiles(productionRoot)).filter(
        finding => finding.sourcePath !== runCliPath && finding.sourcePath !== migratorPath,
      );

      expect(findings).toEqual([]);
    },
    wholeProjectInspectionTimeout,
  );

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
