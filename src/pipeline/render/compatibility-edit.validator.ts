import * as path from 'node:path';
import type { ConversionResult } from '../../analyzer/conversion-result';
import { SourceEditor } from '../../edit/source-editor';
import { fileMigrationResult, type FileMigrationResult } from '../../migrator/file-migration-result';
import {
  nodeDestinationTemplateSource,
  type DestinationTemplateSource,
} from '../../migrator/destination-template-source';
import {
  fileMigrationPlan,
  plannedOutputArtifact,
  type ArtifactState,
  type FileMigrationPlan,
} from '../../migrator/migration-plan';
import type { FilePlan } from '../../planner/conversion-planner';
import { AngularTemplateParser } from '../../template/angular-template.parser';
import type { TemplateParser } from '../analyze/template-parser.port';
import type { AnalyzedTemplate } from '../analyzed-project';

/**
 * Temporary compatibility boundary. Slice 5 owns its removal after edit
 * validation has moved into the final application workflow.
 */
export interface CompatibilityEditValidator {
  validate(template: AnalyzedTemplate, plan: FilePlan): Promise<FileMigrationPlan>;
}

export class DefaultCompatibilityEditValidator implements CompatibilityEditValidator {
  constructor(
    private readonly validationParser: TemplateParser = new AngularTemplateParser(),
    private readonly destinationTemplates: DestinationTemplateSource = nodeDestinationTemplateSource,
  ) {}

  public async validate(template: AnalyzedTemplate, plan: FilePlan): Promise<FileMigrationPlan> {
    if (template.status !== 'parsed') {
      throw new Error('Compatibility edit validation requires a parsed template.');
    }

    const edited = new SourceEditor().apply(template.source, plan.edits);
    if (edited.status === 'invalid') {
      throw new Error(
        `Invalid edit plan for ${template.file.inputPath}: ${edited.diagnostics.map(item => item.message).join('; ')}`,
      );
    }

    if (edited.output === template.source) return planResult(template, false, plan.results);

    const reparsed = this.validationParser.parse(edited.output, template.file.outputPath);
    if (reparsed.status === 'parse-error') {
      return planResult(
        template,
        false,
        reparsed.diagnostics.map(diagnostic => ({
          status: 'parse-error' as const,
          fileName: template.file.outputPath,
          code: 'generated-template-parse-error' as const,
          reason: diagnostic.message,
          source: diagnostic.source,
        })),
      );
    }

    const original = await originalState(template, this.destinationTemplates);
    const proposed: ArtifactState = { status: 'present', contents: edited.output };
    if (sameState(original, proposed)) return planResult(template, false, plan.results);

    return fileMigrationPlan({
      file: result(template, true, plan.results),
      artifact: plannedOutputArtifact({
        kind: 'template',
        path: path.normalize(path.resolve(template.file.outputPath)),
        original,
        proposed,
      }),
    });
  }
}

async function originalState(
  template: Extract<AnalyzedTemplate, { readonly status: 'parsed' }>,
  destinationTemplates: DestinationTemplateSource,
): Promise<ArtifactState> {
  if (path.resolve(template.file.inputPath) === path.resolve(template.file.outputPath)) {
    return { status: 'present', contents: template.source };
  }

  try {
    return { status: 'present', contents: await destinationTemplates.read(template.file.outputPath) };
  } catch (error: unknown) {
    if (isEnoent(error)) return { status: 'absent' };
    throw error;
  }
}

function planResult(
  template: Extract<AnalyzedTemplate, { readonly status: 'parsed' }>,
  changed: boolean,
  results: readonly ConversionResult[],
): FileMigrationPlan {
  return fileMigrationPlan({ file: result(template, changed, results) });
}

function result(
  template: Extract<AnalyzedTemplate, { readonly status: 'parsed' }>,
  changed: boolean,
  results: readonly ConversionResult[],
): FileMigrationResult {
  return fileMigrationResult({
    inputPath: template.file.inputPath,
    outputPath: template.file.outputPath,
    changed,
    results,
  });
}

function isEnoent(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function sameState(left: ArtifactState, right: ArtifactState): boolean {
  if (left.status !== right.status) return false;
  if (left.status === 'absent') return true;
  return right.status === 'present' && left.contents === right.contents;
}
