import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { inspectTypeScript, productionTypeScriptFiles, type TypeScriptInspection } from './typescript-boundary';

const productionRoot = join(process.cwd(), 'src');
const transactionRoot = join(productionRoot, 'transaction');
const adapterRoot = join(productionRoot, 'adapter');
const migratorRoot = join(productionRoot, 'migrator');
const atomicFileWriterPath = join(productionRoot, 'lib', 'atomic-file.writer.ts');
const jsonReportWriterPath = join(productionRoot, 'report', 'json-report.writer.ts');
const fixturePath = join(productionRoot, 'fixture.ts');

const projectMutationCalls = new Set(['link', 'mkdir', 'open', 'rename', 'rmdir', 'unlink', 'writeFile']);
const forbiddenMigratorCalls = new Set(['rename', 'unlink', 'writeFile']);
const adapterPathNames = new Set(['stylesheetPath', 'reportPath']);
const atomicFileWriterModule = /(?:^|\/)atomic-file\.writer(?:\.[cm]?[jt]s)?$/u;
const filesystemModule = /^(?:node:)?fs(?:\/promises)?$/u;

function mutationCall(inspection: TypeScriptInspection): string | undefined {
  const aliasedMutations = new Map(
    (inspection.runtimeImports ?? [])
      .filter(
        binding => filesystemModule.test(binding.moduleReference) && projectMutationCalls.has(binding.importedName),
      )
      .map(binding => [binding.localName, binding.importedName]),
  );
  const called = (inspection.callExpressionNames ?? []).find(
    name => projectMutationCalls.has(name) || aliasedMutations.has(name),
  );
  return called === undefined ? undefined : (aliasedMutations.get(called) ?? called);
}

function forbiddenMigratorMutation(inspection: TypeScriptInspection): string | undefined {
  return (
    (inspection.callExpressionNames ?? []).find(name => forbiddenMigratorCalls.has(name)) ??
    (inspection.constructedExpressionNames ?? []).find(name => name === 'AtomicFileWriter') ??
    inspection.moduleReferences.find(reference => atomicFileWriterModule.test(reference))
  );
}

function adapterPathInput(inspection: TypeScriptInspection): string | undefined {
  return (
    (inspection.parameters ?? []).map(parameter => parameter.name).find(name => adapterPathNames.has(name)) ??
    (inspection.declaredPropertyNames ?? []).find(name => adapterPathNames.has(name))
  );
}

describe('migration transaction architecture boundary', () => {
  test.each([
    ['direct write', "writeFile('output.html', contents);", 'writeFile'],
    ['namespace rename', 'await operations.rename(source, destination);', 'rename'],
    ['computed unlink', "await operations['unlink'](temporary);", 'unlink'],
    ['file-handle write', "await handle.writeFile(contents, 'utf8');", 'writeFile'],
    [
      'aliased filesystem write',
      "import { writeFile as persist } from 'node:fs/promises'; void persist('output.html', contents);",
      'writeFile',
    ],
  ])('detects a %s call expression', (_label, source, expected) => {
    expect(mutationCall(inspectTypeScript(source, fixturePath))).toBe(expected);
  });

  test.each([
    ['constructor parameter', 'class Adapter { constructor(readonly stylesheetPath: string) {} }', 'stylesheetPath'],
    ['method parameter', 'class Adapter { plan(reportPath: string) {} }', 'reportPath'],
    ['interface property', 'interface AdapterOptions { readonly reportPath: string; }', 'reportPath'],
  ])('detects an adapter %s input', (_label, source, expected) => {
    expect(adapterPathInput(inspectTypeScript(source, fixturePath))).toBe(expected);
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

  test('makes the transaction the sole coordinated project-output mutation authority', () => {
    for (const path of productionTypeScriptFiles(productionRoot)) {
      if (path.startsWith(`${transactionRoot}/`) || path === atomicFileWriterPath) continue;
      expect(mutationCall(inspectTypeScript(readFileSync(path, 'utf8'), path)), relative(process.cwd(), path)).toBe(
        undefined,
      );
    }
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

  test('reserves AtomicFileWriter for the independent JSON report', () => {
    const consumers = productionTypeScriptFiles(productionRoot).filter(path =>
      inspectTypeScript(readFileSync(path, 'utf8'), path).moduleReferences.some(reference =>
        atomicFileWriterModule.test(reference),
      ),
    );

    expect(consumers).toEqual([jsonReportWriterPath]);
  });

  test('keeps stylesheet and report paths out of adapter inputs', () => {
    for (const path of productionTypeScriptFiles(adapterRoot)) {
      expect(adapterPathInput(inspectTypeScript(readFileSync(path, 'utf8'), path)), relative(process.cwd(), path)).toBe(
        undefined,
      );
    }
  });

  test('does not confuse declarations with mutation calls', () => {
    const inspection = inspectTypeScript(
      `
        interface Operations { writeFile(contents: string): Promise<void>; }
        const writeFile = 'documentation only';
        function rename(source: string): string { return source; }
      `,
      fixturePath,
    );

    expect(mutationCall(inspection)).toBeUndefined();
  });
});
