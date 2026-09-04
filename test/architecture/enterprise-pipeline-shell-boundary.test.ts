import { readFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

import { describe, expect, test } from 'vitest';

import { analyzedProject } from '../../src/pipeline/analyzed-project';
import { MigrationPipeline } from '../../src/pipeline/migration-pipeline';
import { migrationInvocation, projectManifest } from '../../src/pipeline/project-manifest';
import { renderedProject } from '../../src/pipeline/rendered-project';
import { validatedProjectPlan } from '../../src/pipeline/validated-project-plan';
import {
  inspectTypeScript,
  inspectTypeScriptProject,
  inspectSemanticAuthorityCalls,
  moduleReferenceContainsPath,
  productionTypeScriptFiles,
  runtimeModuleReferences,
} from './typescript-boundary';

const productionRoot = join(process.cwd(), 'src');
const pipelineRoot = join(productionRoot, 'pipeline');
const wholeProjectInspectionTimeout = 60_000;
const cliPath = join(productionRoot, 'cli', 'run-cli.ts');
const currentPipelinePath = join(pipelineRoot, 'current-migration.pipeline.ts');
const migrationPipelinePath = join(pipelineRoot, 'migration-pipeline.ts');
const handoffImports = new Map<string, readonly string[]>([
  [
    'analyzed-project.ts',
    [
      './project-manifest',
      '../analyzer/flex-layout-attribute.analyzer',
      '../migrator/migration-application.error',
      '../template/template.model',
      'node:path',
    ],
  ],
  ['project-manifest.ts', ['../migrator/migrator', 'node:path']],
  [
    'rendered-project.ts',
    [
      './analyzed-project',
      './project-manifest',
      '../adapter/css/css-artifact.model',
      '../analyzer/conversion-result',
      '../breakpoint/breakpoint-catalog',
      '../edit/source-edit',
      '../migrator/migration-application.error',
      '../render/render-session',
      'node:path',
    ],
  ],
  [
    'validated-project-plan.ts',
    [
      './rendered-project',
      '../migrator/file-migration-result',
      '../migrator/migration-application.error',
      '../migrator/migration-plan',
      '../report/migration-report.builder',
      'node:path',
    ],
  ],
]);

function sourceInspection(path: string) {
  return inspectTypeScript(readFileSync(path, 'utf8'), path);
}

function sorted(values: readonly string[]): readonly string[] {
  return [...values].sort();
}

function expectFrozenAgainstMutation(value: object): void {
  expect(Object.isFrozen(value)).toBe(true);
  const property = Array.isArray(value) ? value.length : '__pipeline_boundary_mutation__';
  expect(Reflect.set(value, property, Symbol('mutation'))).toBe(false);
}

describe('enterprise pipeline shell dependency boundary', { timeout: wholeProjectInspectionTimeout }, () => {
  test('keeps handoff models limited to target-neutral model imports and Node path normalization', () => {
    for (const [fileName, allowedImports] of handoffImports) {
      const path = join(pipelineRoot, fileName);
      const source = readFileSync(path, 'utf8');
      const inspection = inspectTypeScript(source, path);

      expect(sorted(inspection.moduleReferences), relative(process.cwd(), path)).toEqual(sorted(allowedImports));
      expect(
        runtimeModuleReferences(source, path).filter(reference =>
          ['adapter', 'breakpoint'].some(layer => moduleReferenceContainsPath(reference, layer)),
        ),
        relative(process.cwd(), path),
      ).toEqual([]);
    }
  });

  test('limits the staged coordinator to handoffs, its stage error, and the application result model', () => {
    const source = readFileSync(migrationPipelinePath, 'utf8');
    expect(sorted(inspectTypeScript(source, migrationPipelinePath).moduleReferences)).toEqual(
      sorted([
        './analyzed-project',
        './pipeline-stage.error',
        './project-manifest',
        './rendered-project',
        './validated-project-plan',
        '../report/migration-report',
      ]),
    );
    expect(runtimeModuleReferences(source, migrationPipelinePath)).toEqual(['./pipeline-stage.error']);
  });

  test('keeps the stage error dependent only on the coordinator stage-name type', () => {
    const stageErrorPath = join(pipelineRoot, 'pipeline-stage.error.ts');
    const source = readFileSync(stageErrorPath, 'utf8');

    expect([...new Set(inspectTypeScript(source, stageErrorPath).moduleReferences)]).toEqual(['./migration-pipeline']);
    expect(runtimeModuleReferences(source, stageErrorPath)).toEqual([]);
  });

  test('keeps the current-pipeline facade as the sole concrete Migrator owner without an adapter session', () => {
    const pipelinePaths = productionTypeScriptFiles(pipelineRoot);
    const concreteMigratorOwners = pipelinePaths.flatMap(path =>
      sourceInspection(path).runtimeImports.flatMap(runtimeImport =>
        runtimeImport.importedName === 'Migrator' &&
        moduleReferenceContainsPath(runtimeImport.moduleReference, 'migrator/migrator')
          ? [relative(productionRoot, path).replaceAll('\\', '/')]
          : [],
      ),
    );
    const legacyAdapterSessionOwners = pipelinePaths.flatMap(path =>
      sourceInspection(path).identifiers.includes('ConversionAdapterSession')
        ? [relative(productionRoot, path).replaceAll('\\', '/')]
        : [],
    );

    expect(concreteMigratorOwners).toEqual(['pipeline/current-migration.pipeline.ts']);
    expect(legacyAdapterSessionOwners).toEqual([]);
  });

  test('keeps the current-pipeline facade to one Render/Validate handoff and migrate call without policy ownership', () => {
    const inspection = sourceInspection(currentPipelinePath);
    const projectInspection = inspectTypeScriptProject([currentPipelinePath]);
    const forbiddenSymbols = [
      ...inspection.identifiers,
      ...inspection.callExpressionNames,
      ...inspection.constructedExpressionNames,
    ].filter(identifier =>
      /(?:directive|breakpoint|renderer|reportbuilder|buildreport|filesystem|transaction|exitpolicy|resolveexitcode|presenter|writer)/iu.test(
        identifier,
      ),
    );

    expect(sorted(inspection.moduleReferences)).toEqual(
      sorted([
        './project-manifest',
        './analyze/analyze-project.stage',
        './discover/discover-project.stage',
        './invocation-error-path.mapper',
        './migration-pipeline',
        './validate/validate-project.stage',
        './validated-project-plan',
        '../migrator/migrator',
        '../migrator/migrator',
        '../report/migration-report',
      ]),
    );
    expect(inspection.callExpressionNames.filter(name => name === 'migrate')).toEqual(['migrate']);
    expect(forbiddenSymbols).toEqual([]);
    expect(projectInspection.filesystemMutationCalls).toEqual([]);
    expect(projectInspection.transactionApplyCalls).toEqual([]);
    expect(inspectSemanticAuthorityCalls([currentPipelinePath])).toEqual([
      { sourcePath: currentPipelinePath, name: 'DiscoverProjectStage.run' },
      { sourcePath: currentPipelinePath, name: 'AnalyzeProjectStage.run' },
      { sourcePath: currentPipelinePath, name: 'RenderProjectStage.run' },
      { sourcePath: currentPipelinePath, name: 'ValidateProjectStage.run' },
      { sourcePath: currentPipelinePath, name: 'Migrator.migrate' },
    ]);
  });

  test('routes the CLI through the runner port without a direct Migrator dependency', () => {
    const inspection = sourceInspection(cliPath);

    expect(inspection.moduleReferences).toContain('../pipeline/current-migration.pipeline');
    expect(inspection.identifiers).toContain('MigrationRunner');
    expect(inspection.identifiers).toContain('CurrentMigrationPipeline');
    expect(inspection.identifiers).not.toContain('Migrator');
    expect(
      inspection.moduleReferences.find(reference => moduleReferenceContainsPath(reference, 'migrator/migrator')),
    ).toBeUndefined();
  });

  test('reserves CurrentMigrationPipeline imports for the CLI production entry point', () => {
    const importers = productionTypeScriptFiles(productionRoot).flatMap(path =>
      sourceInspection(path).moduleReferences.some(reference =>
        moduleReferenceContainsPath(reference, 'pipeline/current-migration.pipeline'),
      )
        ? [relative(productionRoot, path).replaceAll('\\', '/')]
        : [],
    );

    expect(importers).toEqual(['cli/run-cli.ts']);
  });

  test('keeps handoff arrays and completed result objects frozen under mutation attempts', async () => {
    const stylesheetPath = join(process.cwd(), 'fixtures', 'migration.css');
    const invocation = migrationInvocation({
      inputPath: 'fixtures/source',
      outputPath: 'fixtures/output',
      options: { mode: 'plan', stylesheetPath },
    });
    const manifest = projectManifest({
      invocation,
      templates: [{ inputPath: 'fixtures/source/card.html', outputPath: 'fixtures/output/card.html' }],
    });
    const analyzed = analyzedProject({
      manifest,
      templates: [
        {
          status: 'parse-error',
          file: manifest.templates[0]!,
          source: '<div',
          parseResult: {
            status: 'parse-error',
            diagnostics: [{ message: 'incomplete start tag', source: { start: 0, end: 4 } }],
          },
        },
      ],
    });
    const rendered = renderedProject({
      analyzed,
      target: 'css',
      files: [
        {
          inputPath: manifest.templates[0]!.inputPath,
          outputPath: manifest.templates[0]!.outputPath,
          edits: [],
          results: [
            {
              status: 'parse-error',
              fileName: manifest.templates[0]!.inputPath,
              code: 'template-parse-error',
              reason: 'incomplete start tag',
              source: { start: 0, end: 4 },
            },
          ],
        },
      ],
      session: { target: 'css', rules: [] },
    });
    const validated = validatedProjectPlan({
      rendered,
      plan: {
        target: 'css',
        files: [
          {
            inputPath: rendered.files[0]!.inputPath,
            outputPath: rendered.files[0]!.outputPath,
            changed: false,
            results: rendered.files[0]!.results,
          },
        ],
        artifacts: [],
      },
      stylesheet: { path: stylesheetPath, change: 'unchanged' },
    });
    const result = await new MigrationPipeline(
      { run: () => Promise.resolve(manifest) },
      { run: () => Promise.resolve(analyzed) },
      { run: () => Promise.resolve(rendered) },
      { run: () => Promise.resolve(validated) },
      { run: () => Promise.resolve({ application: { status: 'skipped', reason: 'plan-only' } }) },
    ).run(invocation);
    const parsed = analyzed.templates[0]!;
    if (parsed.status !== 'parse-error') throw new Error('Expected a parse-error fixture.');
    if (rendered.session.target !== 'css') throw new Error('Expected a CSS session fixture.');

    for (const value of [
      invocation,
      invocation.options,
      manifest,
      manifest.templates,
      manifest.templates[0]!,
      analyzed,
      analyzed.templates,
      parsed,
      parsed.parseResult,
      parsed.parseResult.diagnostics,
      rendered,
      rendered.files,
      rendered.files[0]!,
      rendered.files[0]!.edits,
      rendered.files[0]!.results,
      rendered.session,
      rendered.session.rules,
      validated,
      validated.plan,
      validated.plan.files,
      validated.plan.files[0]!,
      validated.plan.artifacts,
      validated.stylesheet!,
      result,
      result.application,
    ]) {
      expectFrozenAgainstMutation(value);
    }
  });

  test('covers every production pipeline module with the no-mutation inspection', () => {
    const pipelinePaths = productionTypeScriptFiles(pipelineRoot);

    expect(pipelinePaths.map(path => basename(path)).sort()).toEqual([
      'analyze-project.stage.ts',
      'analyzed-project.ts',
      'css-reference.collector.ts',
      'current-migration.pipeline.ts',
      'discover-project.stage.ts',
      'discovery-file-system.port.ts',
      'ignore-matcher.port.ts',
      'invocation-error-path.mapper.ts',
      'migration-pipeline.ts',
      'pipeline-stage.error.ts',
      'project-manifest.ts',
      'render-project.stage.ts',
      'rendered-project.ts',
      'template-input-analyzer.port.ts',
      'template-parser.port.ts',
      'template-proposal.validator.ts',
      'template-source-reader.port.ts',
      'validate-project.stage.ts',
      'validated-project-plan.ts',
    ]);
    expect(inspectTypeScriptProject(pipelinePaths).filesystemMutationCalls).toEqual([]);
    expect(inspectTypeScriptProject(pipelinePaths).transactionApplyCalls).toEqual([]);
  });
});
