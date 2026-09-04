import type { ConversionResult } from '../../analyzer/conversion-result';
import { ConversionPlanner, type ConversionPlanningOptions, type FilePlan } from '../../planner/conversion-planner';
import type { ConversionRenderer } from '../../render/conversion-renderer';
import type { RenderSession } from '../../render/render-session';
import type { AnalyzedTemplate, AnalyzedProject } from '../analyzed-project';
import type { RenderStage } from '../migration-pipeline';
import { renderedProject, type RenderedProject, type RenderedTemplateFile } from '../rendered-project';

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
  ) {}

  public async run(analyzed: AnalyzedProject): Promise<RenderedProject> {
    const files: RenderedTemplateFile[] = [];
    const options: ConversionPlanningOptions = {
      responsiveImages: analyzed.manifest.invocation.options.responsiveImages ?? false,
    };

    for (const template of analyzed.templates) {
      if (template.status === 'parse-error') {
        files.push(parseErrorPlan(template));
        continue;
      }

      const plan = this.templatePlanner.plan(template, this.session.renderer, options);
      files.push({
        inputPath: template.file.inputPath,
        outputPath: template.file.outputPath,
        edits: plan.edits,
        results: plan.results,
      });
    }

    const finalizedSession = this.session.finalize();
    return renderedProject({ analyzed, target: this.session.renderer.target, files, session: finalizedSession });
  }
}

function parseErrorPlan(template: Extract<AnalyzedTemplate, { readonly status: 'parse-error' }>): RenderedTemplateFile {
  const results: readonly ConversionResult[] = template.parseResult.diagnostics.map(diagnostic => ({
    status: 'parse-error',
    fileName: template.file.inputPath,
    code: 'template-parse-error',
    reason: diagnostic.message,
    source: diagnostic.source,
  }));
  return {
    inputPath: template.file.inputPath,
    outputPath: template.file.outputPath,
    edits: [],
    results,
  };
}
