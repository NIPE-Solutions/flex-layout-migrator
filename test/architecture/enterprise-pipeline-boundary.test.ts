import { builtinModules } from 'node:module';
import { readFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

import { describe, expect, test } from 'vitest';

import {
  inspectTypeScript,
  inspectTypeScriptProject,
  inspectRuntimeDependencyClosure,
  inspectSemanticAuthorityCalls,
  moduleReferenceContainsPath,
  productionTypeScriptFiles,
  runtimeModuleReferences,
} from './typescript-boundary';

const productionRoot = join(process.cwd(), 'src');
const flexRoot = join(productionRoot, 'flex');
const pipelineRoot = join(productionRoot, 'pipeline');
const discoverStagePath = join(pipelineRoot, 'discover', 'discover-project.stage.ts');
const analyzeStagePath = join(pipelineRoot, 'analyze', 'analyze-project.stage.ts');
const atomicWriterPath = join(productionRoot, 'lib', 'atomic-file.writer.ts');
const roguePath = join(productionRoot, '__architecture-fixture__', 'rogue.ts');
const wholeProjectInspectionTimeout = 60_000;
const productionPaths = productionTypeScriptFiles(productionRoot);
let cachedProductionSemanticAuthorities: ReturnType<typeof inspectSemanticAuthorityCalls> | undefined;
let cachedRogueProductionSemanticAuthorities: ReturnType<typeof inspectSemanticAuthorityCalls> | undefined;
const productionGraphAuthorities = new Set([
  'AnalyzeProjectStage.run',
  'CurrentMigrationPipeline.run',
  'DiscoverProjectStage.run',
  'MigrationTransaction.apply',
  'Migrator.migrate',
]);
const resourceAuthorityNames = new Set([
  'DestinationTemplateSource.readFile',
  'DiscoveryTopology.readdir',
  'DiscoveryTopology.stat',
  'GitIgnoreHelper.acquire',
  'GitIgnoreHelper.createGitIgnoreMatcher',
  'IgnoreLibrary.acquire',
  'IgnoreLibrary.createMatcher',
  'IgnoreRulesSource.readFile',
  'OriginalTemplateSource.readFile',
  'PathIdentity.stat',
  'StylesheetSource.readFile',
  'UnownedFileSystem.readFile',
  'UnownedFileSystem.readdir',
  'UnownedFileSystem.stat',
]);
const expectedProductionAuthorityGraph = [
  { source: 'cli/run-cli.ts', authority: 'CurrentMigrationPipeline.run' },
  { source: 'migrator/migrator.ts', authority: 'MigrationTransaction.apply' },
  { source: 'pipeline/current-migration.pipeline.ts', authority: 'AnalyzeProjectStage.run' },
  { source: 'pipeline/current-migration.pipeline.ts', authority: 'DiscoverProjectStage.run' },
  { source: 'pipeline/current-migration.pipeline.ts', authority: 'Migrator.migrate' },
] as const;
const rogueProductionAuthorityCases = [
  {
    sourcePath: join(productionRoot, 'adapter', 'adapter.factory.ts'),
    authority: 'DiscoverProjectStage.run',
    source: `
      import type { DiscoverProjectStage } from '../pipeline/discover/discover-project.stage.js';
      declare const discover: DiscoverProjectStage;
      void discover.run(undefined as never);
    `,
  },
  {
    sourcePath: join(productionRoot, 'report', 'terminal.presenter.ts'),
    authority: 'AnalyzeProjectStage.run',
    source: `
      import type { AnalyzeProjectStage } from '../pipeline/analyze/analyze-project.stage.js';
      declare const analyze: AnalyzeProjectStage;
      void analyze.run(undefined as never);
    `,
  },
  {
    sourcePath: join(productionRoot, 'migrator', 'analyzed-file.migrator.ts'),
    authority: 'Migrator.migrate',
    source: `
      import type { Migrator } from './migrator.js';
      declare const migrator: Migrator;
      void migrator.migrate({ mode: 'plan' });
    `,
  },
  {
    sourcePath: join(productionRoot, 'adapter', 'css', 'css.adapter.ts'),
    authority: 'MigrationTransaction.apply',
    source: `
      import type { MigrationTransaction } from '../../transaction/migration-transaction.js';
      declare const transaction: MigrationTransaction;
      void transaction.apply(undefined as never);
    `,
  },
] as const;
const rogueProductionAuthorityOverrides = new Map(
  rogueProductionAuthorityCases.map(fixture => [fixture.sourcePath, fixture.source] as const),
);
const expectedRendererRelativePaths = [
  'adapter/css/css.adapter.ts',
  'adapter/css/flex/flex-align.css-renderer.ts',
  'adapter/css/flex/flex-fill.css-renderer.ts',
  'adapter/css/flex/flex-item.css-renderer.ts',
  'adapter/css/flex/flex-offset.css-renderer.ts',
  'adapter/css/flex/flex-order.css-renderer.ts',
  'adapter/css/flex/layout-align.css-renderer.ts',
  'adapter/css/flex/layout-gap.css-renderer.ts',
  'adapter/css/flex/layout.css-renderer.ts',
  'adapter/tailwind/grid/tailwind-grid.renderer.ts',
  'adapter/tailwind/tailwind.adapter.ts',
  'image/picture.renderer.ts',
] as const;
const rendererPaths = expectedRendererRelativePaths.map(path => join(productionRoot, path));
const discoveredLeafRendererPaths = productionTypeScriptFiles(productionRoot).filter(path =>
  /(?:^|[.-])renderer\.ts$/u.test(basename(path)),
);
const packageManifest = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
  readonly dependencies?: Readonly<Record<string, string>>;
};
const declaredRuntimePackages = new Set(Object.keys(packageManifest.dependencies ?? {}));
const builtins = new Set([...builtinModules, ...builtinModules.map(moduleName => `node:${moduleName}`)]);

function externalPackage(reference: string): string | undefined {
  if (reference.startsWith('.') || reference.startsWith('/') || builtins.has(reference)) return undefined;
  const segments = reference.split('/');
  return reference.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
}

function containsLayer(reference: string, layers: readonly string[]): boolean {
  return layers.some(layer => moduleReferenceContainsPath(reference, layer));
}

function forbiddenRendererDependency(source: string, sourcePath = roguePath): string | undefined {
  return inspectTypeScript(source, sourcePath).moduleReferences.find(
    reference =>
      /^(?:node:)?fs(?:\/|$)/u.test(reference) ||
      /^fs-extra(?:\/|$)/u.test(reference) ||
      containsLayer(reference, ['cli', 'report', 'transaction', 'lib/atomic-file.writer']),
  );
}

function forbiddenAnalyzeDependency(
  source: string,
  sourcePath = analyzeStagePath,
  sourceOverrides: ReadonlyMap<string, string> = new Map(),
): string | undefined {
  const overrides = new Map(sourceOverrides);
  overrides.set(sourcePath, source);
  return inspectRuntimeDependencyClosure([sourcePath], overrides)
    .map(finding => relative(productionRoot, finding.dependencyPath).replaceAll('\\', '/'))
    .find(dependency => {
      const modulePath = dependency.replace(/\.[cm]?[jt]sx?$/u, '');
      return (
        containsLayer(modulePath, ['adapter', 'edit', 'planner', 'report', 'transaction', 'lib/atomic-file.writer']) ||
        /(?:^|\/)[^/]*renderer$/u.test(modulePath) ||
        [
          'migrator/analyzed-file.migrator',
          'migrator/file.migrator',
          'migrator/folder.migrator',
          'migrator/migrator',
          'migrator/stylesheet.planner',
        ].some(candidate => moduleReferenceContainsPath(modulePath, candidate))
      );
    });
}

function mutationCalls(source: string): readonly string[] {
  return inspectTypeScriptProject([roguePath], new Map([[roguePath, source]])).filesystemMutationCalls.map(
    finding => finding.name,
  );
}

function rendererMutationAuthorities(source: string): readonly string[] {
  const inspection = inspectTypeScriptProject([roguePath], new Map([[roguePath, source]]));
  return [
    ...inspection.filesystemMutationCalls.map(finding => finding.name),
    ...inspection.transactionApplyCalls.map(() => 'MigrationTransaction.apply'),
  ];
}

function normalizedAuthoritySources(
  calls: readonly { readonly sourcePath: string; readonly name: string }[],
  names: ReadonlySet<string>,
): readonly { readonly source: string; readonly authority: string }[] {
  return calls
    .filter(call => names.has(call.name))
    .map(call => ({
      source: relative(productionRoot, call.sourcePath).replaceAll('\\', '/'),
      authority: call.name,
    }))
    .sort((left, right) => `${left.source}\0${left.authority}`.localeCompare(`${right.source}\0${right.authority}`));
}

function productionSemanticAuthorities(): ReturnType<typeof inspectSemanticAuthorityCalls> {
  cachedProductionSemanticAuthorities ??= inspectSemanticAuthorityCalls(productionPaths);
  return cachedProductionSemanticAuthorities;
}

function uniqueNormalizedAuthoritySources(
  calls: ReturnType<typeof inspectSemanticAuthorityCalls>,
  names: ReadonlySet<string>,
): readonly { readonly source: string; readonly authority: string }[] {
  const normalized = normalizedAuthoritySources(calls, names);
  return normalized.filter(
    (finding, index) =>
      index === 0 ||
      finding.source !== normalized[index - 1]?.source ||
      finding.authority !== normalized[index - 1]?.authority,
  );
}

function fixtureSemanticAuthorities(source: string, sourcePath = roguePath): readonly string[] {
  return inspectSemanticAuthorityCalls([sourcePath], new Map([[sourcePath, source]])).map(call => call.name);
}

function rogueProductionSemanticAuthorities(): ReturnType<typeof inspectSemanticAuthorityCalls> {
  cachedRogueProductionSemanticAuthorities ??= inspectSemanticAuthorityCalls(
    productionPaths,
    rogueProductionAuthorityOverrides,
  );
  return cachedRogueProductionSemanticAuthorities;
}

describe('enterprise pipeline dependency boundary', { timeout: wholeProjectInspectionTimeout }, () => {
  test('keeps the exhaustive whole-production authority graph exact', () => {
    expect(normalizedAuthoritySources(productionSemanticAuthorities(), productionGraphAuthorities)).toEqual(
      expectedProductionAuthorityGraph,
    );
  });

  test.each(rogueProductionAuthorityCases)(
    'rejects a rogue production $authority authority from $sourcePath',
    fixture => {
      expect(
        normalizedAuthoritySources(rogueProductionSemanticAuthorities(), productionGraphAuthorities),
      ).toContainEqual({
        source: relative(productionRoot, fixture.sourcePath).replaceAll('\\', '/'),
        authority: fixture.authority,
      });
    },
  );

  test.each([
    [
      'aliased stat through Reflect.apply',
      "import { stat as inspect } from 'node:fs/promises'; void Reflect.apply(inspect, undefined, ['input']);",
      'UnownedFileSystem.stat',
    ],
    [
      'namespace readdir through Function.apply',
      "import * as fs from 'node:fs/promises'; void fs.readdir.apply(fs, ['input']);",
      'UnownedFileSystem.readdir',
    ],
    [
      'dynamic-import stat through a local alias',
      "async function run() { const { stat: inspect } = await import('node:fs/promises'); await inspect('input'); }",
      'UnownedFileSystem.stat',
    ],
    [
      'CommonJS readdir through a computed member',
      "const fs = require('node:fs/promises'); void fs['readdir'].call(fs, 'input');",
      'UnownedFileSystem.readdir',
    ],
  ])('detects direct topology bypass via %s', (_label, source, expected) => {
    expect(fixtureSemanticAuthorities(source)).toContain(expected);
  });

  test.each([
    [
      'adapter original-template read alias',
      "import { readFile as readOriginal } from 'node:fs/promises'; void readOriginal.call(undefined, 'card.html', 'utf8');",
      'UnownedFileSystem.readFile',
    ],
    [
      'continuation dynamic namespace read',
      "async function run() { const fs = await import('node:fs/promises'); await Reflect.apply(fs.readFile, fs, ['card.html', 'utf8']); }",
      'UnownedFileSystem.readFile',
    ],
  ])('detects a direct readFile bypass via %s', (_label, source, expected) => {
    expect(fixtureSemanticAuthorities(source)).toContain(expected);
  });

  test.each([
    [
      'legacy ignore library alias',
      "import makeMatcher from 'ignore'; const create = makeMatcher; void Reflect.apply(create, undefined, []);",
      'IgnoreLibrary.createMatcher',
    ],
    [
      'CommonJS gitignore helper alias',
      "const { createGitIgnoreMatcher: load } = require('../lib/gitignore.helper.js'); void load('input');",
      'GitIgnoreHelper.createGitIgnoreMatcher',
    ],
    [
      'dynamic gitignore helper namespace',
      "async function run() { const helper = await import('../lib/gitignore.helper.js'); await helper.createGitIgnoreMatcher('input'); }",
      'GitIgnoreHelper.createGitIgnoreMatcher',
    ],
  ])('detects direct ignore authority acquisition via %s', (_label, source, expected) => {
    expect(fixtureSemanticAuthorities(source)).toContain(expected);
  });

  test.each([
    ["import makeMatcher from 'ignore'; void makeMatcher;", 'IgnoreLibrary.acquire'],
    ["const ignoreModule = require('ignore'); void ignoreModule;", 'IgnoreLibrary.acquire'],
    [
      "async function run() { const ignoreModule = await import('ignore'); return ignoreModule; }",
      'IgnoreLibrary.acquire',
    ],
    ["import * as helper from '../lib/gitignore.helper.js'; void helper;", 'GitIgnoreHelper.acquire'],
  ])('detects a direct ignore module acquisition without requiring invocation: %s', (source, expected) => {
    expect(fixtureSemanticAuthorities(source)).toContain(expected);
  });

  test.each([
    'interface Cache { stat(path: string): void } declare const cache: Cache; cache.stat("entry");',
    'function readdir(path: string): string[] { return [path]; } void readdir("entry");',
    'const readFile = (path: string): string => path; void readFile("entry");',
    'const ignore = (): { accepts(path: string): boolean } => ({ accepts: () => true }); void ignore();',
    'async function run() { const module = await import("../logger.js"); module.logger.debug("readFile stat ignore"); }',
  ])('does not confuse an unrelated or non-filesystem read-only callable with resource authority: %s', source => {
    expect(fixtureSemanticAuthorities(source).filter(name => resourceAuthorityNames.has(name))).toEqual([]);
  });

  test('keeps direct filesystem and ignore authorities at their named production owners', () => {
    expect(uniqueNormalizedAuthoritySources(productionSemanticAuthorities(), resourceAuthorityNames)).toEqual([
      { source: 'lib/gitignore.helper.ts', authority: 'IgnoreLibrary.acquire' },
      { source: 'lib/gitignore.helper.ts', authority: 'IgnoreLibrary.createMatcher' },
      { source: 'lib/gitignore.helper.ts', authority: 'IgnoreRulesSource.readFile' },
      { source: 'migrator/analyzed-file.migrator.ts', authority: 'DestinationTemplateSource.readFile' },
      { source: 'migrator/migration-path.validator.ts', authority: 'PathIdentity.stat' },
      { source: 'migrator/migrator.ts', authority: 'DestinationTemplateSource.readFile' },
      { source: 'migrator/stylesheet.planner.ts', authority: 'StylesheetSource.readFile' },
      { source: 'pipeline/analyze/analyze-project.stage.ts', authority: 'OriginalTemplateSource.readFile' },
      { source: 'pipeline/discover/discover-project.stage.ts', authority: 'DiscoveryTopology.readdir' },
      { source: 'pipeline/discover/discover-project.stage.ts', authority: 'DiscoveryTopology.stat' },
      {
        source: 'pipeline/discover/discover-project.stage.ts',
        authority: 'GitIgnoreHelper.acquire',
      },
    ]);
  });

  test('keeps Flex semantics independent from both target adapters', () => {
    for (const path of productionTypeScriptFiles(flexRoot)) {
      const targetImport = inspectTypeScript(readFileSync(path, 'utf8'), path).moduleReferences.find(reference =>
        containsLayer(reference, ['adapter/css', 'adapter/tailwind']),
      );

      expect(targetImport, relative(process.cwd(), path)).toBeUndefined();
    }
  });

  test('makes Discover the semantic owner of topology and ignore loading', () => {
    const semanticAuthorityCalls = productionSemanticAuthorities();
    const discoveryAuthorities = new Set([
      'DiscoveryFileSystem.kind',
      'DiscoveryFileSystem.entries',
      'IgnoreMatcherFactory.load',
    ]);
    const matcherImporters = productionPaths.flatMap(path =>
      inspectTypeScript(readFileSync(path, 'utf8'), path).runtimeImports.some(
        imported =>
          imported.importedName === 'createGitIgnoreMatcher' &&
          moduleReferenceContainsPath(imported.moduleReference, 'lib/gitignore.helper'),
      )
        ? [path]
        : [],
    );

    expect(normalizedAuthoritySources(semanticAuthorityCalls, discoveryAuthorities)).toEqual([
      { source: 'pipeline/discover/discover-project.stage.ts', authority: 'DiscoveryFileSystem.entries' },
      { source: 'pipeline/discover/discover-project.stage.ts', authority: 'DiscoveryFileSystem.kind' },
      { source: 'pipeline/discover/discover-project.stage.ts', authority: 'IgnoreMatcherFactory.load' },
    ]);
    expect(matcherImporters).toEqual([discoverStagePath]);
  });

  test('makes Analyze the sole original-read, initial-parse, and input-analysis owner', () => {
    const semanticAuthorityCalls = productionSemanticAuthorities();
    const analyzeAuthorities = new Set(['TemplateSourceReader.read', 'TemplateInputAnalyzer.analyze']);
    const parseCalls = normalizedAuthoritySources(
      semanticAuthorityCalls,
      new Set([
        'AngularTemplateParser.parse',
        'ChangedTemplateValidation.parse',
        'CssReferenceParser.parse',
        'OriginalTemplateParser.parse',
        'StagedTemplateValidation.parse',
      ]),
    );

    expect(normalizedAuthoritySources(semanticAuthorityCalls, analyzeAuthorities)).toEqual([
      { source: 'pipeline/analyze/analyze-project.stage.ts', authority: 'TemplateInputAnalyzer.analyze' },
      { source: 'pipeline/analyze/analyze-project.stage.ts', authority: 'TemplateSourceReader.read' },
    ]);
    expect(parseCalls).toEqual([
      { source: 'migrator/analyzed-file.migrator.ts', authority: 'ChangedTemplateValidation.parse' },
      { source: 'migrator/migrator.ts', authority: 'CssReferenceParser.parse' },
      { source: 'pipeline/analyze/analyze-project.stage.ts', authority: 'OriginalTemplateParser.parse' },
      { source: 'transaction/migration-transaction.ts', authority: 'StagedTemplateValidation.parse' },
    ]);
  });

  test('keeps Analyze target-neutral and free of filesystem mutation authority', () => {
    const source = readFileSync(analyzeStagePath, 'utf8');
    const forbiddenImport = forbiddenAnalyzeDependency(source);

    expect(forbiddenImport).toBeUndefined();
    expect(inspectTypeScriptProject([analyzeStagePath]).filesystemMutationCalls).toEqual([]);
  });

  test.each([
    ["void import('../../adapter/conversion-adapter.js');", '../../adapter/conversion-adapter.js'],
    ["const planner = require('../../planner/conversion-planner.js');", '../../planner/conversion-planner.js'],
    [
      "export { MigrationTransaction } from '../../transaction/migration-transaction.js';",
      '../../transaction/migration-transaction.js',
    ],
  ])('rejects an Analyze runtime dependency on %s', (source, expected) => {
    expect(inspectTypeScript(source, analyzeStagePath).moduleReferences).toContain(expected);
  });

  test.each([
    "import { AnalyzedFileMigrator } from '../../migrator/analyzed-file.migrator.js'; void AnalyzedFileMigrator;",
    "import { FileMigrator } from '../../migrator/file.migrator.js'; void FileMigrator;",
    "import { FolderMigrator } from '../../migrator/folder.migrator.js'; void FolderMigrator;",
    "import { Migrator } from '../../migrator/migrator.js'; void Migrator;",
    "import { SourceEditor } from '../../edit/source-editor.js'; void SourceEditor;",
    "import { PictureRenderer } from '../../image/picture.renderer.js'; void PictureRenderer;",
  ])('rejects an Analyze dependency on a concrete render/edit/migrator implementation: %s', source => {
    expect(forbiddenAnalyzeDependency(source)).toBeDefined();
  });

  test('rejects an Analyze dependency hidden behind a re-export alias barrel', () => {
    const barrelPath = join(productionRoot, '__architecture-fixture__', 'analyze-implementation.barrel.ts');
    const source = `
      import { EditorAlias } from '../../__architecture-fixture__/analyze-implementation.barrel.js';
      void EditorAlias;
    `;
    const overrides = new Map([
      [analyzeStagePath, source],
      [barrelPath, "export { SourceEditor as EditorAlias } from '../edit/source-editor.js';"],
    ]);

    expect(forbiddenAnalyzeDependency(source, analyzeStagePath, overrides)).toBeDefined();
  });

  test.each([
    "async function load() { return import('../../adapter/conversion-adapter.js'); } void load();",
    "const planner = require('../../planner/conversion-planner.js'); void planner;",
  ])('rejects an Analyze implementation dependency acquired dynamically: %s', source => {
    expect(forbiddenAnalyzeDependency(source)).toBeDefined();
  });

  test.each([
    "import { logger } from '../../logger.js'; logger.debug('adapter renderer edit migrator');",
    "import { helper } from '../../__architecture-fixture__/migration-reporting.helper.js'; void helper;",
    "import type { AnalyzedFileMigrator } from '../../migrator/analyzed-file.migrator.js'; type Plan = AnalyzedFileMigrator;",
  ])('allows an unrelated or type-only Analyze dependency negative: %s', source => {
    expect(forbiddenAnalyzeDependency(source)).toBeUndefined();
  });

  test('keeps renderers independent from filesystem and application control layers', () => {
    expect(rendererPaths.map(path => relative(productionRoot, path).replaceAll('\\', '/'))).toEqual(
      expectedRendererRelativePaths,
    );
    expect(rendererPaths).toEqual(expect.arrayContaining(discoveredLeafRendererPaths));

    for (const path of rendererPaths) {
      const forbidden = forbiddenRendererDependency(readFileSync(path, 'utf8'), path);

      expect(forbidden, relative(process.cwd(), path)).toBeUndefined();
    }

    const mutationInspection = inspectTypeScriptProject(rendererPaths);
    expect(mutationInspection.filesystemMutationCalls).toEqual([]);
    expect(mutationInspection.transactionApplyCalls).toEqual([]);
  });

  test.each([
    ["import fs from 'fs-extra';", 'fs-extra'],
    ["import fs from 'fs-extra/esm';", 'fs-extra/esm'],
    ["import { AtomicFileWriter } from '../../lib/atomic-file.writer';", '../../lib/atomic-file.writer'],
    [
      "import { MigrationTransaction } from '../../transaction/migration-transaction';",
      '../../transaction/migration-transaction',
    ],
  ])('rejects renderer filesystem authority: %s', (source, expected) => {
    expect(forbiddenRendererDependency(source)).toBe(expected);
  });

  test('rejects direct filesystem and transaction mutation authority in a renderer', () => {
    const source = `
      import { createWriteStream } from 'node:fs';
      import type { MigrationTransaction } from '../transaction/migration-transaction.js';
      import type { MigrationPlan } from '../migrator/migration-plan.js';
      declare const transaction: Pick<MigrationTransaction, 'apply'>;
      declare const plan: MigrationPlan;
      createWriteStream('target');
      void transaction.apply(plan);
    `;

    expect(rendererMutationAuthorities(source)).toEqual(['createWriteStream', 'MigrationTransaction.apply']);
  });

  test('keeps presenters independent from implementation and mutation layers', () => {
    const presenterPaths = productionTypeScriptFiles(productionRoot).filter(path =>
      /(?:^|[.-])presenter\.ts$/u.test(basename(path)),
    );

    for (const path of presenterPaths) {
      const forbidden = inspectTypeScript(readFileSync(path, 'utf8'), path).moduleReferences.find(reference =>
        containsLayer(reference, ['adapter', 'planner', 'migrator', 'transaction']),
      );

      expect(forbidden, relative(process.cwd(), path)).toBeUndefined();
    }
  });

  test('reserves project mutation APIs for transaction and atomic-writer modules', () => {
    const pipelinePaths = productionTypeScriptFiles(pipelineRoot);
    expect(productionPaths).toEqual(expect.arrayContaining([...pipelinePaths]));

    const forbidden = inspectTypeScriptProject(productionPaths).filesystemMutationCalls.filter(
      finding =>
        !finding.sourcePath.startsWith(`${join(productionRoot, 'transaction')}/`) &&
        finding.sourcePath !== atomicWriterPath,
    );

    expect(forbidden).toEqual([]);
  });

  test.each([
    ["import { rm } from 'node:fs/promises'; void rm('target', { recursive: true });", 'rm'],
    ["import { copyFile } from 'node:fs/promises'; void copyFile('source', 'target');", 'copyFile'],
    ["import { appendFile } from 'node:fs/promises'; void appendFile('target', 'value');", 'appendFile'],
    ["import { truncate } from 'node:fs/promises'; void truncate('target');", 'truncate'],
    ["import * as fs from 'node:fs'; fs.rmSync('target', { recursive: true });", 'rmSync'],
    ["import * as fs from 'node:fs'; fs.copyFileSync('source', 'target');", 'copyFileSync'],
    ["import * as fs from 'node:fs'; fs.appendFileSync('target', 'value');", 'appendFileSync'],
    ["import * as fs from 'node:fs'; fs.truncateSync('target');", 'truncateSync'],
    ["import fs from 'fs-extra'; void fs.outputFile('target', 'value');", 'outputFile'],
    ["import fs from 'fs-extra/esm'; void fs.copy('source', 'target');", 'copy'],
    ["import { removeSync } from 'fs-extra'; removeSync('target');", 'removeSync'],
    ["import { createWriteStream } from 'node:fs'; createWriteStream('target');", 'createWriteStream'],
    ["import * as fs from 'node:fs'; fs.createWriteStream('target');", 'createWriteStream'],
    [
      "import type { FileHandle } from 'node:fs/promises'; declare const file: FileHandle; file.createWriteStream();",
      'createWriteStream',
    ],
    ["import { WriteStream } from 'node:fs'; new WriteStream('target');", 'WriteStream'],
  ])('detects a rogue project mutation through %s', (source, expected) => {
    expect(mutationCalls(source)).toContain(expected);
  });

  test.each([
    "import { readFile } from 'node:fs/promises'; void readFile('target');",
    "import fs from 'fs-extra'; void fs.pathExists('target');",
    "import { createReadStream } from 'node:fs'; createReadStream('target');",
    "import { ReadStream } from 'node:fs'; new ReadStream('target');",
    "import type { FileHandle } from 'node:fs/promises'; declare const file: FileHandle; file.createReadStream();",
  ])('permits read-only filesystem access in the project mutation scan: %s', source => {
    expect(mutationCalls(source)).toEqual([]);
  });

  test('allows only the known undeclared ignore runtime package until the dependency slice', () => {
    const undeclared = productionTypeScriptFiles(productionRoot).flatMap(path =>
      runtimeModuleReferences(readFileSync(path, 'utf8'), path).flatMap(reference => {
        const packageName = externalPackage(reference);
        return packageName === undefined || declaredRuntimePackages.has(packageName) ? [] : [packageName];
      }),
    );

    expect([...new Set(undeclared)].sort()).toEqual(['ignore']);
  });
});
