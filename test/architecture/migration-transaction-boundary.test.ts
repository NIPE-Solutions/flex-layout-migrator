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
const atomicFileWriterPath = join(productionRoot, 'lib', 'atomic-file.writer.ts');
const jsonReportWriterPath = join(productionRoot, 'report', 'json-report.writer.ts');
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
