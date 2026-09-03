import * as path from 'node:path';
import { MigrationApplicationError } from '../migrator/migration-application.error';
import { fileMigrationResult, type FileMigrationResult } from '../migrator/file-migration-result';
import { migrationPlan, type MigrationPlan, type PlannedOutputArtifact } from '../migrator/migration-plan';
import type { StylesheetMigrationResult } from '../report/migration-report.builder';
import { renderedProject, type RenderedProject } from './rendered-project';

export interface ValidatedProjectPlan {
  readonly rendered: RenderedProject;
  readonly plan: MigrationPlan;
  readonly stylesheet?: StylesheetMigrationResult;
}

export function validatedProjectPlan(project: ValidatedProjectPlan): ValidatedProjectPlan {
  const rendered = renderedProject(project.rendered);
  const suppliedPlan = migrationPlan(project.plan);

  if (suppliedPlan.target !== rendered.session.target) {
    throw internalInvariant('Validated migration plan target differs from its finalized adapter session target.');
  }

  const plan = canonicalPlan(rendered, suppliedPlan);
  const templateArtifacts = renderedTemplateArtifacts(rendered);
  assertTemplateArtifactCongruence(templateArtifacts, plan.artifacts);
  const stylesheet = validatedStylesheet(rendered, plan, templateArtifacts, project.stylesheet);

  return Object.freeze({
    rendered,
    plan,
    ...(stylesheet === undefined ? {} : { stylesheet }),
  });
}

function canonicalPlan(rendered: RenderedProject, supplied: MigrationPlan): MigrationPlan {
  if (supplied.files.length !== rendered.files.length) throw fileCongruenceInvariant();
  const files = supplied.files.map((file, index) => {
    const expected = rendered.files[index]?.file;
    if (expected === undefined || !samePathPair(expected, file)) throw fileCongruenceInvariant();
    const canonical = fileMigrationResult({
      ...file,
      inputPath: expected.inputPath,
      outputPath: expected.outputPath,
    });
    if (!sameOwnedValue(canonical, expected)) throw fileCongruenceInvariant();
    return canonical;
  });

  return migrationPlan({ target: supplied.target, files, artifacts: supplied.artifacts });
}

function renderedTemplateArtifacts(rendered: RenderedProject): readonly PlannedOutputArtifact[] {
  return rendered.files.flatMap(file => {
    const artifact = file.artifact;
    if (
      file.file.changed !== (artifact !== undefined) ||
      (artifact !== undefined &&
        (artifact.kind !== 'template' || normalizedAbsolutePath(artifact.path) !== file.file.outputPath))
    ) {
      throw internalInvariant('Rendered template artifacts must correspond exactly to changed file outputs.');
    }
    return artifact === undefined ? [] : [artifact];
  });
}

function assertTemplateArtifactCongruence(
  renderedArtifacts: readonly PlannedOutputArtifact[],
  planArtifacts: readonly PlannedOutputArtifact[],
): void {
  const templateArtifacts = planArtifacts.filter(artifact => artifact.kind === 'template');
  if (
    templateArtifacts.length !== renderedArtifacts.length ||
    templateArtifacts.some((artifact, index) => !sameArtifact(artifact, renderedArtifacts[index]))
  ) {
    throw internalInvariant(
      'Validated migration plan template artifacts must match rendered template artifacts in file order.',
    );
  }
}

function validatedStylesheet(
  rendered: RenderedProject,
  plan: MigrationPlan,
  templateArtifacts: readonly PlannedOutputArtifact[],
  supplied: StylesheetMigrationResult | undefined,
): StylesheetMigrationResult | undefined {
  const nonTemplateArtifacts = plan.artifacts.filter(artifact => artifact.kind !== 'template');
  if (rendered.session.target === 'tailwind') {
    if (
      supplied !== undefined ||
      nonTemplateArtifacts.length > 0 ||
      !sameArtifactSequence(plan.artifacts, templateArtifacts)
    ) {
      throw internalInvariant('Tailwind migration plans cannot contain stylesheet artifacts or metadata.');
    }
    return undefined;
  }

  const configuredPath = rendered.analyzed.manifest.invocation.options.stylesheetPath;
  const stylesheetArtifact = nonTemplateArtifacts.length === 1 ? nonTemplateArtifacts[0] : undefined;
  const canonicalConfiguredPath =
    configuredPath === undefined || configuredPath.trim().length === 0
      ? undefined
      : normalizedAbsolutePath(configuredPath);
  const expectedChange = stylesheetArtifact === undefined ? 'unchanged' : stylesheetChange(stylesheetArtifact);
  const expectedArtifacts = [...templateArtifacts, ...(stylesheetArtifact === undefined ? [] : [stylesheetArtifact])];

  if (
    canonicalConfiguredPath === undefined ||
    supplied === undefined ||
    nonTemplateArtifacts.length > 1 ||
    (stylesheetArtifact !== undefined && stylesheetArtifact.kind !== 'stylesheet') ||
    normalizedAbsolutePath(supplied.path) !== canonicalConfiguredPath ||
    (stylesheetArtifact !== undefined && normalizedAbsolutePath(stylesheetArtifact.path) !== canonicalConfiguredPath) ||
    supplied.change !== expectedChange ||
    !sameArtifactSequence(plan.artifacts, expectedArtifacts)
  ) {
    throw internalInvariant(
      'CSS stylesheet metadata must correspond exactly to its configured path and artifact change state.',
    );
  }

  return Object.freeze({ path: canonicalConfiguredPath, change: supplied.change });
}

function stylesheetChange(artifact: PlannedOutputArtifact): StylesheetMigrationResult['change'] {
  if (artifact.original.status === 'absent') return 'created';
  if (artifact.proposed.status === 'absent') return 'removed';
  return 'updated';
}

function sameArtifactSequence(
  left: readonly PlannedOutputArtifact[],
  right: readonly PlannedOutputArtifact[],
): boolean {
  return left.length === right.length && left.every((artifact, index) => sameArtifact(artifact, right[index]));
}

function sameArtifact(left: PlannedOutputArtifact, right: PlannedOutputArtifact | undefined): boolean {
  return (
    right !== undefined &&
    left.kind === right.kind &&
    normalizedAbsolutePath(left.path) === normalizedAbsolutePath(right.path) &&
    sameOwnedValue(left.original, right.original) &&
    sameOwnedValue(left.proposed, right.proposed)
  );
}

function samePathPair(left: FileMigrationResult, right: FileMigrationResult): boolean {
  return (
    normalizedAbsolutePath(left.inputPath) === normalizedAbsolutePath(right.inputPath) &&
    normalizedAbsolutePath(left.outputPath) === normalizedAbsolutePath(right.outputPath)
  );
}

function sameOwnedValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => sameOwnedValue(item, right[index]))
    );
  }
  if (!isPlainRecord(left) || !isPlainRecord(right)) return false;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every(key => Object.hasOwn(right, key) && sameOwnedValue(left[key], right[key]))
  );
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function normalizedAbsolutePath(value: string): string {
  return path.normalize(path.resolve(value));
}

function fileCongruenceInvariant(): MigrationApplicationError {
  return internalInvariant(
    'Validated migration plan files must match rendered files one-to-one and in the same order.',
  );
}

function internalInvariant(message: string): MigrationApplicationError {
  return new MigrationApplicationError('internal-invariant', message);
}
