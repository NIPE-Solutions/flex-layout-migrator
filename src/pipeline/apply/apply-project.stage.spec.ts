import * as path from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { analyzedProject } from '../analyzed-project';
import { projectManifest } from '../project-manifest';
import { renderedProject } from '../rendered-project';
import { validatedProjectPlan, type ValidatedProjectPlan } from '../validated-project-plan';
import { ApplyProjectStage, type MigrationTransactionPort } from './apply-project.stage';

describe('ApplyProjectStage', () => {
  test.each([
    ['plan', false, 'skipped', 'plan-only', 1, 0],
    ['write', true, 'skipped', 'parse-errors', 0, 0],
    ['write', false, 'applied', undefined, 1, 1],
  ] as const)(
    'applies the canonical validated plan for %s mode',
    async (mode, parseErrors, status, reason, preflights, applies) => {
      const transaction = transactionSpy();
      const validated = validatedFixture({ parseErrors, mode });

      const result = await new ApplyProjectStage(mode, transaction).run(validated);

      expect(result.validated).toBe(validated);
      expect(result.application).toEqual(reason ? { status, reason } : { status });
      expect(transaction.preflight).toHaveBeenCalledTimes(preflights);
      expect(transaction.apply).toHaveBeenCalledTimes(applies);
      if (preflights > 0) expect(transaction.preflight.mock.calls[0]?.[0]).toBe(validated.plan);
      if (applies > 0) expect(transaction.apply.mock.calls[0]?.[0]).toBe(validated.plan);
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.application)).toBe(true);
    },
  );

  test('reports an artifact-free write as applied after preflight without invoking mutation', async () => {
    const transaction = transactionSpy();
    const validated = validatedFixture({ parseErrors: false, artifacts: false });

    const result = await new ApplyProjectStage('write', transaction).run(validated);

    expect(result.application).toEqual({ status: 'applied' });
    expect(transaction.preflight).toHaveBeenCalledWith(validated.plan);
    expect(transaction.apply).not.toHaveBeenCalled();
  });

  test('keeps plan mode plan-only when stored parse diagnostics make preflight illegal', async () => {
    const transaction = transactionSpy();
    const validated = validatedFixture({ parseErrors: true, mode: 'plan' });

    const result = await new ApplyProjectStage('plan', transaction).run(validated);

    expect(result.application).toEqual({ status: 'skipped', reason: 'plan-only' });
    expect(transaction.preflight).not.toHaveBeenCalled();
    expect(transaction.apply).not.toHaveBeenCalled();
  });

  test.each([
    ['plan', 'write'],
    ['write', 'plan'],
  ] as const)(
    'rejects constructor mode %s when the canonical manifest mode is %s before transaction work',
    async (stageMode, manifestMode) => {
      const transaction = transactionSpy();
      const validated = validatedFixture({ parseErrors: false, mode: manifestMode });

      await expect(new ApplyProjectStage(stageMode, transaction).run(validated)).rejects.toMatchObject({
        code: 'internal-invariant',
        message: `Apply stage mode "${stageMode}" differs from validated manifest mode "${manifestMode}".`,
        paths: [],
      });
      expect(transaction.preflight).not.toHaveBeenCalled();
      expect(transaction.apply).not.toHaveBeenCalled();
    },
  );
});

function transactionSpy(): MigrationTransactionPort & {
  preflight: ReturnType<typeof vi.fn<MigrationTransactionPort['preflight']>>;
  apply: ReturnType<typeof vi.fn<MigrationTransactionPort['apply']>>;
} {
  return {
    preflight: vi.fn<MigrationTransactionPort['preflight']>().mockResolvedValue(undefined),
    apply: vi.fn<MigrationTransactionPort['apply']>().mockResolvedValue(undefined),
  };
}

function validatedFixture(options: {
  readonly parseErrors: boolean;
  readonly artifacts?: boolean;
  readonly mode?: 'plan' | 'write';
}): ValidatedProjectPlan {
  const inputPath = path.resolve('input/card.html');
  const outputPath = path.resolve('output/card.html');
  const manifest = projectManifest({
    invocation: { inputPath, outputPath, options: { mode: options.mode ?? 'write' } },
    templates: [{ inputPath, outputPath }],
  });
  const diagnostic = { message: 'Unexpected closing tag', source: { start: 0, end: 1 } };
  const analyzed = analyzedProject({
    manifest,
    templates: options.parseErrors
      ? [
          {
            status: 'parse-error',
            file: manifest.templates[0]!,
            source: '<div',
            parseResult: { status: 'parse-error', diagnostics: [diagnostic] },
          },
        ]
      : [
          {
            status: 'parsed',
            file: manifest.templates[0]!,
            source: '<div></div>',
            parseResult: { status: 'parsed', elements: [] },
            inputs: [],
          },
        ],
  });
  const results = options.parseErrors
    ? [
        {
          status: 'parse-error' as const,
          fileName: inputPath,
          code: 'template-parse-error' as const,
          reason: diagnostic.message,
          source: diagnostic.source,
        },
      ]
    : [];
  const rendered = renderedProject({
    analyzed,
    target: 'tailwind',
    files: [{ inputPath, outputPath, edits: [], results }],
    session: { target: 'tailwind' },
  });
  const artifacts =
    options.parseErrors || options.artifacts === false
      ? []
      : [
          {
            kind: 'template' as const,
            path: outputPath,
            original: { status: 'absent' as const },
            proposed: { status: 'present' as const, contents: '<div></div>' },
          },
        ];
  return validatedProjectPlan({
    rendered,
    plan: {
      target: 'tailwind',
      files: [{ inputPath, outputPath, changed: artifacts.length > 0, results }],
      artifacts,
    },
  });
}
