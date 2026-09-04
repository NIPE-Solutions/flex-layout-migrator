import * as path from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import type { MigrationReport } from '../report/migration-report';
import { MigrationReportBuilder } from '../report/migration-report.builder';
import { analyzedProject, type AnalyzedProject } from './analyzed-project';
import { appliedProject, type AppliedProject } from './applied-project';
import {
  MigrationPipeline,
  type AnalyzeStage,
  type ApplyStage,
  type DiscoverStage,
  type RenderStage,
  type ValidateStage,
} from './migration-pipeline';
import { MigrationRunner } from './migration-runner';
import { migrationInvocation, projectManifest, type MigrationInvocation } from './project-manifest';
import { renderedProject, type RenderedProject } from './rendered-project';
import { validatedProjectPlan, type ValidatedProjectPlan } from './validated-project-plan';

interface RunnerFixtures {
  readonly invocation: MigrationInvocation;
  readonly analyzed: AnalyzedProject;
  readonly rendered: RenderedProject;
  readonly validated: ValidatedProjectPlan;
  readonly applied: AppliedProject;
}

function fixtures(application: AppliedProject['application'] = { status: 'applied' }): RunnerFixtures {
  const invocation = migrationInvocation({
    inputPath: 'fixtures/input.html',
    outputPath: 'fixtures/output.html',
    options: { mode: application.status === 'applied' ? 'write' : 'plan' },
  });
  const manifest = projectManifest({
    invocation,
    templates: [{ inputPath: invocation.inputPath, outputPath: invocation.outputPath }],
  });
  const analyzed = analyzedProject({
    manifest,
    templates: [
      {
        status: 'parsed',
        file: manifest.templates[0]!,
        source: '<div></div>',
        parseResult: { status: 'parsed', elements: [] },
        inputs: [],
      },
    ],
  });
  const rendered = renderedProject({
    analyzed,
    target: 'tailwind',
    files: [
      {
        inputPath: manifest.templates[0]!.inputPath,
        outputPath: manifest.templates[0]!.outputPath,
        edits: [],
        results: [],
      },
    ],
    session: { target: 'tailwind' },
  });
  const validated = validatedProjectPlan({
    rendered,
    plan: {
      target: 'tailwind',
      files: [
        {
          inputPath: rendered.files[0]!.inputPath,
          outputPath: rendered.files[0]!.outputPath,
          changed: false,
          results: [],
        },
      ],
      artifacts: [],
    },
  });

  return { invocation, analyzed, rendered, validated, applied: appliedProject({ validated, application }) };
}

function stages(values: RunnerFixtures, calls: string[]) {
  const discover: DiscoverStage = {
    async run(invocation) {
      calls.push('discover');
      expect(invocation).toBe(values.invocation);
      return values.analyzed.manifest;
    },
  };
  const analyze: AnalyzeStage = {
    async run(manifest) {
      calls.push('analyze');
      expect(manifest).toBe(values.analyzed.manifest);
      return values.analyzed;
    },
  };
  const render: RenderStage = {
    async run(analyzed) {
      calls.push('render');
      expect(analyzed).toBe(values.analyzed);
      return values.rendered;
    },
  };
  const validate: ValidateStage = {
    async prevalidate(invocation) {
      expect(invocation).toBe(values.invocation);
    },
    async run(rendered) {
      calls.push('validate');
      expect(rendered).toBe(values.rendered);
      return values.validated;
    },
  };
  const apply: ApplyStage = {
    async run(validated) {
      calls.push('apply');
      expect(validated).toBe(values.validated);
      return values.applied;
    },
  };

  return { discover, analyze, render, validate, apply };
}

function expectedReport(durationMs = 375): MigrationReport {
  return {
    schemaVersion: 2,
    mode: 'write',
    target: 'tailwind',
    application: { status: 'applied' },
    input: 'input.html',
    output: 'output.html',
    durationMs,
    summary: {
      filesScanned: 1,
      filesChanged: 0,
      converted: 0,
      review: 0,
      unsupported: 0,
      invalid: 0,
      parseErrors: 0,
    },
    files: [{ path: 'input.html', changed: false, results: [] }],
  };
}

describe('MigrationRunner', () => {
  test('runs the five-stage route exactly once in order and builds the existing report', async () => {
    const values = fixtures();
    const calls: string[] = [];
    const route = stages(values, calls);
    const clock = [1000, 1375];
    const now = vi.fn(() => {
      const value = clock.shift();
      if (value === undefined) throw new Error('The invocation clock must be read exactly twice.');
      return value;
    });

    const report = await new MigrationRunner(
      new MigrationPipeline(route.discover, route.analyze, route.render, route.validate, route.apply),
      new MigrationReportBuilder(),
      now,
    ).run(values.invocation);

    expect(calls).toEqual(['discover', 'analyze', 'render', 'validate', 'apply']);
    expect(now).toHaveBeenCalledTimes(2);
    expect(report).toEqual(expectedReport());
  });

  test('remaps a failed pre-application stage to the raw invocation path without retrying', async () => {
    const values = fixtures();
    const rawPath = path.join(values.invocation.inputPath, 'nested', 'card.html');
    const canonicalPath = path.join(values.invocation.canonicalInputPath, 'nested', 'card.html');
    const failure = Object.assign(new Error(`ENOENT: no such file or directory, open '${canonicalPath}'`), {
      code: 'ENOENT',
      path: canonicalPath,
    });
    const calls: string[] = [];
    const route = stages(values, calls);
    route.analyze.run = async () => {
      calls.push('analyze');
      throw failure;
    };

    const error = await rejectedError(
      new MigrationRunner(
        new MigrationPipeline(route.discover, route.analyze, route.render, route.validate, route.apply),
      ).run(values.invocation),
    );

    expect(error).toBe(failure);
    expect(error.message).toBe(`ENOENT: no such file or directory, open '${rawPath}'`);
    expect((error as NodeJS.ErrnoException).path).toBe(rawPath);
    expect(calls).toEqual(['discover', 'analyze']);
  });

  test('preserves absolute application failures and does not construct a report', async () => {
    const values = fixtures();
    const calls: string[] = [];
    const route = stages(values, calls);
    const source = path.join(values.invocation.canonicalOutputPath, 'nested', 'card.html.tmp');
    const destination = path.join(values.invocation.canonicalOutputPath, 'nested', 'card.html');
    const failure = Object.assign(new Error(`EACCES: permission denied, rename '${source}' -> '${destination}'`), {
      code: 'EACCES',
      path: source,
      dest: destination,
    });
    route.apply.run = async () => {
      calls.push('apply');
      throw failure;
    };
    const reportBuilder = {
      build(): never {
        throw new Error('Application failure must prevent report construction.');
      },
    };

    const error = await rejectedError(
      new MigrationRunner(
        new MigrationPipeline(route.discover, route.analyze, route.render, route.validate, route.apply),
        reportBuilder,
      ).run(values.invocation),
    );

    expect(error).toBe(failure);
    expect((error as NodeJS.ErrnoException).path).toBe(source);
    expect((error as NodeJS.ErrnoException & { dest?: string }).dest).toBe(destination);
    expect(calls).toEqual(['discover', 'analyze', 'render', 'validate', 'apply']);
  });

  test('cannot change a completed application decision when report construction fails', async () => {
    const values = fixtures();
    const failure = new Error('reporter failed');
    const reportBuilder = {
      build() {
        throw failure;
      },
    };

    await expect(
      new MigrationRunner({ run: async () => values.applied }, reportBuilder, () => 0).run(values.invocation),
    ).rejects.toBe(failure);
    expect(values.applied.application).toEqual({ status: 'applied' });
    expect(Object.isFrozen(values.applied.application)).toBe(true);
  });
});

async function rejectedError(action: Promise<unknown>): Promise<Error> {
  try {
    await action;
  } catch (error: unknown) {
    if (error instanceof Error) return error;
    throw new Error('Expected an Error rejection.', { cause: error });
  }
  throw new Error('Expected the action to reject.');
}
