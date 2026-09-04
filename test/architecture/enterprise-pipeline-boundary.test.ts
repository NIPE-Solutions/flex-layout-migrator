import { builtinModules } from 'node:module';
import { readFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

import { describe, expect, test } from 'vitest';

import {
  createTypeScriptProjectInspectionSession,
  inspectTypeScript,
  inspectTypeScriptProject,
  inspectRuntimeDependencyClosure,
  inspectRuntimeExportSymbolProvenance,
  inspectRuntimeSymbolProvenance,
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
const semanticRoot = join(productionRoot, 'semantic');
const semanticRenderCoordinatorPath = join(productionRoot, 'planner', 'semantic-render.coordinator.ts');
const atomicWriterPath = join(productionRoot, 'lib', 'atomic-file.writer.ts');
const migratorPath = join(productionRoot, 'migrator', 'migrator.ts');
const conversionAdapterPath = join(productionRoot, 'adapter', 'conversion-adapter.ts');
const destinationTemplateSourcePath = join(productionRoot, 'migrator', 'destination-template-source.ts');
const stylesheetPlannerPath = join(productionRoot, 'migrator', 'stylesheet.planner.ts');
const legacyResponsiveFamilyPlannerPath = join(productionRoot, 'adapter', 'responsive-family.planner.ts');
const semanticResponsiveFamilyPlannerSpecPath = join(productionRoot, 'semantic', 'responsive-family.planner.spec.ts');
const roguePath = join(productionRoot, '__architecture-fixture__', 'rogue.ts');
const wholeProjectInspectionTimeout = 60_000;
const productionPaths = productionTypeScriptFiles(productionRoot);
const semanticPaths = productionTypeScriptFiles(semanticRoot);
const productionInspection = createTypeScriptProjectInspectionSession(productionPaths);
const semanticInspection = createTypeScriptProjectInspectionSession(semanticPaths);
const adapterPlannerPaths = productionTypeScriptFiles(join(productionRoot, 'adapter')).filter(path =>
  basename(path).endsWith('.planner.ts'),
);
const targetResponsiveRangeOwnerPaths = [
  'adapter/tailwind/extended/extended-display-composition.planner.ts',
  'adapter/tailwind/extended/generated-property-composition.planner.ts',
  'adapter/tailwind/visibility/display-composition.planner.ts',
].map(path => join(productionRoot, path));
let cachedProductionSemanticAuthorities: ReturnType<typeof inspectSemanticAuthorityCalls> | undefined;
let cachedRogueProductionSemanticAuthorities: ReturnType<typeof inspectSemanticAuthorityCalls> | undefined;
let cachedGitIgnoreBarrelAuthorities: ReturnType<typeof inspectSemanticAuthorityCalls> | undefined;
let cachedLocalBindingBarrelAuthorities: ReturnType<typeof inspectSemanticAuthorityCalls> | undefined;
let cachedFilesystemBarrelAuthorities: ReturnType<typeof inspectSemanticAuthorityCalls> | undefined;
let cachedFilesystemNamespaceUnionAuthorities: ReturnType<typeof inspectSemanticAuthorityCalls> | undefined;
let cachedFilesystemPluralProvenanceAuthorities: ReturnType<typeof inspectSemanticAuthorityCalls> | undefined;
const productionGraphAuthorities = new Set([
  'AnalyzeProjectStage.run',
  'CurrentMigrationPipeline.run',
  'DiscoverProjectStage.run',
  'MigrationTransaction.apply',
  'Migrator.migrate',
  'RenderProjectStage.run',
]);
const filesystemOperationAuthorityNames = [
  'FileSystem.access',
  'FileSystem.accessSync',
  'FileSystem.createReadStream',
  'FileSystem.Dir',
  'FileSystem.exists',
  'FileSystem.existsSync',
  'FileSystem.FileReadStream',
  'FileSystem.fstat',
  'FileSystem.fstatSync',
  'FileSystem.glob',
  'FileSystem.globSync',
  'FileSystem.lstat',
  'FileSystem.lstatSync',
  'FileSystem.open',
  'FileSystem.openAsBlob',
  'FileSystem.openSync',
  'FileSystem.opendir',
  'FileSystem.opendirSync',
  'FileSystem.pathExists',
  'FileSystem.pathExistsSync',
  'FileSystem.read',
  'FileSystem.readFile',
  'FileSystem.readFileSync',
  'FileSystem.readJSON',
  'FileSystem.readJson',
  'FileSystem.readJSONSync',
  'FileSystem.readJsonSync',
  'FileSystem.readLines',
  'FileSystem.readableWebStream',
  'FileSystem.ReadStream',
  'FileSystem.readSync',
  'FileSystem.readv',
  'FileSystem.readvSync',
  'FileSystem.readdir',
  'FileSystem.readdirSync',
  'FileSystem.readlink',
  'FileSystem.readlinkSync',
  'FileSystem.realpath',
  'FileSystem.realpathSync',
  'FileSystem.stat',
  'FileSystem.statfs',
  'FileSystem.statfsSync',
  'FileSystem.statSync',
  'FileSystem.Utf8Stream',
  'FileSystem.watch',
  'FileSystem.watchFile',
] as const;
const filesystemAcquisitionAuthorityNames = [
  'FileSystem.acquire.*',
  ...filesystemOperationAuthorityNames.map(authority => authority.replace('FileSystem.', 'FileSystem.acquire.')),
] as const;
const resourceAuthorityNames = new Set([
  'DestinationTemplateSource.read',
  // Keep the retired generic name in the filter so the exact graph catches any future collapse.
  'FileSystem.acquire',
  ...filesystemAcquisitionAuthorityNames,
  ...filesystemOperationAuthorityNames,
  'GitIgnoreHelper.acquire',
  'GitIgnoreHelper.createGitIgnoreMatcher',
  'IgnoreLibrary.acquire',
  'IgnoreLibrary.createMatcher',
]);
const expectedProductionAuthorityGraph = [
  { source: 'cli/run-cli.ts', authority: 'CurrentMigrationPipeline.run' },
  { source: 'migrator/migrator.ts', authority: 'MigrationTransaction.apply' },
  { source: 'pipeline/current-migration.pipeline.ts', authority: 'AnalyzeProjectStage.run' },
  { source: 'pipeline/current-migration.pipeline.ts', authority: 'DiscoverProjectStage.run' },
  { source: 'pipeline/current-migration.pipeline.ts', authority: 'Migrator.migrate' },
  { source: 'pipeline/current-migration.pipeline.ts', authority: 'RenderProjectStage.run' },
  { source: 'pipeline/migration-pipeline.ts', authority: 'RenderProjectStage.run' },
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
const gitIgnoreBarrelPath = join(productionRoot, '__architecture-fixture__', 'gitignore.barrel.ts');
const gitIgnoreBarrelCases = [
  {
    label: 'unused ESM re-export alias',
    sourcePath: join(productionRoot, '__architecture-fixture__', 'gitignore-esm-unused.ts'),
    source: "import { matcherAlias as unused } from './gitignore.barrel.js'; void unused;",
    expected: ['GitIgnoreHelper.acquire'],
  },
  {
    label: 'invoked ESM re-export alias',
    sourcePath: join(productionRoot, '__architecture-fixture__', 'gitignore-esm-invoked.ts'),
    source: "import { matcherAlias } from './gitignore.barrel.js'; void matcherAlias('/project');",
    expected: ['GitIgnoreHelper.acquire', 'GitIgnoreHelper.createGitIgnoreMatcher'],
  },
  {
    label: 'unused dynamic barrel',
    sourcePath: join(productionRoot, '__architecture-fixture__', 'gitignore-dynamic-unused.ts'),
    source: "async function load() { return import('./gitignore.barrel.js'); } void load();",
    expected: ['GitIgnoreHelper.acquire'],
  },
  {
    label: 'invoked dynamic barrel',
    sourcePath: join(productionRoot, '__architecture-fixture__', 'gitignore-dynamic-invoked.ts'),
    source:
      "async function load() { const helper = await import('./gitignore.barrel.js'); return helper.matcherAlias('/project'); } void load();",
    expected: ['GitIgnoreHelper.acquire', 'GitIgnoreHelper.createGitIgnoreMatcher'],
  },
  {
    label: 'unused CommonJS barrel',
    sourcePath: join(productionRoot, '__architecture-fixture__', 'gitignore-commonjs-unused.ts'),
    source: "const helper = require('./gitignore.barrel.js'); void helper;",
    expected: ['GitIgnoreHelper.acquire'],
  },
  {
    label: 'invoked CommonJS barrel',
    sourcePath: join(productionRoot, '__architecture-fixture__', 'gitignore-commonjs-invoked.ts'),
    source: "const { matcherAlias: create } = require('./gitignore.barrel.js'); void create('/project');",
    expected: ['GitIgnoreHelper.acquire', 'GitIgnoreHelper.createGitIgnoreMatcher'],
  },
] as const;
const gitIgnoreBarrelOverrides = new Map([
  [gitIgnoreBarrelPath, "export { createGitIgnoreMatcher as matcherAlias } from '../lib/gitignore.helper.js';"],
  ...gitIgnoreBarrelCases.map(fixture => [fixture.sourcePath, fixture.source] as const),
]);
const localBindingFixtureRoot = join(productionRoot, '__architecture-fixture__');
const helperAliasChainPath = join(localBindingFixtureRoot, 'helper-alias-chain.ts');
const helperCycleAPath = join(localBindingFixtureRoot, 'helper-cycle-a.ts');
const helperCycleBPath = join(localBindingFixtureRoot, 'helper-cycle-b.ts');
const unrelatedBarrelPath = join(localBindingFixtureRoot, 'unrelated.barrel.ts');
const typeOnlyBarrelPath = join(localBindingFixtureRoot, 'type-only.barrel.ts');
const localBindingBarrelCases = [
  {
    label: 'unused ESM filesystem alias acquired by Migrator from its named owner',
    sourcePath: migratorPath,
    source: "import { existingDestinationRead as unused } from './destination-template-source.js'; void unused;",
    expected: 'FileSystem.acquire.readFile',
  },
  {
    label: 'unused dynamic filesystem alias from its named owner',
    sourcePath: join(localBindingFixtureRoot, 'local-fs-dynamic-consumer.ts'),
    source:
      "async function load() { const unused = await import('../migrator/destination-template-source.js'); return unused; } void load();",
    expected: 'FileSystem.acquire.readFile',
  },
  {
    label: 'unused CommonJS filesystem alias from its named owner',
    sourcePath: join(localBindingFixtureRoot, 'local-fs-commonjs-consumer.ts'),
    source:
      "const { existingDestinationRead: unused } = require('../migrator/destination-template-source.js'); void unused;",
    expected: 'FileSystem.acquire.readFile',
  },
  {
    label: 'unused ESM helper alias from Discover',
    sourcePath: join(localBindingFixtureRoot, 'local-helper-esm-consumer.ts'),
    source: "import { discoveryMatcher as unused } from '../pipeline/discover/discover-project.stage.js'; void unused;",
    expected: 'GitIgnoreHelper.acquire',
  },
  {
    label: 'unused dynamic helper alias from Discover',
    sourcePath: join(localBindingFixtureRoot, 'local-helper-dynamic-consumer.ts'),
    source:
      "async function load() { const unused = await import('../pipeline/discover/discover-project.stage.js'); return unused; } void load();",
    expected: 'GitIgnoreHelper.acquire',
  },
  {
    label: 'unused CommonJS helper alias from Discover',
    sourcePath: join(localBindingFixtureRoot, 'local-helper-commonjs-consumer.ts'),
    source:
      "const { discoveryMatcher: unused } = require('../pipeline/discover/discover-project.stage.js'); void unused;",
    expected: 'GitIgnoreHelper.acquire',
  },
  {
    label: 'multi-hop helper alias chain',
    sourcePath: join(localBindingFixtureRoot, 'local-helper-chain-consumer.ts'),
    source: "import { chainedMatcher as unused } from './helper-alias-chain.js'; void unused;",
    expected: 'GitIgnoreHelper.acquire',
  },
  {
    label: 'helper alias behind a cyclic barrel graph',
    sourcePath: join(localBindingFixtureRoot, 'local-helper-cycle-consumer.ts'),
    source: "const { cycledMatcher: unused } = require('./helper-cycle-a.js'); void unused;",
    expected: 'GitIgnoreHelper.acquire',
  },
] as const;
const unrelatedBarrelConsumerPath = join(localBindingFixtureRoot, 'unrelated-barrel-consumer.ts');
const typeOnlyBarrelConsumerPath = join(localBindingFixtureRoot, 'type-only-barrel-consumer.ts');
const pureCycleConsumerPath = join(localBindingFixtureRoot, 'pure-cycle-consumer.ts');
const pureCycleAPath = join(localBindingFixtureRoot, 'pure-cycle-a.ts');
const pureCycleBPath = join(localBindingFixtureRoot, 'pure-cycle-b.ts');
const localBindingBarrelOverrides = new Map([
  [
    destinationTemplateSourcePath,
    "import { readFile as destinationRead } from 'node:fs/promises'; export { destinationRead as existingDestinationRead };",
  ],
  [
    discoverStagePath,
    "import { createGitIgnoreMatcher as matcher } from '../../lib/gitignore.helper.js'; export { matcher as discoveryMatcher };",
  ],
  [
    helperAliasChainPath,
    "import { discoveryMatcher as localMatcher } from '../pipeline/discover/discover-project.stage.js'; export { localMatcher as chainedMatcher };",
  ],
  [
    helperCycleAPath,
    "import { loopB } from './helper-cycle-b.js'; import { chainedMatcher as localMatcher } from './helper-alias-chain.js'; export { loopB as loopA }; export { localMatcher as cycledMatcher };",
  ],
  [helperCycleBPath, "import { loopA } from './helper-cycle-a.js'; export { loopA as loopB };"],
  [unrelatedBarrelPath, 'const readFile = (path: string): string => path; export { readFile as localRead };'],
  [
    typeOnlyBarrelPath,
    "import type { FileHandle as LocalHandle } from 'node:fs/promises'; export type { LocalHandle as Handle };",
  ],
  [pureCycleAPath, "import { loopB } from './pure-cycle-b.js'; export { loopB as loopA };"],
  [pureCycleBPath, "import { loopA } from './pure-cycle-a.js'; export { loopA as loopB };"],
  [unrelatedBarrelConsumerPath, "import { localRead as unused } from './unrelated.barrel.js'; void unused;"],
  [typeOnlyBarrelConsumerPath, "import type { Handle } from './type-only.barrel.js'; type Local = Handle;"],
  [pureCycleConsumerPath, "import { loopA as unused } from './pure-cycle-a.js'; void unused;"],
  ...localBindingBarrelCases.map(fixture => [fixture.sourcePath, fixture.source] as const),
]);
const filesystemImportEqualsBarrelPath = join(localBindingFixtureRoot, 'filesystem-import-equals.barrel.ts');
const filesystemLocalBarrelPath = join(localBindingFixtureRoot, 'filesystem-local.barrel.ts');
const filesystemAliasBarrelPath = join(localBindingFixtureRoot, 'filesystem-alias.barrel.ts');
const filesystemNamespaceBarrelPath = join(localBindingFixtureRoot, 'filesystem-namespace.barrel.ts');
const filesystemCallableExportEqualsPath = join(localBindingFixtureRoot, 'filesystem-callable-export-equals.ts');
const filesystemMixedBarrelPath = join(localBindingFixtureRoot, 'filesystem-mixed.barrel.ts');
const filesystemCycleAPath = join(localBindingFixtureRoot, 'filesystem-cycle-a.ts');
const filesystemCycleBPath = join(localBindingFixtureRoot, 'filesystem-cycle-b.ts');
const filesystemBarrelCases = [
  {
    label: 'unused TypeScript import-equals filesystem barrel',
    sourcePath: join(localBindingFixtureRoot, 'filesystem-import-equals-unused.ts'),
    source: "import fs = require('./filesystem-import-equals.barrel.js'); void fs;",
    expected: ['FileSystem.acquire.*'],
  },
  {
    label: 'invoked TypeScript import-equals filesystem barrel',
    sourcePath: join(localBindingFixtureRoot, 'filesystem-import-equals-invoked.ts'),
    source:
      "import fs = require('./filesystem-import-equals.barrel.js'); void fs.readFileSync('/project/card.html', 'utf8');",
    expected: ['FileSystem.acquire.*', 'FileSystem.readFileSync'],
  },
  {
    label: 'ESM local import-then-export alias',
    sourcePath: join(localBindingFixtureRoot, 'filesystem-local-esm.ts'),
    source: "import { bytes } from './filesystem-local.barrel.js'; void bytes('/project/card.html', 'utf8');",
    expected: ['FileSystem.acquire.readFileSync', 'FileSystem.readFileSync'],
  },
  {
    label: 'dynamic multi-hop local import-then-export alias',
    sourcePath: join(localBindingFixtureRoot, 'filesystem-local-dynamic.ts'),
    source:
      "async function run() { const fs = await import('./filesystem-alias.barrel.js'); return fs.deepBytes('/project/card.html', 'utf8'); } void run();",
    expected: ['FileSystem.acquire.readFileSync', 'FileSystem.readFileSync'],
  },
  {
    label: 'ESM local namespace import-then-export alias',
    sourcePath: join(localBindingFixtureRoot, 'filesystem-local-namespace.ts'),
    source:
      "import { fileSystem } from './filesystem-namespace.barrel.js'; void fileSystem.readFileSync('/project/card.html', 'utf8');",
    expected: ['FileSystem.acquire.*', 'FileSystem.readFileSync'],
  },
  {
    label: 'TypeScript import-equals local callable export assignment',
    sourcePath: join(localBindingFixtureRoot, 'filesystem-local-callable.ts'),
    source: "import load = require('./filesystem-callable-export-equals.js'); void load('/project/card.html', 'utf8');",
    expected: ['FileSystem.acquire.readFileSync', 'FileSystem.readFileSync'],
  },
  {
    label: 'CommonJS cyclic local import-then-export alias',
    sourcePath: join(localBindingFixtureRoot, 'filesystem-local-commonjs.ts'),
    source:
      "const { cycledBytes: bytes } = require('./filesystem-cycle-a.js'); void bytes('/project/card.html', 'utf8');",
    expected: ['FileSystem.acquire.readFileSync', 'FileSystem.readFileSync'],
  },
  {
    label: 'mixed allowed and forbidden named bindings through a local barrel',
    sourcePath: join(localBindingFixtureRoot, 'filesystem-local-mixed.ts'),
    source:
      "import { topology, forbiddenBytes } from './filesystem-mixed.barrel.js'; void topology; void forbiddenBytes;",
    expected: ['FileSystem.acquire.stat', 'FileSystem.acquire.readFileSync'],
  },
  {
    label: 'computed nested CommonJS destructuring through a local namespace barrel',
    sourcePath: join(localBindingFixtureRoot, 'filesystem-local-nested.ts'),
    source:
      "const { fileSystem: { ['readFileSync']: bytes } } = require('./filesystem-namespace.barrel.js'); const load = bytes; void load('/project/card.html', 'utf8');",
    expected: ['FileSystem.acquire.readFileSync', 'FileSystem.readFileSync'],
  },
] as const;
const filesystemBarrelOverrides = new Map([
  [filesystemImportEqualsBarrelPath, "import fs = require('node:fs'); export = fs;"],
  [filesystemLocalBarrelPath, "import { readFileSync as load } from 'node:fs'; export { load as bytes };"],
  [
    filesystemAliasBarrelPath,
    "import { bytes as localBytes } from './filesystem-local.barrel.js'; export { localBytes as deepBytes };",
  ],
  [filesystemNamespaceBarrelPath, "import * as fs from 'node:fs'; export { fs as fileSystem };"],
  [filesystemCallableExportEqualsPath, "import { readFileSync as load } from 'node:fs'; export = load;"],
  [filesystemMixedBarrelPath, "export { stat as topology, readFileSync as forbiddenBytes } from 'node:fs';"],
  [
    filesystemCycleAPath,
    "import { loopB } from './filesystem-cycle-b.js'; import { deepBytes as localBytes } from './filesystem-alias.barrel.js'; export { loopB as loopA }; export { localBytes as cycledBytes };",
  ],
  [filesystemCycleBPath, "import { loopA } from './filesystem-cycle-a.js'; export { loopA as loopB };"],
  ...filesystemBarrelCases.map(fixture => [fixture.sourcePath, fixture.source] as const),
]);
const filesystemNamespaceInnerPath = join(localBindingFixtureRoot, 'filesystem-namespace-inner.ts');
const filesystemNamedNamespaceExportPath = join(localBindingFixtureRoot, 'filesystem-named-namespace-export.ts');
const filesystemMixedStarInnerPath = join(localBindingFixtureRoot, 'filesystem-mixed-star-inner.ts');
const filesystemMixedStarBarrelPath = join(localBindingFixtureRoot, 'filesystem-mixed-star.barrel.ts');
const filesystemMixedStarHopPath = join(localBindingFixtureRoot, 'filesystem-mixed-star-hop.ts');
const filesystemMixedStarCycleAPath = join(localBindingFixtureRoot, 'filesystem-mixed-star-cycle-a.ts');
const filesystemMixedStarCycleBPath = join(localBindingFixtureRoot, 'filesystem-mixed-star-cycle-b.ts');
const filesystemTypeOnlyStarInnerPath = join(localBindingFixtureRoot, 'filesystem-type-only-star-inner.ts');
const filesystemTypeOnlyStarBarrelPath = join(localBindingFixtureRoot, 'filesystem-type-only-star.barrel.ts');
const filesystemUnrelatedStarInnerPath = join(localBindingFixtureRoot, 'filesystem-unrelated-star-inner.ts');
const filesystemUnrelatedStarBarrelPath = join(localBindingFixtureRoot, 'filesystem-unrelated-star.barrel.ts');
const mixedStarAcquisitions = [
  'FileSystem.acquire.readFile',
  'FileSystem.acquire.readdir',
  'FileSystem.acquire.stat',
] as const;
const filesystemNamespaceUnionCases = [
  {
    label: 'named namespace re-export with an aliased byte reader',
    sourcePath: join(localBindingFixtureRoot, 'filesystem-named-namespace-consumer.ts'),
    source: "import { filesystem } from './filesystem-named-namespace-export.js'; void filesystem;",
    expected: ['FileSystem.acquire.readFile'],
  },
  {
    label: 'ESM namespace over mixed direct and export-star bindings',
    sourcePath: join(localBindingFixtureRoot, 'filesystem-mixed-star-esm.ts'),
    source: "import * as filesystem from './filesystem-mixed-star.barrel.js'; void filesystem;",
    expected: mixedStarAcquisitions,
  },
  {
    label: 'dynamic namespace over mixed direct and export-star bindings',
    sourcePath: join(localBindingFixtureRoot, 'filesystem-mixed-star-dynamic.ts'),
    source:
      "async function load() { const filesystem = await import('./filesystem-mixed-star.barrel.js'); return filesystem; } void load();",
    expected: mixedStarAcquisitions,
  },
  {
    label: 'CommonJS namespace over mixed direct and export-star bindings',
    sourcePath: join(localBindingFixtureRoot, 'filesystem-mixed-star-commonjs.ts'),
    source: "const filesystem = require('./filesystem-mixed-star.barrel.js'); void filesystem;",
    expected: mixedStarAcquisitions,
  },
  {
    label: 'TypeScript import-equals namespace over mixed direct and export-star bindings',
    sourcePath: join(localBindingFixtureRoot, 'filesystem-mixed-star-import-equals.ts'),
    source: "import filesystem = require('./filesystem-mixed-star.barrel.js'); void filesystem;",
    expected: mixedStarAcquisitions,
  },
  {
    label: 'unused mixed namespace acquisition inside the approved Discover owner',
    sourcePath: discoverStagePath,
    source:
      "import * as filesystem from '../../__architecture-fixture__/filesystem-mixed-star.barrel.js'; void filesystem;",
    expected: mixedStarAcquisitions,
  },
  {
    label: 'multi-hop mixed namespace behind a terminating cycle',
    sourcePath: join(localBindingFixtureRoot, 'filesystem-mixed-star-cycle-consumer.ts'),
    source: "const filesystem = require('./filesystem-mixed-star-cycle-a.js'); void filesystem;",
    expected: mixedStarAcquisitions,
  },
  {
    label: 'type-only export-star namespace',
    sourcePath: join(localBindingFixtureRoot, 'filesystem-type-only-star-consumer.ts'),
    source: "import * as filesystem from './filesystem-type-only-star.barrel.js'; void filesystem;",
    expected: [],
  },
  {
    label: 'unrelated same-named export-star namespace',
    sourcePath: join(localBindingFixtureRoot, 'filesystem-unrelated-star-consumer.ts'),
    source:
      "import * as filesystem from './filesystem-unrelated-star.barrel.js'; void filesystem.readFile('card.html');",
    expected: [],
  },
] as const;
const filesystemNamespaceUnionOverrides = new Map([
  [filesystemNamespaceInnerPath, "export { readFile as bytes } from 'node:fs/promises';"],
  [filesystemNamedNamespaceExportPath, "export * as filesystem from './filesystem-namespace-inner.js';"],
  [filesystemMixedStarInnerPath, "export { readFile as bytes } from 'node:fs/promises';"],
  [
    filesystemMixedStarBarrelPath,
    "export { readdir, stat } from 'node:fs/promises'; export * from './filesystem-mixed-star-inner.js';",
  ],
  [filesystemMixedStarHopPath, "export * from './filesystem-mixed-star.barrel.js';"],
  [
    filesystemMixedStarCycleAPath,
    "export * from './filesystem-mixed-star-cycle-b.js'; export * from './filesystem-mixed-star-hop.js';",
  ],
  [filesystemMixedStarCycleBPath, "export * from './filesystem-mixed-star-cycle-a.js';"],
  [filesystemTypeOnlyStarInnerPath, "export type { FileHandle as Handle } from 'node:fs/promises';"],
  [filesystemTypeOnlyStarBarrelPath, "export * from './filesystem-type-only-star-inner.js';"],
  [filesystemUnrelatedStarInnerPath, 'const readFile = (path: string): string => path; export { readFile };'],
  [filesystemUnrelatedStarBarrelPath, "export * from './filesystem-unrelated-star-inner.js';"],
  ...filesystemNamespaceUnionCases.map(fixture => [fixture.sourcePath, fixture.source] as const),
]);
const filesystemPluralForbiddenPath = join(localBindingFixtureRoot, 'filesystem-plural-forbidden.ts');
const filesystemPluralMixedPath = join(localBindingFixtureRoot, 'filesystem-plural-mixed.ts');
const filesystemPluralNamespacePath = join(localBindingFixtureRoot, 'filesystem-plural-namespace.ts');
const filesystemPluralUnrelatedInnerPath = join(localBindingFixtureRoot, 'filesystem-plural-unrelated-inner.ts');
const filesystemPluralUnrelatedNamespacePath = join(
  localBindingFixtureRoot,
  'filesystem-plural-unrelated-namespace.ts',
);
const pluralNamespaceAcquisitions = [
  'FileSystem.acquire.readFile',
  'FileSystem.acquire.readdir',
  'FileSystem.acquire.stat',
] as const;
const filesystemPluralProvenanceCases = [
  {
    label: 'CommonJS named-namespace forbidden member',
    sourcePath: join(localBindingFixtureRoot, 'filesystem-plural-commonjs-member.ts'),
    source: "void require('./filesystem-plural-namespace.js').filesystem.forbiddenBytes('/project/card.html', 'utf8');",
    expected: ['FileSystem.acquire.readFile', 'FileSystem.readFile'],
  },
  {
    label: 'CommonJS named-namespace property value',
    sourcePath: join(localBindingFixtureRoot, 'filesystem-plural-commonjs-value.ts'),
    source: "const filesystem = require('./filesystem-plural-namespace.js').filesystem; void filesystem;",
    expected: pluralNamespaceAcquisitions,
  },
  {
    label: 'CommonJS named-namespace destructuring',
    sourcePath: join(localBindingFixtureRoot, 'filesystem-plural-commonjs-destructured.ts'),
    source: "const { filesystem } = require('./filesystem-plural-namespace.js'); void filesystem;",
    expected: pluralNamespaceAcquisitions,
  },
  {
    label: 'CommonJS nested forbidden-member destructuring',
    sourcePath: join(localBindingFixtureRoot, 'filesystem-plural-commonjs-nested.ts'),
    source:
      "const { filesystem: { forbiddenBytes } } = require('./filesystem-plural-namespace.js'); void forbiddenBytes('/project/card.html', 'utf8');",
    expected: ['FileSystem.acquire.readFile', 'FileSystem.readFile'],
  },
  {
    label: 'dynamic-import named-namespace forbidden member',
    sourcePath: join(localBindingFixtureRoot, 'filesystem-plural-dynamic-member.ts'),
    source:
      "async function load() { return (await import('./filesystem-plural-namespace.js')).filesystem.forbiddenBytes('/project/card.html', 'utf8'); } void load();",
    expected: ['FileSystem.acquire.readFile', 'FileSystem.readFile'],
  },
  {
    label: 'dynamic-import named-namespace property value',
    sourcePath: join(localBindingFixtureRoot, 'filesystem-plural-dynamic-value.ts'),
    source:
      "async function load() { const filesystem = (await import('./filesystem-plural-namespace.js')).filesystem; return filesystem; } void load();",
    expected: pluralNamespaceAcquisitions,
  },
  {
    label: 'dynamic-import named-namespace destructuring',
    sourcePath: join(localBindingFixtureRoot, 'filesystem-plural-dynamic-destructured.ts'),
    source:
      "async function load() { const { filesystem } = await import('./filesystem-plural-namespace.js'); return filesystem; } void load();",
    expected: pluralNamespaceAcquisitions,
  },
  {
    label: 'dynamic-import nested forbidden-member destructuring',
    sourcePath: join(localBindingFixtureRoot, 'filesystem-plural-dynamic-nested.ts'),
    source:
      "async function load() { const { filesystem: { forbiddenBytes } } = await import('./filesystem-plural-namespace.js'); return forbiddenBytes('/project/card.html', 'utf8'); } void load();",
    expected: ['FileSystem.acquire.readFile', 'FileSystem.readFile'],
  },
  {
    label: 'unused named-namespace value inside the approved Discover owner',
    sourcePath: discoverStagePath,
    source:
      "const filesystem = require('../../__architecture-fixture__/filesystem-plural-namespace.js').filesystem; void filesystem;",
    expected: pluralNamespaceAcquisitions,
  },
  {
    label: 'type-only named-namespace import',
    sourcePath: join(localBindingFixtureRoot, 'filesystem-plural-type-only.ts'),
    source:
      "import type { filesystem } from './filesystem-plural-namespace.js'; type Shape = typeof filesystem; declare const value: Shape | undefined; void value;",
    expected: [],
  },
  {
    label: 'unrelated same-named CommonJS namespace value',
    sourcePath: join(localBindingFixtureRoot, 'filesystem-plural-unrelated.ts'),
    source:
      "const filesystem = require('./filesystem-plural-unrelated-namespace.js').filesystem; void filesystem.readFile('/project/card.html');",
    expected: [],
  },
] as const;
const filesystemPluralProvenanceOverrides = new Map([
  [filesystemPluralForbiddenPath, "export { readFile as forbiddenBytes } from 'node:fs/promises';"],
  [
    filesystemPluralMixedPath,
    "export { readdir, stat } from 'node:fs/promises'; export * from './filesystem-plural-forbidden.js';",
  ],
  [filesystemPluralNamespacePath, "export * as filesystem from './filesystem-plural-mixed.js';"],
  [
    filesystemPluralUnrelatedInnerPath,
    'export const readFile = (path: string): string => path; export const readdir = readFile; export const stat = readFile;',
  ],
  [filesystemPluralUnrelatedNamespacePath, "export * as filesystem from './filesystem-plural-unrelated-inner.js';"],
  ...filesystemPluralProvenanceCases.map(fixture => [fixture.sourcePath, fixture.source] as const),
]);
const expectedRendererRelativePaths = [
  'adapter/css/flex/flex-align.css-renderer.ts',
  'adapter/css/flex/flex-fill.css-renderer.ts',
  'adapter/css/flex/flex-item.css-renderer.ts',
  'adapter/css/flex/flex-offset.css-renderer.ts',
  'adapter/css/flex/flex-order.css-renderer.ts',
  'adapter/css/flex/layout-align.css-renderer.ts',
  'adapter/css/flex/layout-gap.css-renderer.ts',
  'adapter/css/flex/layout.css-renderer.ts',
  'adapter/tailwind/grid/tailwind-grid.renderer.ts',
  'image/picture.renderer.ts',
  'render/conversion-renderer.ts',
  'render/css/css.renderer.ts',
  'render/tailwind/extended-responsive.renderer.ts',
  'render/tailwind/tailwind.renderer.ts',
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
  cachedProductionSemanticAuthorities ??= productionInspection.inspectSemanticAuthorityCalls();
  return cachedProductionSemanticAuthorities;
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

function gitIgnoreBarrelAuthorities(): ReturnType<typeof inspectSemanticAuthorityCalls> {
  cachedGitIgnoreBarrelAuthorities ??= inspectSemanticAuthorityCalls(
    [gitIgnoreBarrelPath, ...gitIgnoreBarrelCases.map(fixture => fixture.sourcePath)],
    gitIgnoreBarrelOverrides,
  );
  return cachedGitIgnoreBarrelAuthorities;
}

function localBindingBarrelAuthorities(): ReturnType<typeof inspectSemanticAuthorityCalls> {
  cachedLocalBindingBarrelAuthorities ??= inspectSemanticAuthorityCalls(
    [
      ...localBindingBarrelCases.map(fixture => fixture.sourcePath),
      unrelatedBarrelConsumerPath,
      typeOnlyBarrelConsumerPath,
      pureCycleConsumerPath,
    ],
    localBindingBarrelOverrides,
  );
  return cachedLocalBindingBarrelAuthorities;
}

function filesystemBarrelAuthorities(): ReturnType<typeof inspectSemanticAuthorityCalls> {
  cachedFilesystemBarrelAuthorities ??= inspectSemanticAuthorityCalls(
    filesystemBarrelCases.map(fixture => fixture.sourcePath),
    filesystemBarrelOverrides,
  );
  return cachedFilesystemBarrelAuthorities;
}

function filesystemNamespaceUnionAuthorities(): ReturnType<typeof inspectSemanticAuthorityCalls> {
  cachedFilesystemNamespaceUnionAuthorities ??= inspectSemanticAuthorityCalls(
    filesystemNamespaceUnionCases.map(fixture => fixture.sourcePath),
    filesystemNamespaceUnionOverrides,
  );
  return cachedFilesystemNamespaceUnionAuthorities;
}

function filesystemPluralProvenanceAuthorities(): ReturnType<typeof inspectSemanticAuthorityCalls> {
  cachedFilesystemPluralProvenanceAuthorities ??= inspectSemanticAuthorityCalls(
    filesystemPluralProvenanceCases.map(fixture => fixture.sourcePath),
    filesystemPluralProvenanceOverrides,
  );
  return cachedFilesystemPluralProvenanceAuthorities;
}

describe('enterprise pipeline dependency boundary', { timeout: wholeProjectInspectionTimeout }, () => {
  test('keeps the exhaustive whole-production authority graph exact', () => {
    expect(normalizedAuthoritySources(productionSemanticAuthorities(), productionGraphAuthorities)).toEqual(
      expectedProductionAuthorityGraph,
    );
  });

  test('keeps responsive-family runtime exports owned only by the target-neutral semantic module', () => {
    const owners = [
      ...new Set(
        [
          ...productionInspection.inspectRuntimeNamedDeclarationProvenance('ResponsiveFamilyPlanner'),
          ...productionInspection
            .inspectRuntimeExportSymbolProvenance()
            .filter(symbol => symbol.exportedName === 'ResponsiveFamilyPlanner'),
        ].map(symbol => relative(productionRoot, symbol.declarationPath).replaceAll('\\', '/')),
      ),
    ].sort();

    expect(owners).toEqual(['semantic/responsive-family.planner.ts']);
  });

  test('detects a second adapter declaration of the canonical responsive-family owner', () => {
    const adapterOwnerPath = join(productionRoot, '__architecture-fixture__', 'adapter-responsive-owner.ts');
    const hiddenOwnerPath = join(productionRoot, '__architecture-fixture__', 'hidden-adapter-responsive-owner.ts');
    const barrelPath = join(productionRoot, '__architecture-fixture__', 'responsive-owner-barrel.ts');
    const overrides = new Map([
      [adapterOwnerPath, 'export class ResponsiveFamilyPlanner {}'],
      [hiddenOwnerPath, 'class ResponsiveFamilyPlanner {} void ResponsiveFamilyPlanner;'],
      [
        barrelPath,
        "export { ResponsiveFamilyPlanner as SharedResponsiveFamilyPlanner } from './adapter-responsive-owner.js';",
      ],
    ]);
    const inspection = createTypeScriptProjectInspectionSession(
      [adapterOwnerPath, hiddenOwnerPath, barrelPath],
      overrides,
    );
    const owners = [
      ...new Set(
        inspection
          .inspectRuntimeNamedDeclarationProvenance('ResponsiveFamilyPlanner')
          .map(symbol => symbol.declarationPath),
      ),
    ];

    expect(owners).toEqual([adapterOwnerPath, hiddenOwnerPath]);
  });

  test('retains an exported owner name while resolving a differently named adapter implementation', () => {
    const adapterImplementationPath = join(
      productionRoot,
      '__architecture-fixture__',
      'adapter-responsive-implementation.ts',
    );
    const barrelPath = join(productionRoot, '__architecture-fixture__', 'responsive-owner-alias.ts');
    const inspection = createTypeScriptProjectInspectionSession(
      [barrelPath],
      new Map([
        [adapterImplementationPath, 'export class AdapterResponsiveImplementation {}'],
        [
          barrelPath,
          "export { AdapterResponsiveImplementation as ResponsiveFamilyPlanner } from './adapter-responsive-implementation.js';",
        ],
      ]),
    );

    expect(inspection.inspectRuntimeExportSymbolProvenance()).toContainEqual({
      sourcePath: barrelPath,
      exportedName: 'ResponsiveFamilyPlanner',
      symbolName: 'AdapterResponsiveImplementation',
      declarationPath: adapterImplementationPath,
    });
    expect(inspection.programConstructionCount).toBe(1);
  });

  test('keeps the deprecated ConversionAdapter type free of semantic orchestration hooks', () => {
    const inspection = inspectTypeScript(readFileSync(conversionAdapterPath, 'utf8'), conversionAdapterPath);

    expect(
      inspection.declaredMethodNames.filter(name =>
        ['planElement', 'closePlanDependencies', 'acceptPlans'].includes(name),
      ),
    ).toEqual([]);
  });

  test('does not treat a type-only responsive compatibility alias as runtime ownership', () => {
    const aliasPath = join(productionRoot, '__architecture-fixture__', 'responsive-type-only.alias.ts');
    const findings = inspectRuntimeExportSymbolProvenance(
      [aliasPath],
      new Map([
        [
          aliasPath,
          "export type { ResponsiveFamilyPlanner as SharedResponsiveFamilyPlanner } from '../semantic/responsive-family.planner.js';",
        ],
      ]),
    );

    expect(findings.filter(symbol => symbol.symbolName === 'ResponsiveFamilyPlanner')).toEqual([]);
  });

  test('resolves runtime responsive aliases and barrels to the one semantic declaration', () => {
    const barrelPath = join(productionRoot, '__architecture-fixture__', 'responsive-runtime-barrel.ts');
    const aliasPath = join(productionRoot, '__architecture-fixture__', 'responsive-runtime-alias.ts');
    const unrelatedPath = join(productionRoot, '__architecture-fixture__', 'unrelated-responsive-owner.ts');
    const findings = inspectRuntimeExportSymbolProvenance(
      [barrelPath, aliasPath, unrelatedPath],
      new Map([
        [barrelPath, "export * from '../semantic/responsive-family.planner.js';"],
        [
          aliasPath,
          "export { ResponsiveFamilyPlanner as SharedResponsiveFamilyPlanner } from './responsive-runtime-barrel.js';",
        ],
        [unrelatedPath, 'export class ResponsiveFamilyPlannerCompatibility {}'],
      ]),
    );

    expect([
      ...new Set(
        findings
          .filter(symbol => symbol.symbolName === 'ResponsiveFamilyPlanner')
          .map(symbol => symbol.declarationPath),
      ),
    ]).toEqual([join(semanticRoot, 'responsive-family.planner.ts')]);
  });

  test('keeps semantic production modules independent from targets and side-effect layers', () => {
    const forbiddenLocalDependencies = semanticInspection
      .inspectDependencyClosure()
      .filter(finding =>
        [
          join(productionRoot, 'adapter'),
          join(productionRoot, 'render'),
          join(productionRoot, 'edit'),
          join(productionRoot, 'report'),
          join(productionRoot, 'transaction'),
        ].some(namespace => finding.dependencyPath === namespace || finding.dependencyPath.startsWith(`${namespace}/`)),
      );
    const filesystemImports = semanticPaths.flatMap(path =>
      runtimeModuleReferences(readFileSync(path, 'utf8'), path).filter(reference =>
        /^(?:node:)?fs(?:\/|$)/u.test(reference),
      ),
    );

    expect(forbiddenLocalDependencies).toEqual([]);
    expect(filesystemImports).toEqual([]);
  });

  test('includes type-only and barrel edges in the semantic dependency boundary', () => {
    const typeOnlyPath = join(productionRoot, '__architecture-fixture__', 'semantic-type-only.ts');
    const barrelPath = join(productionRoot, '__architecture-fixture__', 'semantic-type-barrel.ts');
    const overrides = new Map([
      [typeOnlyPath, "import type { PlannedConversion } from './semantic-type-barrel.js'; void 0;"],
      [barrelPath, "export type { PlannedConversion } from '../adapter/conversion-adapter.js';"],
    ]);
    const inspection = createTypeScriptProjectInspectionSession([typeOnlyPath], overrides);
    const findings = inspection.inspectDependencyClosure();

    expect(findings.map(finding => finding.dependencyPath)).toContain(
      join(productionRoot, 'adapter', 'conversion-adapter.ts'),
    );
    expect(inspection.inspectRuntimeDependencyClosure()).toEqual([]);
    expect(inspection.programConstructionCount).toBe(1);
  });

  test('keeps target execution calls outside target-neutral semantic modules', () => {
    const targetAuthorities = new Set([
      'ConversionRenderer.eligibility',
      'ConversionRenderer.render',
      'ConversionRenderer.resolveConflicts',
      'ConversionRenderer.record',
    ]);

    expect(normalizedAuthoritySources(semanticInspection.inspectSemanticAuthorityCalls(), targetAuthorities)).toEqual(
      [],
    );
    expect(
      new Set(
        inspectSemanticAuthorityCalls([semanticRenderCoordinatorPath])
          .filter(call => targetAuthorities.has(call.name))
          .map(call => call.name),
      ),
    ).toEqual(targetAuthorities);
  });

  test('does not classify lookalike renderer methods as target execution authority', () => {
    const source = `
      interface ReportRenderer {
        eligibility(input: unknown): void;
        render(input: unknown): void;
        resolveConflicts(input: unknown): void;
        record(input: unknown): void;
      }
      declare const renderer: ReportRenderer;
      renderer.eligibility(undefined);
      renderer.render(undefined);
      renderer.resolveConflicts(undefined);
      renderer.record(undefined);
    `;

    expect(fixtureSemanticAuthorities(source).filter(name => name.startsWith('ConversionRenderer.'))).toEqual([]);
  });

  test('constructs one immutable TypeScript Program per shared architecture scenario', () => {
    semanticInspection.inspectDependencyClosure();
    semanticInspection.inspectSemanticAuthorityCalls();
    productionInspection.inspectRuntimeExportSymbolProvenance();
    productionInspection.inspectSemanticAuthorityCalls();

    expect(semanticInspection.programConstructionCount).toBe(1);
    expect(productionInspection.programConstructionCount).toBe(1);

    const isolated = createTypeScriptProjectInspectionSession([semanticRenderCoordinatorPath]);
    expect(isolated.programConstructionCount).toBe(0);
    isolated.inspectSemanticAuthorityCalls();
    isolated.inspectRuntimeSymbolProvenance();
    expect(isolated.programConstructionCount).toBe(1);

    const isolatedPath = join(productionRoot, '__architecture-fixture__', 'isolated-program.ts');
    const mutableOverrides = new Map([[isolatedPath, 'export class OriginalOwner {}']]);
    const snapshotted = createTypeScriptProjectInspectionSession([isolatedPath], mutableOverrides);
    mutableOverrides.set(isolatedPath, 'export class MutatedOwner {}');
    expect(snapshotted.inspectRuntimeNamedDeclarationProvenance('OriginalOwner')).toHaveLength(1);
    expect(snapshotted.inspectRuntimeNamedDeclarationProvenance('MutatedOwner')).toEqual([]);
    expect(snapshotted.programConstructionCount).toBe(1);
  });

  test('makes RenderProjectStage the sole caller of RenderSession finalization', () => {
    expect(normalizedAuthoritySources(productionSemanticAuthorities(), new Set(['RenderSession.finalize']))).toEqual([
      { source: 'pipeline/render/render-project.stage.ts', authority: 'RenderSession.finalize' },
    ]);
  });

  test.each([
    ['TailwindRenderSession', 'TailwindRenderSession'],
    ['CssRenderSession', 'CssRenderSession'],
    ['aliased TailwindRenderSession', 'TailwindRenderSession as ConcreteSession'],
  ])('recognizes direct %s finalization as canonical RenderSession authority', (_label, importBinding) => {
    const constructedName = importBinding.includes(' as ') ? 'ConcreteSession' : importBinding;
    expect(
      fixtureSemanticAuthorities(
        `import { ${importBinding} } from '../render/render-session.js'; new ${constructedName}().finalize();`,
      ),
    ).toContain('RenderSession.finalize');
  });

  test.each([
    {
      label: 'test-double interface',
      source:
        'interface RenderSessionDouble { finalize(): void } declare const session: RenderSessionDouble; session.finalize();',
    },
    {
      label: 'compatibility-shaped alias',
      source:
        'type CompatibilitySession = { finalize(): void }; declare const session: CompatibilitySession; session.finalize();',
    },
    {
      label: 'unrelated class method',
      source: 'class ReportBuilder { finalize(): void {} } new ReportBuilder().finalize();',
    },
    {
      label: 'type-only session import',
      source: "import type { RenderSession } from '../render/render-session.js'; type Session = RenderSession; void 0;",
    },
  ])('does not classify a $label as RenderSession finalization authority', ({ source }) => {
    expect(fixtureSemanticAuthorities(source).filter(name => name === 'RenderSession.finalize')).toEqual([]);
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
      'FileSystem.stat',
    ],
    [
      'namespace readdir through Function.apply',
      "import * as fs from 'node:fs/promises'; void fs.readdir.apply(fs, ['input']);",
      'FileSystem.readdir',
    ],
    [
      'dynamic-import stat through a local alias',
      "async function run() { const { stat: inspect } = await import('node:fs/promises'); await inspect('input'); }",
      'FileSystem.stat',
    ],
    [
      'CommonJS readdir through a computed member',
      "const fs = require('node:fs/promises'); void fs['readdir'].call(fs, 'input');",
      'FileSystem.readdir',
    ],
  ])('detects direct topology bypass via %s', (_label, source, expected) => {
    expect(fixtureSemanticAuthorities(source)).toContain(expected);
  });

  test.each([
    [
      'adapter original-template read alias',
      "import { readFile as readOriginal } from 'node:fs/promises'; void readOriginal.call(undefined, 'card.html', 'utf8');",
      'FileSystem.readFile',
    ],
    [
      'continuation dynamic namespace read',
      "async function run() { const fs = await import('node:fs/promises'); await Reflect.apply(fs.readFile, fs, ['card.html', 'utf8']); }",
      'FileSystem.readFile',
    ],
  ])('detects a direct readFile bypass via %s', (_label, source, expected) => {
    expect(fixtureSemanticAuthorities(source)).toContain(expected);
  });

  test.each([
    [
      'synchronous whole-file alias',
      "import { readFileSync as load } from 'node:fs'; void load('/project/card.html', 'utf8');",
      ['FileSystem.readFileSync'],
    ],
    [
      'node:fs promises namespace',
      "import * as fs from 'node:fs'; void fs.promises.readFile('/project/card.html', 'utf8');",
      ['FileSystem.readFile'],
    ],
    [
      'fs-extra JSON reader',
      "import fs from 'fs-extra'; void fs.readJson('/project/card.html');",
      ['FileSystem.readJson'],
    ],
    [
      'fs-extra synchronous JSON alias',
      "const fs = require('fs-extra'); void fs['readJSONSync']('/project/card.html');",
      ['FileSystem.readJSONSync'],
    ],
    [
      'descriptor read after open',
      "import { open } from 'node:fs/promises'; async function run() { const file = await open('/project/card.html', 'r'); await file.read(); } void run();",
      ['FileSystem.open', 'FileSystem.read'],
    ],
    [
      'FileHandle whole-file read',
      "import type { FileHandle } from 'node:fs/promises'; declare const file: FileHandle; void file.readFile('utf8');",
      ['FileSystem.readFile'],
    ],
    [
      'FileHandle vectored read',
      "import type { FileHandle } from 'node:fs/promises'; declare const file: FileHandle; void file.readv([]);",
      ['FileSystem.readv'],
    ],
    [
      'FileHandle line iterator',
      "import type { FileHandle } from 'node:fs/promises'; declare const file: FileHandle; void file.readLines();",
      ['FileSystem.readLines'],
    ],
    [
      'FileHandle web stream',
      "import type { FileHandle } from 'node:fs/promises'; declare const file: FileHandle; void file.readableWebStream();",
      ['FileSystem.readableWebStream'],
    ],
    [
      'read stream factory',
      "import { createReadStream } from 'node:fs'; void createReadStream('/project/card.html');",
      ['FileSystem.createReadStream'],
    ],
    [
      'read stream constructor',
      "import { ReadStream as Reader } from 'node:fs'; void new Reader('/project/card.html');",
      ['FileSystem.ReadStream'],
    ],
    [
      'file-backed Blob',
      "import { openAsBlob } from 'node:fs'; void openAsBlob('/project/card.html');",
      ['FileSystem.openAsBlob'],
    ],
    [
      'synchronous directory enumeration',
      "import * as fs from 'node:fs'; void fs.readdirSync('/project');",
      ['FileSystem.readdirSync'],
    ],
    [
      'directory handle acquisition',
      "import { opendir } from 'node:fs/promises'; void opendir('/project');",
      ['FileSystem.opendir'],
    ],
    [
      'directory handle construction',
      "import { Dir } from 'node:fs'; void new Dir(1, '/project', {});",
      ['FileSystem.Dir'],
    ],
    [
      'filesystem glob discovery',
      "import fs from 'fs-extra'; void fs.globSync('/project/**/*.html');",
      ['FileSystem.globSync'],
    ],
    [
      'symlink-preserving metadata',
      "import { lstat as inspect } from 'node:fs/promises'; void Reflect.apply(inspect, undefined, ['/project/card.html']);",
      ['FileSystem.lstat'],
    ],
    [
      'canonical path topology',
      "const fs = require('node:fs'); void fs.realpathSync('/project/card.html');",
      ['FileSystem.realpathSync'],
    ],
  ])('detects concrete topology or byte-read authority through %s', (_label, source, expected) => {
    expect(fixtureSemanticAuthorities(source)).toEqual(expect.arrayContaining(expected));
  });

  test.each([
    [
      'mixed node:fs/promises named bindings',
      "import { readFile, readdir, stat } from 'node:fs/promises'; void readFile; void readdir; void stat;",
      ['FileSystem.acquire.readFile', 'FileSystem.acquire.readdir', 'FileSystem.acquire.stat'],
    ],
    [
      'unused synchronous binding beside allowed node:fs bindings',
      "import { readFileSync, readdirSync, statSync } from 'node:fs'; void readdirSync; void statSync;",
      ['FileSystem.acquire.readFileSync', 'FileSystem.acquire.readdirSync', 'FileSystem.acquire.statSync'],
    ],
    [
      'fs-extra named bindings',
      "import { pathExists, readJsonSync } from 'fs-extra'; void pathExists; void readJsonSync;",
      ['FileSystem.acquire.pathExists', 'FileSystem.acquire.readJsonSync'],
    ],
    ['node:fs namespace binding', "import * as fs from 'node:fs'; void fs;", ['FileSystem.acquire.*']],
    ['fs-extra default binding', "import fs from 'fs-extra'; void fs;", ['FileSystem.acquire.*']],
    ['node:fs import-equals binding', "import fs = require('node:fs'); void fs;", ['FileSystem.acquire.*']],
    [
      'dynamic nested destructuring and local invocation alias',
      "async function run() { const { promises: { ['readFile']: bytes } } = await import('node:fs'); const load = bytes; return load('/project/card.html', 'utf8'); } void run();",
      ['FileSystem.acquire.readFile', 'FileSystem.readFile'],
    ],
    [
      'CommonJS nested destructuring and local invocation alias',
      "const { promises: { readFile: bytes } } = require('node:fs'); const load = bytes; void Reflect.apply(load, undefined, ['/project/card.html', 'utf8']);",
      ['FileSystem.acquire.readFile', 'FileSystem.readFile'],
    ],
    [
      'computed CommonJS namespace member',
      "const fs = require('node:fs/promises'); void fs['readFile']('/project/card.html', 'utf8');",
      ['FileSystem.acquire.*', 'FileSystem.readFile'],
    ],
  ])('preserves concrete filesystem acquisition identity for %s', (_label, source, expected) => {
    expect(fixtureSemanticAuthorities(source)).toEqual(expect.arrayContaining(expected));
  });

  test('changes Discover owner evidence for a forbidden binding in its allowed import declaration', () => {
    const source = readFileSync(discoverStagePath, 'utf8').replace(
      "import { readdir, stat } from 'node:fs/promises';",
      "import { readFile, readdir, stat } from 'node:fs/promises';",
    );
    const acquisitions = inspectSemanticAuthorityCalls([discoverStagePath], new Map([[discoverStagePath, source]]))
      .map(call => call.name)
      .filter(name => name.startsWith('FileSystem.acquire.'));

    expect(acquisitions).toEqual([
      'FileSystem.acquire.readFile',
      'FileSystem.acquire.readdir',
      'FileSystem.acquire.stat',
    ]);
  });

  test('changes Discover owner evidence for an unused synchronous byte-read binding', () => {
    const source = `
      import { readFileSync, readdirSync, statSync } from 'node:fs';
      void readdirSync;
      void statSync;
    `;
    const acquisitions = inspectSemanticAuthorityCalls([discoverStagePath], new Map([[discoverStagePath, source]]))
      .map(call => call.name)
      .filter(name => name.startsWith('FileSystem.acquire.'));

    expect(acquisitions).toEqual([
      'FileSystem.acquire.readFileSync',
      'FileSystem.acquire.readdirSync',
      'FileSystem.acquire.statSync',
    ]);
  });

  test.each(filesystemBarrelCases)('detects $label acquisition and invocation provenance', fixture => {
    expect(
      filesystemBarrelAuthorities()
        .filter(call => call.sourcePath === fixture.sourcePath)
        .map(call => call.name),
    ).toEqual(expect.arrayContaining([...fixture.expected]));
  });

  test.each(filesystemNamespaceUnionCases)('unions exact filesystem acquisitions for $label', fixture => {
    const acquisitions = filesystemNamespaceUnionAuthorities()
      .filter(call => call.sourcePath === fixture.sourcePath && call.name.startsWith('FileSystem.acquire.'))
      .map(call => call.name)
      .sort();

    expect(acquisitions).toEqual([...fixture.expected].sort());
  });

  test.each(filesystemPluralProvenanceCases)('retains exact plural filesystem provenance for $label', fixture => {
    const filesystemAuthorities = filesystemPluralProvenanceAuthorities()
      .filter(call => call.sourcePath === fixture.sourcePath && call.name.startsWith('FileSystem.'))
      .map(call => call.name)
      .sort();

    expect(filesystemAuthorities).toEqual([...fixture.expected].sort());
  });

  test.each([
    {
      label: 'Analyze',
      sourcePath: analyzeStagePath,
      source: "import { readFileSync } from 'node:fs'; void readFileSync('/project/card.html', 'utf8');",
      expected: 'FileSystem.readFileSync',
    },
    {
      label: 'destination reader',
      sourcePath: destinationTemplateSourcePath,
      source:
        "import { open } from 'node:fs/promises'; async function read() { const file = await open('/project/card.html', 'r'); return file.read(); } void read();",
      expected: 'FileSystem.read',
    },
    {
      label: 'stylesheet planner',
      sourcePath: stylesheetPlannerPath,
      source: "import fs from 'fs-extra'; void fs.readJsonSync('/project/styles.css');",
      expected: 'FileSystem.readJsonSync',
    },
    {
      label: 'Discover',
      sourcePath: discoverStagePath,
      source: "import * as fs from 'node:fs'; void fs.opendirSync('/project');",
      expected: 'FileSystem.opendirSync',
    },
  ])('does not let an additional concrete read disappear inside the named $label owner', fixture => {
    expect(
      inspectSemanticAuthorityCalls([fixture.sourcePath], new Map([[fixture.sourcePath, fixture.source]])).map(
        call => call.name,
      ),
    ).toContain(fixture.expected);
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

  test.each(gitIgnoreBarrelCases)('detects createGitIgnoreMatcher through $label', fixture => {
    expect(
      gitIgnoreBarrelAuthorities()
        .filter(call => call.sourcePath === fixture.sourcePath)
        .map(call => call.name)
        .filter(name => name.startsWith('GitIgnoreHelper.')),
    ).toEqual(fixture.expected);
  });

  test.each(localBindingBarrelCases)(
    'detects $expected through $label and a local import-then-export binding',
    fixture => {
      expect(
        localBindingBarrelAuthorities()
          .filter(call => call.sourcePath === fixture.sourcePath)
          .map(call => call.name),
      ).toContain(fixture.expected);
    },
  );

  test.each([unrelatedBarrelConsumerPath, typeOnlyBarrelConsumerPath, pureCycleConsumerPath])(
    'terminates without a resource finding for unrelated, type-only, or cyclic local exports: %s',
    sourcePath => {
      expect(
        localBindingBarrelAuthorities()
          .filter(call => call.sourcePath === sourcePath)
          .map(call => call.name)
          .filter(name => resourceAuthorityNames.has(name)),
      ).toEqual([]);
    },
  );

  test.each([
    ["import { readFile as unused } from 'node:fs/promises'; void unused;", 'FileSystem.acquire.readFile'],
    ["import * as unused from 'node:fs'; void unused;", 'FileSystem.acquire.*'],
    [
      "async function load() { const unused = await import('node:fs/promises'); return unused; } void load();",
      'FileSystem.acquire.*',
    ],
    ["const unused = require('fs-extra'); void unused;", 'FileSystem.acquire.*'],
  ])('detects an unused filesystem acquisition outside a named owner: %s', (source, expected) => {
    expect(fixtureSemanticAuthorities(source)).toContain(expected);
  });

  test('keeps a type-only filesystem binding out of mixed runtime acquisition evidence', () => {
    const source = "import { stat, type readFile } from 'node:fs/promises'; void stat; type Read = typeof readFile;";

    expect(fixtureSemanticAuthorities(source).filter(name => name.startsWith('FileSystem.acquire.'))).toEqual([
      'FileSystem.acquire.stat',
    ]);
  });

  test('rejects even one extra direct filesystem read and acquisition in Migrator', () => {
    const source = `
      import { readFile as forbiddenOriginalRead } from 'node:fs/promises';
      ${readFileSync(migratorPath, 'utf8')}
      void forbiddenOriginalRead('input.html', 'utf8');
    `;
    const calls = inspectSemanticAuthorityCalls(productionPaths, new Map([[migratorPath, source]])).filter(
      call =>
        call.sourcePath === migratorPath &&
        (call.name === 'FileSystem.readFile' || call.name === 'FileSystem.acquire.readFile'),
    );

    expect(calls).toEqual([
      { sourcePath: migratorPath, name: 'FileSystem.acquire.readFile' },
      { sourcePath: migratorPath, name: 'FileSystem.readFile' },
    ]);
  });

  test.each([
    'interface Cache { stat(path: string): void } declare const cache: Cache; cache.stat("entry");',
    'function readdir(path: string): string[] { return [path]; } void readdir("entry");',
    'const readFile = (path: string): string => path; void readFile("entry");',
    'const ignore = (): { accepts(path: string): boolean } => ({ accepts: () => true }); void ignore();',
    'async function run() { const module = await import("../logger.js"); module.logger.debug("readFile stat ignore"); }',
    "import type { FileHandle } from 'node:fs/promises'; declare const file: FileHandle; void file;",
    "import type { createGitIgnoreMatcher } from '../lib/gitignore.helper.js'; type MatcherFactory = typeof createGitIgnoreMatcher;",
    'interface Reader { readFileSync(path: string): string } declare const reader: Reader; void reader.readFileSync("entry");',
    'class ReadStream { constructor(path: string) { void path; } } void new ReadStream("entry");',
    'const fs = { readJson(path: string): string { return path; } }; void fs.readJson("entry");',
  ])('does not confuse an unrelated or non-filesystem read-only callable with resource authority: %s', source => {
    expect(fixtureSemanticAuthorities(source).filter(name => resourceAuthorityNames.has(name))).toEqual([]);
  });

  test('keeps direct filesystem and ignore authorities at their named production owners', () => {
    expect(normalizedAuthoritySources(productionSemanticAuthorities(), resourceAuthorityNames)).toEqual([
      { source: 'cli/stylesheet-path.validator.ts', authority: 'FileSystem.acquire.lstat' },
      { source: 'cli/stylesheet-path.validator.ts', authority: 'FileSystem.lstat' },
      { source: 'lib/atomic-file.writer.ts', authority: 'FileSystem.acquire.lstat' },
      { source: 'lib/atomic-file.writer.ts', authority: 'FileSystem.acquire.open' },
      { source: 'lib/gitignore.helper.ts', authority: 'FileSystem.acquire.*' },
      { source: 'lib/gitignore.helper.ts', authority: 'FileSystem.pathExists' },
      { source: 'lib/gitignore.helper.ts', authority: 'FileSystem.readFile' },
      { source: 'lib/gitignore.helper.ts', authority: 'IgnoreLibrary.acquire' },
      { source: 'lib/gitignore.helper.ts', authority: 'IgnoreLibrary.createMatcher' },
      { source: 'migrator/destination-template-source.ts', authority: 'FileSystem.acquire.readFile' },
      { source: 'migrator/destination-template-source.ts', authority: 'FileSystem.readFile' },
      { source: 'migrator/migration-path.validator.ts', authority: 'FileSystem.acquire.lstat' },
      { source: 'migrator/migration-path.validator.ts', authority: 'FileSystem.acquire.stat' },
      { source: 'migrator/migration-path.validator.ts', authority: 'FileSystem.lstat' },
      { source: 'migrator/migration-path.validator.ts', authority: 'FileSystem.stat' },
      { source: 'migrator/migrator.ts', authority: 'DestinationTemplateSource.read' },
      { source: 'migrator/stylesheet.planner.ts', authority: 'FileSystem.acquire.lstat' },
      { source: 'migrator/stylesheet.planner.ts', authority: 'FileSystem.acquire.readFile' },
      { source: 'migrator/stylesheet.planner.ts', authority: 'FileSystem.readFile' },
      { source: 'pipeline/analyze/analyze-project.stage.ts', authority: 'FileSystem.acquire.readFile' },
      { source: 'pipeline/analyze/analyze-project.stage.ts', authority: 'FileSystem.readFile' },
      { source: 'pipeline/discover/discover-project.stage.ts', authority: 'FileSystem.acquire.readdir' },
      { source: 'pipeline/discover/discover-project.stage.ts', authority: 'FileSystem.acquire.stat' },
      { source: 'pipeline/discover/discover-project.stage.ts', authority: 'FileSystem.readdir' },
      { source: 'pipeline/discover/discover-project.stage.ts', authority: 'FileSystem.stat' },
      {
        source: 'pipeline/discover/discover-project.stage.ts',
        authority: 'GitIgnoreHelper.acquire',
      },
      { source: 'pipeline/render/compatibility-edit.validator.ts', authority: 'DestinationTemplateSource.read' },
      { source: 'transaction/migration-transaction.ts', authority: 'FileSystem.acquire.access' },
      { source: 'transaction/migration-transaction.ts', authority: 'FileSystem.acquire.lstat' },
      { source: 'transaction/migration-transaction.ts', authority: 'FileSystem.acquire.open' },
      { source: 'transaction/migration-transaction.ts', authority: 'FileSystem.acquire.stat' },
      { source: 'transaction/migration-transaction.ts', authority: 'FileSystem.open' },
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

  test('reserves adapter responsive range ownership for target-specific composition planners', () => {
    const responsiveRangeSymbols = inspectRuntimeSymbolProvenance(adapterPlannerPaths).filter(
      symbol =>
        symbol.declarationPath.endsWith('/breakpoint/breakpoint-catalog.ts') &&
        ['BreakpointCatalog', 'mediaDefinitionsIntersect', 'mediaRangesIntersect'].includes(symbol.symbolName),
    );
    const owners = new Map<string, Set<string>>();
    for (const symbol of responsiveRangeSymbols) {
      const names = owners.get(symbol.sourcePath) ?? new Set<string>();
      names.add(symbol.symbolName);
      owners.set(symbol.sourcePath, names);
    }

    expect(
      [...owners.entries()]
        .filter(
          ([, names]) =>
            names.has('BreakpointCatalog') &&
            (names.has('mediaDefinitionsIntersect') || names.has('mediaRangesIntersect')),
        )
        .map(([sourcePath]) => sourcePath)
        .sort(),
    ).toEqual([...targetResponsiveRangeOwnerPaths].sort());
  });

  test.each([
    [
      'named imports',
      "import { BreakpointCatalog, mediaDefinitionsIntersect } from '../breakpoint/breakpoint-catalog.js';",
    ],
    ['namespace import', "import * as breakpoints from '../breakpoint/breakpoint-catalog.js'; void breakpoints;"],
    [
      're-export alias',
      "export { BreakpointCatalog as Catalog, mediaRangesIntersect as intersects } from '../breakpoint/breakpoint-catalog.js';",
    ],
  ])('detects responsive range ownership through %s', (_label, source) => {
    const symbols = inspectRuntimeSymbolProvenance(
      [legacyResponsiveFamilyPlannerPath],
      new Map([[legacyResponsiveFamilyPlannerPath, source]]),
    );

    expect(symbols.map(symbol => symbol.symbolName)).toEqual(
      expect.arrayContaining(['BreakpointCatalog', expect.stringMatching(/^media.*Intersect$/u)]),
    );
  });

  test('allows type-only responsive range imports as a negative control', () => {
    const symbols = inspectRuntimeSymbolProvenance(
      [legacyResponsiveFamilyPlannerPath],
      new Map([
        [
          legacyResponsiveFamilyPlannerPath,
          "import type { BreakpointCatalog, mediaDefinitionsIntersect } from '../breakpoint/breakpoint-catalog.js';",
        ],
      ]),
    );

    expect(symbols).toEqual([]);
  });

  test('keeps target-neutral responsive behavior owned by the semantic planner suite', () => {
    const semanticCases = [
      'routes ngClass/class and ngStyle/style as two complete extended families',
      'converts a base member and a verified responsive override atomically',
      'converts different utilities in disjoint responsive ranges',
      'converts identical utilities in overlapping responsive ranges',
      'preserves the complete family when overlapping ranges emit different utilities',
      'preserves the complete family when one member is dynamic',
      'groups fxFlex, fxGrow, and fxShrink as one flex-item family',
      'groups fxFlexFill and fxFill as one flex-fill family',
      'retains dynamic-binding diagnostics when responsive context is also unresolved',
      'closes fxShow and fxHide as one visibility family without replanning their semantics',
      'retains intrinsic visibility diagnostics when dynamic closure preserves the family',
    ];
    const semanticSpec = readFileSync(semanticResponsiveFamilyPlannerSpecPath, 'utf8');

    for (const testName of semanticCases) {
      expect(semanticSpec).toContain(testName);
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
      { source: 'migrator/migrator.ts', authority: 'CssReferenceParser.parse' },
      { source: 'pipeline/analyze/analyze-project.stage.ts', authority: 'OriginalTemplateParser.parse' },
      { source: 'pipeline/render/compatibility-edit.validator.ts', authority: 'ChangedTemplateValidation.parse' },
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
