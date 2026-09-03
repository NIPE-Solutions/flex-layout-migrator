import type { MigrationApplication } from '../report/migration-report';
import type { AnalyzedProject } from './analyzed-project';
import { PipelineStageError } from './pipeline-stage.error';
import type { MigrationInvocation, ProjectManifest } from './project-manifest';
import type { RenderedProject } from './rendered-project';
import type { ValidatedProjectPlan } from './validated-project-plan';

export type PipelineStageName = 'discover' | 'analyze' | 'render' | 'validate' | 'apply';

export interface DiscoverStage {
  run(invocation: MigrationInvocation): Promise<ProjectManifest>;
}

export interface AnalyzeStage {
  run(manifest: ProjectManifest): Promise<AnalyzedProject>;
}

export interface RenderStage {
  run(analyzed: AnalyzedProject): Promise<RenderedProject>;
}

export interface ValidateStage {
  run(rendered: RenderedProject): Promise<ValidatedProjectPlan>;
}

export interface ApplyStageResult {
  readonly application: MigrationApplication;
}

export interface ApplyStage {
  run(plan: ValidatedProjectPlan): Promise<ApplyStageResult>;
}

export interface MigrationPipelineResult {
  readonly validated: ValidatedProjectPlan;
  readonly application: MigrationApplication;
}

export class MigrationPipeline {
  constructor(
    private readonly discover: DiscoverStage,
    private readonly analyze: AnalyzeStage,
    private readonly render: RenderStage,
    private readonly validate: ValidateStage,
    private readonly apply: ApplyStage,
  ) {}

  public async run(invocation: MigrationInvocation): Promise<MigrationPipelineResult> {
    const manifest = await runStage('discover', () => this.discover.run(invocation));
    const analyzed = await runStage('analyze', () => this.analyze.run(manifest));
    const rendered = await runStage('render', () => this.render.run(analyzed));
    const validated = await runStage('validate', () => this.validate.run(rendered));
    const applied = await runStage('apply', () => this.apply.run(validated));

    return Object.freeze({ validated, application: Object.freeze({ ...applied.application }) });
  }
}

async function runStage<T>(stage: PipelineStageName, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error: unknown) {
    if (error instanceof PipelineStageError) throw error;
    throw new PipelineStageError(stage, error);
  }
}
