import { readFile } from 'node:fs/promises';
import type { ConversionAdapter } from '../adapter/conversion-adapter';
import { TemplateAnalyzer } from '../analyzer/template.analyzer';
import { analyzedProject, type AnalyzedTemplate } from '../pipeline/analyzed-project';
import { projectManifest } from '../pipeline/project-manifest';
import { ConversionPlanner } from '../planner/conversion-planner';
import { AngularTemplateParser } from '../template/angular-template.parser';
import { AnalyzedFileMigrator } from './analyzed-file.migrator';
import type { FileMigrationOptions } from './file-migration-result';
import type { FileMigrationPlan } from './migration-plan';

export interface FileMigratorDependencies {
  readonly readTemplate: (path: string) => Promise<string>;
  readonly parser: AngularTemplateParser;
  readonly analyzer: TemplateAnalyzer;
  readonly planner: ConversionPlanner;
}

/** @deprecated Task 4 replaces this analysis compatibility wrapper with the analyzed-template owner. */
export class FileMigrator {
  private readonly dependencies: FileMigratorDependencies;

  constructor(
    private readonly adapter: ConversionAdapter,
    private readonly input: string,
    private readonly output: string,
    parser?: AngularTemplateParser,
    dependencies: FileMigratorDependencies = defaultFileMigratorDependencies(),
  ) {
    this.dependencies = parser === undefined ? dependencies : { ...dependencies, parser };
  }

  public async plan(options: FileMigrationOptions = { responsiveImages: false }): Promise<FileMigrationPlan> {
    const source = await this.dependencies.readTemplate(this.input);
    const parsed = this.dependencies.parser.parse(source, this.input);
    const template = this.analyzedTemplate(source, parsed);

    return new AnalyzedFileMigrator(this.adapter, template, {
      readDestination: this.dependencies.readTemplate,
      validationParser: this.dependencies.parser,
      planner: this.dependencies.planner,
    }).plan(options);
  }

  private analyzedTemplate(source: string, parseResult: ReturnType<AngularTemplateParser['parse']>): AnalyzedTemplate {
    const manifest = projectManifest({
      invocation: { inputPath: this.input, outputPath: this.output, options: { mode: 'plan' } },
      templates: [{ inputPath: this.input, outputPath: this.output }],
    });
    const file = manifest.templates[0];
    if (file === undefined) throw new Error('Expected one compatibility manifest template.');
    const template: AnalyzedTemplate =
      parseResult.status === 'parse-error'
        ? { status: 'parse-error', file, source, parseResult }
        : {
            status: 'parsed',
            file,
            source,
            parseResult,
            inputs: this.dependencies.analyzer.analyze(file.inputPath, parseResult.elements),
          };
    const analyzed = analyzedProject({ manifest, templates: [template] }).templates[0];
    if (analyzed === undefined) throw new Error('Expected one compatibility analyzed template.');
    return analyzed;
  }
}

function defaultFileMigratorDependencies(): FileMigratorDependencies {
  return {
    readTemplate: path => readFile(path, 'utf8'),
    parser: new AngularTemplateParser(),
    analyzer: new TemplateAnalyzer(),
    planner: new ConversionPlanner(),
  };
}
