import type { ConversionAdapter } from '../adapter/conversion-adapter';
import type { ConversionResult } from '../analyzer/conversion-result';
import type { TemplateParser } from '../pipeline/analyze/template-parser.port';
import type { AnalyzedTemplate } from '../pipeline/analyzed-project';
import { DefaultCompatibilityEditValidator } from '../pipeline/render/compatibility-edit.validator';
import { ConversionPlanner } from '../planner/conversion-planner';
import { AngularTemplateParser } from '../template/angular-template.parser';
import { fileMigrationResult, type FileMigrationOptions, type FileMigrationResult } from './file-migration-result';
import { nodeDestinationTemplateSource, type DestinationTemplateSource } from './destination-template-source';
import { fileMigrationPlan, type FileMigrationPlan } from './migration-plan';

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
    return new DefaultCompatibilityEditValidator(
      this.dependencies.validationParser,
      this.destinationTemplates,
    ).validate(this.template, conversionPlan);
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
