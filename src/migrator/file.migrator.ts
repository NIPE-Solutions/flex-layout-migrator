import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { ConversionAdapter } from '../adapter/conversion-adapter';
import type { ConversionResult } from '../analyzer/conversion-result';
import { TemplateAnalyzer } from '../analyzer/template.analyzer';
import { SourceEditor } from '../edit/source-editor';
import { AtomicFileWriter } from '../lib/atomic-file.writer';
import { ConversionPlanner } from '../planner/conversion-planner';
import { AngularTemplateParser } from '../template/angular-template.parser';
import { BaseMigrator } from './base.migrator';

export class FileMigrator extends BaseMigrator {
  private results: readonly ConversionResult[] = [];

  constructor(
    protected override adapter: ConversionAdapter,
    private readonly input: string,
    private readonly output: string,
    private readonly writer: AtomicFileWriter = new AtomicFileWriter(),
  ) {
    super(adapter);
  }

  public async migrate(): Promise<readonly ConversionResult[]> {
    const fileName = basename(this.input);
    this.notifyObservers('fileStarted', { id: this.input, fileName });

    const source = await readFile(this.input, 'utf8');
    const parsed = new AngularTemplateParser().parse(source, this.input);
    if (parsed.status === 'parse-error') {
      this.results = parsed.diagnostics.map(diagnostic => ({
        status: 'parse-error',
        fileName: this.input,
        code: 'template-parse-error',
        reason: diagnostic.message,
        source: diagnostic.source,
      }));
      return this.getResults();
    }

    const inputs = new TemplateAnalyzer().analyze(this.input, parsed.elements);
    if (!inputs.length) {
      this.results = [];
      this.notifyObservers('fileNoElements', { id: this.input, fileName });
      return this.getResults();
    }

    const plan = new ConversionPlanner().plan(source, parsed.elements, inputs, this.adapter);
    const edited = new SourceEditor().apply(source, plan.edits);
    if (edited.status === 'invalid') {
      throw new Error(
        `Invalid edit plan for ${this.input}: ${edited.diagnostics.map(item => item.message).join('; ')}`,
      );
    }

    this.results = plan.results;
    for (const [index] of inputs.entries()) {
      this.notifyObservers('fileMigrationProgress', {
        id: this.input,
        fileName,
        percentage: Math.round(((index + 1) / inputs.length) * 100),
        processedElements: index + 1,
      });
    }

    if (edited.output !== source) {
      await this.writer.write(this.output, edited.output);
      this.notifyObservers('fileCompleted', { id: this.input, fileName });
    }

    return this.getResults();
  }

  public getResults(): readonly ConversionResult[] {
    return [...this.results];
  }
}
