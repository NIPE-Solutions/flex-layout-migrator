import { readFile } from 'node:fs/promises';
import type { ConversionAdapter } from '../adapter/conversion-adapter';
import type { ConversionResult } from '../analyzer/conversion-result';
import { TemplateAnalyzer } from '../analyzer/template.analyzer';
import { SourceEditor } from '../edit/source-editor';
import { AtomicFileWriter } from '../lib/atomic-file.writer';
import { ConversionPlanner } from '../planner/conversion-planner';
import { AngularTemplateParser } from '../template/angular-template.parser';
import { BaseMigrator } from './base.migrator';
import type { FileMigrationOptions, FileMigrationResult } from './file-migration-result';

export class FileMigrator extends BaseMigrator<FileMigrationResult> {
  constructor(
    private readonly adapter: ConversionAdapter,
    private readonly input: string,
    private readonly output: string,
    private readonly writer: AtomicFileWriter = new AtomicFileWriter(),
  ) {
    super();
  }

  public async migrate(options: FileMigrationOptions = { write: true }): Promise<FileMigrationResult> {
    const source = await readFile(this.input, 'utf8');
    const parsed = new AngularTemplateParser().parse(source, this.input);
    if (parsed.status === 'parse-error') {
      const results: readonly ConversionResult[] = parsed.diagnostics.map(diagnostic => ({
        status: 'parse-error',
        fileName: this.input,
        code: 'template-parse-error',
        reason: diagnostic.message,
        source: diagnostic.source,
      }));
      return this.result(false, results);
    }

    const inputs = new TemplateAnalyzer().analyze(this.input, parsed.elements);
    if (!inputs.length) {
      return this.result(false, []);
    }

    const plan = new ConversionPlanner().plan(source, parsed.elements, inputs, this.adapter);
    const edited = new SourceEditor().apply(source, plan.edits);
    if (edited.status === 'invalid') {
      throw new Error(
        `Invalid edit plan for ${this.input}: ${edited.diagnostics.map(item => item.message).join('; ')}`,
      );
    }

    const changed = edited.output !== source;
    if (changed && options.write) {
      await this.writer.write(this.output, edited.output);
    }

    return this.result(changed, plan.results);
  }

  private result(changed: boolean, results: readonly ConversionResult[]): FileMigrationResult {
    return {
      inputPath: this.input,
      outputPath: this.output,
      changed,
      results: [...results],
    };
  }
}
