import { describe, expect, test } from 'vitest';
import type { MigrationApplication } from '../report/migration-report';
import { analyzedProject, type AnalyzedProject } from './analyzed-project';
import { appliedProject } from './applied-project';
import {
  MigrationPipeline,
  type AnalyzeStage,
  type ApplyStage,
  type DiscoverStage,
  type RenderStage,
  type ValidateStage,
} from './migration-pipeline';
import { PipelineStageError, type PipelineStageName } from './pipeline-stage.error';
import {
  migrationInvocation,
  projectManifest,
  type MigrationInvocation,
  type ProjectManifest,
} from './project-manifest';
import { renderedProject, type RenderedProject } from './rendered-project';
import { validatedProjectPlan, type ValidatedProjectPlan } from './validated-project-plan';

interface PipelineFixtures {
  readonly invocation: MigrationInvocation;
  readonly manifest: ProjectManifest;
  readonly analyzed: AnalyzedProject;
  readonly rendered: RenderedProject;
  readonly validated: ValidatedProjectPlan;
  readonly application: MigrationApplication;
}

function fixtures(): PipelineFixtures {
  const invocation = migrationInvocation({
    inputPath: 'fixtures/source',
    outputPath: 'fixtures/output',
    options: { mode: 'plan' },
  });
  const manifest = projectManifest({ invocation, templates: [] });
  const analyzed = analyzedProject({ manifest, templates: [] });
  const rendered = renderedProject({ analyzed, target: 'tailwind', files: [], session: { target: 'tailwind' } });
  const validated = validatedProjectPlan({ rendered, plan: { target: 'tailwind', files: [], artifacts: [] } });
  const application: MigrationApplication = { status: 'applied' };

  return { invocation, manifest, analyzed, rendered, validated, application };
}

interface RecordingStages {
  readonly calls: string[];
  discover: DiscoverStage;
  analyze: AnalyzeStage;
  render: RenderStage;
  validate: ValidateStage;
  apply: ApplyStage;
}

function recordingStages(values: PipelineFixtures): RecordingStages {
  const calls: string[] = [];

  return {
    calls,
    discover: {
      run(invocation) {
        calls.push('discover');
        expect(invocation).toBe(values.invocation);
        return Promise.resolve(values.manifest);
      },
    },
    analyze: {
      run(manifest) {
        calls.push('analyze');
        expect(manifest).toBe(values.manifest);
        return Promise.resolve(values.analyzed);
      },
    },
    render: {
      run(analyzed) {
        calls.push('render');
        expect(analyzed).toBe(values.analyzed);
        return Promise.resolve(values.rendered);
      },
    },
    validate: {
      run(rendered) {
        calls.push('validate');
        expect(rendered).toBe(values.rendered);
        return Promise.resolve(values.validated);
      },
    },
    apply: {
      run(validated) {
        calls.push('apply');
        expect(validated).toBe(values.validated);
        return Promise.resolve(appliedProject({ validated, application: values.application }));
      },
    },
  };
}

function pipeline(stages: RecordingStages): MigrationPipeline {
  return new MigrationPipeline(stages.discover, stages.analyze, stages.render, stages.validate, stages.apply);
}

describe('MigrationPipeline', () => {
  test('runs every stage once in order, hands off exact stage values, and freezes the result', async () => {
    const values = fixtures();
    const stages = recordingStages(values);

    const result = await pipeline(stages).run(values.invocation);

    expect(stages.calls).toEqual(['discover', 'analyze', 'render', 'validate', 'apply']);
    expect(result.validated).toBe(values.validated);
    expect(result.application).toEqual(values.application);
    expect(result.application).not.toBe(values.application);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.application)).toBe(true);
  });

  test.each([
    ['discover', 'synchronous throw'],
    ['analyze', 'synchronous throw'],
    ['render', 'synchronous throw'],
    ['validate', 'synchronous throw'],
    ['apply', 'synchronous throw'],
    ['discover', 'promise rejection'],
    ['analyze', 'promise rejection'],
    ['render', 'promise rejection'],
    ['validate', 'promise rejection'],
    ['apply', 'promise rejection'],
  ] as const)('wraps a %s %s once and skips all following stages', async (stage, failureMode) => {
    const values = fixtures();
    const stages = recordingStages(values);
    const cause = { stage, failureMode };
    replaceWithFailingStage(stages, stage, cause, failureMode);

    await expect(pipeline(stages).run(values.invocation)).rejects.toMatchObject({
      name: 'PipelineStageError',
      message: `Migration pipeline ${stage} stage failed.`,
      stage,
      cause,
    });
    expect(stages.calls).toEqual(
      ['discover', 'analyze', 'render', 'validate', 'apply'].slice(0, stageIndex(stage) + 1),
    );
  });

  test('passes through an existing PipelineStageError without wrapping it again', async () => {
    const values = fixtures();
    const stages = recordingStages(values);
    const error = new PipelineStageError('render', new Error('original failure'));
    stages.render = {
      run() {
        stages.calls.push('render');
        throw error;
      },
    };

    await expect(pipeline(stages).run(values.invocation)).rejects.toBe(error);
    expect(stages.calls).toEqual(['discover', 'analyze', 'render']);
  });
});

function stageIndex(stage: PipelineStageName): number {
  return ['discover', 'analyze', 'render', 'validate', 'apply'].indexOf(stage);
}

function replaceWithFailingStage(
  stages: RecordingStages,
  stage: PipelineStageName,
  cause: unknown,
  failureMode: 'synchronous throw' | 'promise rejection',
): void {
  const failingStage = {
    run() {
      stages.calls.push(stage);
      if (failureMode === 'synchronous throw') throw cause;
      return Promise.reject(cause);
    },
  };

  switch (stage) {
    case 'discover':
      stages.discover = failingStage;
      return;
    case 'analyze':
      stages.analyze = failingStage;
      return;
    case 'render':
      stages.render = failingStage;
      return;
    case 'validate':
      stages.validate = failingStage;
      return;
    case 'apply':
      stages.apply = failingStage;
      return;
  }
}
