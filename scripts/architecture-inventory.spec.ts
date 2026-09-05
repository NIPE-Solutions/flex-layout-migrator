import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { inventoryProject, main } from './architecture-inventory.mjs';

const syntheticProject = {
  productionFiles: [
    {
      path: 'src/ä-policy.ts',
      source: [
        'export class ResponsiveFamilyPlanner {}',
        'export class ElementSemanticPlanner {}',
        'export class CssArtifactRegistry {}',
        "export type { DiagnosticCode } from './Z-helper.js';",
      ].join('\n'),
    },
    {
      path: 'src/a-consumer.ts',
      source: [
        "import { command } from 'commander/extra';",
        "import ignore from 'ignore';",
        "import { helper } from './Z-helper.js';",
        "import type { ResponsiveFamilyPlanner } from './ä-policy.js';",
        "import type { CompilerOptions } from 'typescript';",
        'const example = "import value from \'not-a-package\'";',
        "// import ignored from 'also-not-a-package';",
        'export const result = command + helper + ignore + example;',
      ].join('\n'),
    },
    {
      path: 'src/Z-helper.ts',
      source: [
        "import angular from '@angular/compiler';",
        "import { readFile } from 'node:fs/promises';",
        'export class BreakpointCatalog {}',
        'export type DiagnosticCode = string;',
        'export class MigrationTransaction {}',
        'export const helper = angular + readFile;',
      ].join('\n'),
    },
  ],
  packageJson: {
    dependencies: {
      '@angular/compiler': '21.2.22',
      commander: '^15.0.0',
      winston: '^3.19.0',
    },
  },
  packageLock: {
    packages: {
      'node_modules/@angular/compiler': { version: '21.2.22' },
      'node_modules/commander': { version: '15.0.1' },
      'node_modules/winston': { version: '3.19.0' },
    },
  },
};

describe('architecture inventory', () => {
  it('discovers tracked root and nested production files while excluding specifications', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'architecture-inventory-discovery-'));
    const outputPath = join(directory, 'inventory.json');

    try {
      await main(['--json', outputPath]);
      const inventory = JSON.parse(await readFile(outputPath, 'utf8')) as {
        readonly productionFiles: readonly { readonly path: string }[];
        readonly policyOwners: readonly {
          readonly policy: string;
          readonly module: string;
          readonly symbol: string;
        }[];
        readonly runtimeDependencyViolations?: readonly unknown[];
        readonly productionEntrypoints?: readonly string[];
        readonly unreachableProductionModules?: readonly string[];
      };
      const paths = inventory.productionFiles.map(file => file.path);

      expect(paths).toContain('src/main.ts');
      expect(paths).toContain('src/logger.ts');
      expect(paths).toContain('src/adapter/adapter.factory.ts');
      expect(paths).not.toContain('src/logger.spec.ts');
      expect(paths.some(path => path.endsWith('.spec.ts'))).toBe(false);
      expect(inventory.runtimeDependencyViolations).toEqual([]);
      expect(inventory.productionEntrypoints).toEqual(['src/main.ts', 'src/browser/template-preview.ts']);
      expect(inventory.unreachableProductionModules).toEqual([]);
      expect(inventory.policyOwners).toEqual([
        {
          policy: 'artifact identity',
          module: 'src/adapter/css/css-artifact.registry.ts',
          symbol: 'CssArtifactRegistry',
        },
        {
          policy: 'breakpoint classification',
          module: 'src/breakpoint/breakpoint-catalog.ts',
          symbol: 'BreakpointCatalog',
        },
        { policy: 'diagnostics', module: 'src/analyzer/conversion-result.ts', symbol: 'DiagnosticCode' },
        {
          policy: 'responsive precedence',
          module: 'src/semantic/responsive-family.planner.ts',
          symbol: 'ResponsiveFamilyPlanner',
        },
        {
          policy: 'semantic planning',
          module: 'src/semantic/element-semantic.planner.ts',
          symbol: 'ElementSemanticPlanner',
        },
        {
          policy: 'transaction recovery',
          module: 'src/transaction/migration-transaction.ts',
          symbol: 'MigrationTransaction',
        },
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('orders production code by code unit and records physical line counts', () => {
    const inventory = inventoryProject(syntheticProject);

    expect(inventory.productionFiles).toEqual([
      { path: 'src/Z-helper.ts', lines: 6 },
      { path: 'src/a-consumer.ts', lines: 8 },
      { path: 'src/ä-policy.ts', lines: 4 },
    ]);
    expect(inventory.largestFiles).toEqual([
      { path: 'src/a-consumer.ts', lines: 8 },
      { path: 'src/Z-helper.ts', lines: 6 },
      { path: 'src/ä-policy.ts', lines: 4 },
    ]);
  });

  it('records type-only import and export edges between internal modules without treating type packages as runtime', () => {
    const inventory = inventoryProject(syntheticProject);

    expect(inventory.moduleEdges).toEqual([
      { from: 'src/Z-helper.ts', kind: 'external', to: '@angular/compiler' },
      { from: 'src/Z-helper.ts', kind: 'builtin', to: 'node:fs/promises' },
      { from: 'src/a-consumer.ts', kind: 'external', to: 'commander' },
      { from: 'src/a-consumer.ts', kind: 'external', to: 'ignore' },
      { from: 'src/a-consumer.ts', kind: 'relative', to: 'src/Z-helper.ts' },
      { from: 'src/a-consumer.ts', kind: 'relative', to: 'src/ä-policy.ts' },
      { from: 'src/ä-policy.ts', kind: 'relative', to: 'src/Z-helper.ts' },
    ]);
    expect(inventory.runtimeDependencies.map(dependency => dependency.name)).not.toContain('typescript');
  });

  it('records direct runtime dependency use and lockfile resolution', () => {
    const inventory = inventoryProject(syntheticProject);

    expect(inventory.runtimeDependencies).toEqual([
      {
        name: '@angular/compiler',
        declared: '21.2.22',
        resolved: '21.2.22',
        importedBy: ['src/Z-helper.ts'],
        status: 'used',
      },
      {
        name: 'commander',
        declared: '^15.0.0',
        resolved: '15.0.1',
        importedBy: ['src/a-consumer.ts'],
        status: 'used',
      },
      {
        name: 'ignore',
        declared: null,
        resolved: null,
        importedBy: ['src/a-consumer.ts'],
        status: 'used',
      },
      {
        name: 'winston',
        declared: '^3.19.0',
        resolved: '3.19.0',
        importedBy: [],
        status: 'unused',
      },
    ]);
    expect(inventory.runtimeDependencyViolations).toEqual([
      { name: 'ignore', issue: 'undeclared-import' },
      { name: 'winston', issue: 'unused-declaration' },
    ]);
  });

  it('discovers policy-owner modules from their defining symbols', () => {
    expect(inventoryProject(syntheticProject).policyOwners).toEqual([
      { policy: 'artifact identity', module: 'src/ä-policy.ts', symbol: 'CssArtifactRegistry' },
      { policy: 'breakpoint classification', module: 'src/Z-helper.ts', symbol: 'BreakpointCatalog' },
      { policy: 'diagnostics', module: 'src/Z-helper.ts', symbol: 'DiagnosticCode' },
      { policy: 'responsive precedence', module: 'src/ä-policy.ts', symbol: 'ResponsiveFamilyPlanner' },
      { policy: 'semantic planning', module: 'src/ä-policy.ts', symbol: 'ElementSemanticPlanner' },
      { policy: 'transaction recovery', module: 'src/Z-helper.ts', symbol: 'MigrationTransaction' },
    ]);
  });

  it('serializes deterministically for equivalent inputs in different orders', () => {
    const reversed = {
      ...syntheticProject,
      productionFiles: [...syntheticProject.productionFiles].reverse(),
      packageJson: {
        dependencies: Object.fromEntries(Object.entries(syntheticProject.packageJson.dependencies).reverse()),
      },
    };

    expect(JSON.stringify(inventoryProject(reversed), null, 2)).toBe(
      JSON.stringify(inventoryProject(syntheticProject), null, 2),
    );
  });

  it('derives reachability from every production entrypoint without letting a dead type-only chain appear reachable', () => {
    const inventory = inventoryProject({
      productionFiles: [
        { path: 'src/main.ts', source: "import './live.js';" },
        {
          path: 'src/live.ts',
          source: "import type { LiveContract } from './live-contract.js'; export const live = 1;",
        },
        { path: 'src/live-contract.ts', source: 'export interface LiveContract { readonly value: string }' },
        { path: 'src/browser/template-preview.ts', source: "import './preview-contract.js';" },
        {
          path: 'src/browser/preview-contract.ts',
          source: 'export interface PreviewContract { readonly source: string }',
        },
        {
          path: 'src/dead.ts',
          source: "import type { DeadContract } from './dead-contract.js'; export const dead = 1;",
        },
        { path: 'src/dead-contract.ts', source: 'export interface DeadContract { readonly value: string }' },
      ],
      packageJson: { dependencies: {} },
      packageLock: { packages: {} },
    });

    expect(inventory.productionEntrypoints).toEqual(['src/main.ts', 'src/browser/template-preview.ts']);
    expect(inventory.reachableProductionModules).toEqual([
      'src/browser/preview-contract.ts',
      'src/browser/template-preview.ts',
      'src/live-contract.ts',
      'src/live.ts',
      'src/main.ts',
    ]);
    expect(inventory.unreachableProductionModules).toEqual(['src/dead-contract.ts', 'src/dead.ts']);
  });
});
