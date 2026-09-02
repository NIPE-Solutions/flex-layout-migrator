import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { ConversionAdapter } from '../adapter/conversion-adapter';
import type { ConversionResult } from '../analyzer/conversion-result';
import { TemplateAnalyzer } from '../analyzer/template.analyzer';
import { SourceEditor } from '../edit/source-editor';
import { ConversionPlanner } from '../planner/conversion-planner';
import { AngularTemplateParser } from '../template/angular-template.parser';
import { fileMigrationResult, type FileMigrationOptions, type FileMigrationResult } from './file-migration-result';
import { fileMigrationPlan, plannedOutputArtifact, type ArtifactState, type FileMigrationPlan } from './migration-plan';

export class FileMigrator {
  constructor(
    private readonly adapter: ConversionAdapter,
    private readonly input: string,
    private readonly output: string,
    private readonly parser: AngularTemplateParser = new AngularTemplateParser(),
  ) {}

  public async plan(options: FileMigrationOptions = { responsiveImages: false }): Promise<FileMigrationPlan> {
    const source = await readFile(this.input, 'utf8');
    const parsed = this.parser.parse(source, this.input);
    if (parsed.status === 'parse-error') {
      const results: readonly ConversionResult[] = parsed.diagnostics.map(diagnostic => ({
        status: 'parse-error',
        fileName: this.input,
        code: 'template-parse-error',
        reason: diagnostic.message,
        source: diagnostic.source,
      }));
      return this.planResult(false, results);
    }

    const inputs = new TemplateAnalyzer().analyze(this.input, parsed.elements);
    if (!inputs.length) {
      return this.planResult(false, []);
    }

    const conversionPlan = new ConversionPlanner().plan(source, parsed.elements, inputs, this.adapter, {
      responsiveImages: options.responsiveImages ?? false,
    });
    const edited = new SourceEditor().apply(source, conversionPlan.edits);
    if (edited.status === 'invalid') {
      throw new Error(
        `Invalid edit plan for ${this.input}: ${edited.diagnostics.map(item => item.message).join('; ')}`,
      );
    }

    if (edited.output === source) {
      return this.planResult(false, conversionPlan.results);
    }

    const reparsed = this.parser.parse(edited.output, this.output);
    if (reparsed.status === 'parse-error') {
      return this.planResult(
        false,
        reparsed.diagnostics.map(diagnostic => ({
          status: 'parse-error' as const,
          fileName: this.output,
          code: 'generated-template-parse-error' as const,
          reason: diagnostic.message,
          source: diagnostic.source,
        })),
      );
    }

    const original = await this.originalState(source);
    const proposed: ArtifactState = { status: 'present', contents: edited.output };
    if (sameState(original, proposed)) {
      return this.planResult(false, conversionPlan.results);
    }

    return fileMigrationPlan({
      file: this.result(true, conversionPlan.results),
      artifact: plannedOutputArtifact({ kind: 'template', path: this.output, original, proposed }),
    });
  }

  private async originalState(source: string): Promise<ArtifactState> {
    if (path.resolve(this.input) === path.resolve(this.output)) {
      return { status: 'present', contents: source };
    }

    try {
      return { status: 'present', contents: await readFile(this.output, 'utf8') };
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
      inputPath: this.input,
      outputPath: this.output,
      changed,
      results,
    });
  }
}

function isEnoent(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function sameState(left: ArtifactState, right: ArtifactState): boolean {
  if (left.status !== right.status) return false;
  if (left.status === 'absent') return true;
  return right.status === 'present' && left.contents === right.contents;
}
