import * as path from 'node:path';
import type { AdapterSessionResult } from '../adapter/conversion-adapter.session';
import type { MediaDefinition } from '../breakpoint/breakpoint-catalog';
import type { OwnedCssRule } from '../adapter/css/css-artifact.model';
import { MigrationApplicationError } from '../migrator/migration-application.error';
import { fileMigrationPlan, type FileMigrationPlan } from '../migrator/migration-plan';
import { analyzedProject, type AnalyzedProject } from './analyzed-project';
import type { ManifestTemplate } from './project-manifest';

export interface RenderedProject {
  readonly analyzed: AnalyzedProject;
  readonly files: readonly FileMigrationPlan[];
  readonly session: AdapterSessionResult;
}

export function renderedProject(project: RenderedProject): RenderedProject {
  const analyzed = analyzedProject(project.analyzed);
  const files = project.files.map(file => fileMigrationPlan(file));

  for (const file of files) {
    if (!analyzed.templates.some(template => samePathPair(template.file, file.file))) {
      throw internalInvariant('Rendered file is not represented by an analyzed template.', [
        file.file.inputPath,
        file.file.outputPath,
      ]);
    }
  }

  return Object.freeze({
    analyzed,
    files: Object.freeze(files),
    session: freezeSessionResult(project.session),
  });
}

function freezeSessionResult(session: AdapterSessionResult): AdapterSessionResult {
  if (session.target === 'tailwind') return Object.freeze({ target: session.target });
  return Object.freeze({
    target: session.target,
    rules: Object.freeze(session.rules.map(rule => freezeOwnedCssRule(rule))),
  });
}

function freezeOwnedCssRule(rule: OwnedCssRule): OwnedCssRule {
  return Object.freeze({
    ...rule,
    declarations: Object.freeze(rule.declarations.map(declaration => Object.freeze({ ...declaration }))),
    context: Object.freeze({
      ...rule.context,
      ...(rule.context.media === undefined ? {} : { media: freezeMedia(rule.context.media) }),
    }),
  });
}

function freezeMedia(media: MediaDefinition): MediaDefinition {
  return Object.freeze({
    ...media,
    clauses: Object.freeze(media.clauses.map(clause => Object.freeze({ ...clause }))),
  });
}

function samePathPair(
  left: ManifestTemplate,
  right: { readonly inputPath: string; readonly outputPath: string },
): boolean {
  return (
    normalizedAbsolutePath(left.inputPath) === normalizedAbsolutePath(right.inputPath) &&
    normalizedAbsolutePath(left.outputPath) === normalizedAbsolutePath(right.outputPath)
  );
}

function normalizedAbsolutePath(value: string): string {
  return path.normalize(path.resolve(value));
}

function internalInvariant(message: string, paths: readonly string[]): MigrationApplicationError {
  return new MigrationApplicationError('internal-invariant', message, paths);
}
