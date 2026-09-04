import * as path from 'node:path';
import type { OwnedCssRule } from '../adapter/css/css-artifact.model';
import type { ConversionResult } from '../analyzer/conversion-result';
import type { MediaDefinition } from '../breakpoint/breakpoint-catalog';
import type { SourceEdit } from '../edit/source-edit';
import { MigrationApplicationError } from '../migrator/migration-application.error';
import type { AdapterSessionResult } from '../render/render-session';
import { analyzedProject, type AnalyzedProject } from './analyzed-project';
import type { ManifestTemplate } from './project-manifest';

export interface RenderedTemplateFile {
  readonly inputPath: string;
  readonly outputPath: string;
  readonly edits: readonly SourceEdit[];
  readonly results: readonly ConversionResult[];
}

export interface RenderedProject {
  readonly analyzed: AnalyzedProject;
  readonly target: 'css' | 'tailwind';
  readonly files: readonly RenderedTemplateFile[];
  readonly session: AdapterSessionResult;
}

export function renderedProject(project: RenderedProject): RenderedProject {
  const analyzed = analyzedProject(project.analyzed);
  if (project.files.length !== analyzed.templates.length) throw sequenceInvariant();
  const files = project.files.map((file, index) => {
    const template = analyzed.templates[index];
    if (template === undefined || !samePathPair(template.file, file)) {
      throw sequenceInvariant([file.inputPath, file.outputPath]);
    }
    if (
      template.status === 'parse-error' &&
      (file.edits.length > 0 || !sameOwnedValue(file.results, parseErrorResults(template)))
    ) {
      throw internalInvariant(
        'Rendered parse-error files must be edit-free and preserve their analyzed diagnostics exactly.',
        [file.inputPath, file.outputPath],
      );
    }
    const identity = template.file;
    return freezeRenderedFile({
      inputPath: identity.inputPath,
      outputPath: identity.outputPath,
      edits: file.edits,
      results: file.results,
    });
  });

  return Object.freeze({
    analyzed,
    target: project.target,
    files: Object.freeze(files),
    session: freezeSessionResult(project.session),
  });
}

function parseErrorResults(
  template: Extract<AnalyzedProject['templates'][number], { readonly status: 'parse-error' }>,
): readonly ConversionResult[] {
  return template.parseResult.diagnostics.map(diagnostic => ({
    status: 'parse-error',
    fileName: template.file.inputPath,
    code: 'template-parse-error',
    reason: diagnostic.message,
    source: diagnostic.source,
  }));
}

function freezeRenderedFile(file: RenderedTemplateFile): RenderedTemplateFile {
  return Object.freeze({
    inputPath: file.inputPath,
    outputPath: file.outputPath,
    edits: Object.freeze(
      file.edits.map(edit =>
        Object.freeze({
          ...edit,
          range: Object.freeze({ ...edit.range }),
        }),
      ),
    ),
    results: freezeValue([...file.results]),
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

function samePathPair(left: ManifestTemplate, right: RenderedTemplateFile): boolean {
  return (
    normalizedAbsolutePath(left.inputPath) === normalizedAbsolutePath(right.inputPath) &&
    normalizedAbsolutePath(left.outputPath) === normalizedAbsolutePath(right.outputPath)
  );
}

function normalizedAbsolutePath(value: string): string {
  return path.normalize(path.resolve(value));
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

function freezeValue<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map(item => freezeValue(item))) as T;
  if (value !== null && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freezeValue(item)]))) as T;
  }
  return value;
}

function sequenceInvariant(paths: readonly string[] = []): MigrationApplicationError {
  return internalInvariant(
    'Rendered project files must match its analyzed templates one-to-one and in the same order.',
    paths,
  );
}

function internalInvariant(message: string, paths: readonly string[] = []): MigrationApplicationError {
  return new MigrationApplicationError('internal-invariant', message, paths);
}
