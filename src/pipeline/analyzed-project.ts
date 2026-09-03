import * as path from 'node:path';
import type { LocatedFlexLayoutInput } from '../analyzer/flex-layout-attribute.analyzer';
import { MigrationApplicationError } from '../migrator/migration-application.error';
import type { SourceRange, TemplateAttribute, TemplateElement, TemplateParseResult } from '../template/template.model';
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
  if (project.templates.length !== manifest.templates.length) {
    throw sequenceInvariant();
  }
  const templates = project.templates.map((template, index) => {
    const file = manifestTemplateAt(manifest, template.file, index);
    if (template.status === 'parse-error') {
      return Object.freeze({
        status: template.status,
        file,
        source: template.source,
        parseResult: freezeParseErrorResult(template.parseResult),
      });
    }

    return Object.freeze({
      status: template.status,
      file,
      source: template.source,
      parseResult: freezeParsedResult(template.parseResult),
      inputs: Object.freeze(template.inputs.map(input => freezeLocatedInput(input))),
    });
  });

  return Object.freeze({ manifest, templates: Object.freeze(templates) });
}

function freezeParsedResult(
  result: Extract<TemplateParseResult, { readonly status: 'parsed' }>,
): Extract<TemplateParseResult, { readonly status: 'parsed' }> {
  return Object.freeze({
    status: result.status,
    elements: Object.freeze(result.elements.map(element => freezeTemplateElement(element))),
  });
}

function freezeTemplateElement(element: TemplateElement): TemplateElement {
  return Object.freeze({
    id: element.id,
    name: element.name,
    source: freezeSourceRange(element.source),
    startTag: freezeSourceRange(element.startTag),
    ...(element.endTag === undefined ? {} : { endTag: freezeSourceRange(element.endTag) }),
    structural: element.structural,
    attributes: Object.freeze(element.attributes.map(attribute => freezeTemplateAttribute(attribute))),
    ...(element.parentId === undefined ? {} : { parentId: element.parentId }),
  });
}

function freezeTemplateAttribute(attribute: TemplateAttribute): TemplateAttribute {
  return Object.freeze({
    name: attribute.name,
    rawName: attribute.rawName,
    rawValue: attribute.rawValue,
    value: attribute.value,
    binding: attribute.binding,
    ...(attribute.bindingTarget === undefined ? {} : { bindingTarget: attribute.bindingTarget }),
    source: freezeSourceRange(attribute.source),
    nameSource: freezeSourceRange(attribute.nameSource),
    ...(attribute.valueSource === undefined ? {} : { valueSource: freezeSourceRange(attribute.valueSource) }),
  });
}

function freezeSourceRange(source: SourceRange): SourceRange {
  return Object.freeze({ start: source.start, end: source.end });
}

function freezeParseErrorResult(
  result: Extract<TemplateParseResult, { readonly status: 'parse-error' }>,
): Extract<TemplateParseResult, { readonly status: 'parse-error' }> {
  return Object.freeze({
    status: result.status,
    diagnostics: Object.freeze(
      result.diagnostics.map(diagnostic =>
        Object.freeze({
          ...diagnostic,
          source: Object.freeze({ ...diagnostic.source }),
        }),
      ),
    ),
  });
}

function manifestTemplateAt(manifest: ProjectManifest, candidate: ManifestTemplate, index: number): ManifestTemplate {
  const expected = manifest.templates[index];
  if (expected === undefined || !samePathPair(expected, candidate)) {
    throw sequenceInvariant([candidate.inputPath, candidate.outputPath]);
  }
  return expected;
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

function sequenceInvariant(paths: readonly string[] = []): MigrationApplicationError {
  return internalInvariant(
    'Analyzed project templates must match its manifest one-to-one and in the same order.',
    paths,
  );
}

function internalInvariant(message: string, paths: readonly string[] = []): MigrationApplicationError {
  return new MigrationApplicationError('internal-invariant', message, paths);
}
