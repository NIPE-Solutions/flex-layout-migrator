import * as path from 'node:path';
import type { LocatedFlexLayoutInput } from '../analyzer/flex-layout-attribute.analyzer';
import { MigrationApplicationError } from '../migrator/migration-application.error';
import type { TemplateParseResult } from '../template/template.model';
import { projectManifest, type ManifestTemplate, type ProjectManifest } from './project-manifest';

export type AnalyzedTemplate =
  | {
      readonly status: 'parsed';
      readonly file: ManifestTemplate;
      readonly source: string;
      readonly parseResult: Extract<TemplateParseResult, { readonly status: 'parsed' }>;
      readonly inputs: readonly LocatedFlexLayoutInput[];
    }
  | {
      readonly status: 'parse-error';
      readonly file: ManifestTemplate;
      readonly source: string;
      readonly parseResult: Extract<TemplateParseResult, { readonly status: 'parse-error' }>;
    };

export interface AnalyzedProject {
  readonly manifest: ProjectManifest;
  readonly templates: readonly AnalyzedTemplate[];
}

export function analyzedProject(project: AnalyzedProject): AnalyzedProject {
  const manifest = projectManifest(project.manifest);
  const templates = project.templates.map(template => {
    const file = manifestTemplate(manifest, template.file);
    if (template.status === 'parse-error') {
      return Object.freeze({
        status: template.status,
        file,
        source: template.source,
        parseResult: template.parseResult,
      });
    }

    return Object.freeze({
      status: template.status,
      file,
      source: template.source,
      parseResult: template.parseResult,
      inputs: Object.freeze(template.inputs.map(input => freezeLocatedInput(input))),
    });
  });

  return Object.freeze({ manifest, templates: Object.freeze(templates) });
}

function manifestTemplate(manifest: ProjectManifest, candidate: ManifestTemplate): ManifestTemplate {
  const match = manifest.templates.find(template => samePathPair(template, candidate));
  if (match === undefined) {
    throw internalInvariant('Analyzed template is not present in its project manifest.', [
      candidate.inputPath,
      candidate.outputPath,
    ]);
  }
  return match;
}

function samePathPair(left: ManifestTemplate, right: ManifestTemplate): boolean {
  return (
    normalizedAbsolutePath(left.inputPath) === normalizedAbsolutePath(right.inputPath) &&
    normalizedAbsolutePath(left.outputPath) === normalizedAbsolutePath(right.outputPath)
  );
}

function freezeLocatedInput(input: LocatedFlexLayoutInput): LocatedFlexLayoutInput {
  return Object.freeze({
    ...input,
    source: Object.freeze({ ...input.source }),
    nameSource: Object.freeze({ ...input.nameSource }),
    ...(input.valueSource === undefined ? {} : { valueSource: Object.freeze({ ...input.valueSource }) }),
  });
}

function normalizedAbsolutePath(value: string): string {
  return path.normalize(path.resolve(value));
}

function internalInvariant(message: string, paths: readonly string[]): MigrationApplicationError {
  return new MigrationApplicationError('internal-invariant', message, paths);
}
