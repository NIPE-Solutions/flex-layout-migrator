import { describe, expect, it } from 'vitest';

import { inventoryProject } from './architecture-inventory.mjs';

const syntheticProject = {
  productionFiles: [
    {
      path: 'src/ä-policy.ts',
      source: [
        'export class SharedResponsiveFamilyPlanner {}',
        'export class ConversionPlanner {}',
        'export class CssArtifactRegistry {}',
      ].join('\n'),
    },
    {
      path: 'src/a-consumer.ts',
      source: [
        "import { command } from 'commander/extra';",
        "import { helper } from './Z-helper.js';",
        'const example = "import value from \'not-a-package\'";',
        "// import ignored from 'also-not-a-package';",
        'export const result = command + helper + example;',
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
  it('orders production code by code unit and records physical line counts', () => {
    const inventory = inventoryProject(syntheticProject);

    expect(inventory.productionFiles).toEqual([
      { path: 'src/Z-helper.ts', lines: 6 },
      { path: 'src/a-consumer.ts', lines: 5 },
      { path: 'src/ä-policy.ts', lines: 3 },
    ]);
    expect(inventory.largestFiles).toEqual([
      { path: 'src/Z-helper.ts', lines: 6 },
      { path: 'src/a-consumer.ts', lines: 5 },
      { path: 'src/ä-policy.ts', lines: 3 },
    ]);
  });

  it('classifies AST runtime imports without treating comments or strings as edges', () => {
    const inventory = inventoryProject(syntheticProject);

    expect(inventory.moduleEdges).toEqual([
      { from: 'src/Z-helper.ts', kind: 'external', to: '@angular/compiler' },
      { from: 'src/Z-helper.ts', kind: 'builtin', to: 'node:fs/promises' },
      { from: 'src/a-consumer.ts', kind: 'external', to: 'commander' },
      { from: 'src/a-consumer.ts', kind: 'relative', to: 'src/Z-helper.ts' },
    ]);
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
        name: 'winston',
        declared: '^3.19.0',
        resolved: '3.19.0',
        importedBy: [],
        status: 'unused',
      },
    ]);
  });

  it('discovers policy-owner modules from their defining symbols', () => {
    expect(inventoryProject(syntheticProject).policyOwners).toEqual([
      { policy: 'artifact identity', module: 'src/ä-policy.ts', symbol: 'CssArtifactRegistry' },
      { policy: 'breakpoint classification', module: 'src/Z-helper.ts', symbol: 'BreakpointCatalog' },
      { policy: 'diagnostics', module: 'src/Z-helper.ts', symbol: 'DiagnosticCode' },
      { policy: 'responsive precedence', module: 'src/ä-policy.ts', symbol: 'SharedResponsiveFamilyPlanner' },
      { policy: 'semantic planning', module: 'src/ä-policy.ts', symbol: 'ConversionPlanner' },
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
});
