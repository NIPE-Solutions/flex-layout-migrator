import * as path from 'node:path';
import type { ConversionAdapter } from '../adapter/conversion-adapter';
import type { ConversionResult } from '../analyzer/conversion-result';
import { SourceEditor } from '../edit/source-editor';
import type { TemplateParser } from '../pipeline/analyze/template-parser.port';
import type { AnalyzedTemplate } from '../pipeline/analyzed-project';
import { ConversionPlanner } from '../planner/conversion-planner';
import { AngularTemplateParser } from '../template/angular-template.parser';
import { fileMigrationResult, type FileMigrationOptions, type FileMigrationResult } from './file-migration-result';
import { nodeDestinationTemplateSource, type DestinationTemplateSource } from './destination-template-source';
import { fileMigrationPlan, plannedOutputArtifact, type ArtifactState, type FileMigrationPlan } from './migration-plan';

export interface AnalyzedFileMigratorDependencies {
  readonly validationParser: TemplateParser;
  readonly planner: ConversionPlanner;
}

export class AnalyzedFileMigrator {
  constructor(
    private readonly adapter: ConversionAdapter,
    private readonly template: AnalyzedTemplate,
    private readonly dependencies: AnalyzedFileMigratorDependencies = defaultAnalyzedFileMigratorDependencies(),
    private readonly destinationTemplates: DestinationTemplateSource = nodeDestinationTemplateSource,
  ) {}

  public async plan(options: FileMigrationOptions = { responsiveImages: false }): Promise<FileMigrationPlan> {
    if (this.template.status === 'parse-error') {
      const results: readonly ConversionResult[] = this.template.parseResult.diagnostics.map(diagnostic => ({
        status: 'parse-error',
        fileName: this.template.file.inputPath,
        code: 'template-parse-error',
        reason: diagnostic.message,
        source: diagnostic.source,
      }));
      return this.planResult(false, results);
    }

    if (!this.template.inputs.length) {
      return this.planResult(false, []);
    }

    const conversionPlan = this.dependencies.planner.plan(
      this.template.source,
      this.template.parseResult.elements,
      this.template.inputs,
      this.adapter,
      { responsiveImages: options.responsiveImages ?? false },
    );
    const edited = new SourceEditor().apply(this.template.source, conversionPlan.edits);
    if (edited.status === 'invalid') {
      throw new Error(
        `Invalid edit plan for ${this.template.file.inputPath}: ${edited.diagnostics
          .map(item => item.message)
          .join('; ')}`,
      );
    }

    if (edited.output === this.template.source) {
      return this.planResult(false, conversionPlan.results);
    }

    const reparsed = this.dependencies.validationParser.parse(edited.output, this.template.file.outputPath);
    if (reparsed.status === 'parse-error') {
      return this.planResult(
        false,
        reparsed.diagnostics.map(diagnostic => ({
          status: 'parse-error' as const,
          fileName: this.template.file.outputPath,
          code: 'generated-template-parse-error' as const,
          reason: diagnostic.message,
          source: diagnostic.source,
        })),
      );
    }

    const original = await this.originalState();
    const proposed: ArtifactState = { status: 'present', contents: edited.output };
    if (sameState(original, proposed)) {
      return this.planResult(false, conversionPlan.results);
    }

    return fileMigrationPlan({
      file: this.result(true, conversionPlan.results),
      artifact: plannedOutputArtifact({
        kind: 'template',
        path: path.normalize(path.resolve(this.template.file.outputPath)),
        original,
        proposed,
      }),
    });
  }

  private async originalState(): Promise<ArtifactState> {
    if (path.resolve(this.template.file.inputPath) === path.resolve(this.template.file.outputPath)) {
      return { status: 'present', contents: this.template.source };
    }

    try {
      return { status: 'present', contents: await this.destinationTemplates.read(this.template.file.outputPath) };
    } catch (error: unknown) {
      if (isEnoent(error)) return { status: 'absent' };
      throw error;
    }
  }

  private planResult(changed: boolean, results: readonly ConversionResult[]): FileMigrationPlan {
    return fileMigrationPlan({ file: this.result(changed, results) });
  }

  private result(changed: boolean, results: readonly ConversionResult[]): FileMigrationResult {
    return fileMigrationResult({
      inputPath: this.template.file.inputPath,
      outputPath: this.template.file.outputPath,
      changed,
      results,
    });
  }
}

function defaultAnalyzedFileMigratorDependencies(): AnalyzedFileMigratorDependencies {
  return {
    validationParser: new AngularTemplateParser(),
    planner: new ConversionPlanner(),
  };
}

function isEnoent(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function sameState(left: ArtifactState, right: ArtifactState): boolean {
  if (left.status !== right.status) return false;
  if (left.status === 'absent') return true;
  return right.status === 'present' && left.contents === right.contents;
}
