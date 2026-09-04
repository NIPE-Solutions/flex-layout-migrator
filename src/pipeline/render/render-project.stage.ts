import type { ConversionResult } from '../../analyzer/conversion-result';
import { fileMigrationPlan, type FileMigrationPlan } from '../../migrator/migration-plan';
import { ConversionPlanner, type ConversionPlanningOptions, type FilePlan } from '../../planner/conversion-planner';
import type { ConversionRenderer } from '../../render/conversion-renderer';
import type { RenderSession } from '../../render/render-session';
import type { AnalyzedTemplate, AnalyzedProject } from '../analyzed-project';
import type { RenderStage } from '../migration-pipeline';
import { renderedProject, type RenderedProject } from '../rendered-project';
import { DefaultCompatibilityEditValidator, type CompatibilityEditValidator } from './compatibility-edit.validator';

export interface RenderTemplatePlanner {
  plan(
    template: Extract<AnalyzedTemplate, { readonly status: 'parsed' }>,
    renderer: ConversionRenderer,
    options: ConversionPlanningOptions,
  ): FilePlan;
}

const defaultTemplatePlanner: RenderTemplatePlanner = Object.freeze({
  plan(
    template: Extract<AnalyzedTemplate, { readonly status: 'parsed' }>,
    renderer: ConversionRenderer,
    options: ConversionPlanningOptions,
  ): FilePlan {
    return new ConversionPlanner().plan(
      template.source,
      template.parseResult.elements,
      template.inputs,
      renderer,
      options,
    );
  },
});

export class RenderProjectStage implements RenderStage {
  constructor(
    private readonly session: RenderSession,
    private readonly templatePlanner: RenderTemplatePlanner = defaultTemplatePlanner,
    private readonly editValidator: CompatibilityEditValidator = new DefaultCompatibilityEditValidator(),
  ) {}

  public async run(analyzed: AnalyzedProject): Promise<RenderedProject> {
    const files: FileMigrationPlan[] = [];
    const options: ConversionPlanningOptions = {
      responsiveImages: analyzed.manifest.invocation.options.responsiveImages ?? false,
    };

    for (const template of analyzed.templates) {
      if (template.status === 'parse-error') {
        files.push(parseErrorPlan(template));
        continue;
      }

      const plan = this.templatePlanner.plan(template, this.session.renderer, options);
      files.push(await this.editValidator.validate(template, plan));
    }

    return renderedProject({ analyzed, files, session: this.session.finalize() });
  }
}

function parseErrorPlan(template: Extract<AnalyzedTemplate, { readonly status: 'parse-error' }>): FileMigrationPlan {
  const results: readonly ConversionResult[] = template.parseResult.diagnostics.map(diagnostic => ({
    status: 'parse-error',
    fileName: template.file.inputPath,
    code: 'template-parse-error',
    reason: diagnostic.message,
    source: diagnostic.source,
  }));
  return fileMigrationPlan({
    file: {
      inputPath: template.file.inputPath,
      outputPath: template.file.outputPath,
      changed: false,
      results,
    },
  });
}
