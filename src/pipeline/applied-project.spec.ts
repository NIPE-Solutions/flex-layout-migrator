import { expect, test } from 'vitest';
import { analyzedProject } from './analyzed-project';
import { appliedProject } from './applied-project';
import { projectManifest } from './project-manifest';
import { renderedProject } from './rendered-project';
import { validatedProjectPlan } from './validated-project-plan';

test('owns and freezes the application outcome while preserving the canonical validated identity', () => {
  const manifest = projectManifest({
    invocation: { inputPath: 'input', outputPath: 'output', options: { mode: 'write' } },
    templates: [],
  });
  const analyzed = analyzedProject({ manifest, templates: [] });
  const rendered = renderedProject({ analyzed, target: 'tailwind', files: [], session: { target: 'tailwind' } });
  const validated = validatedProjectPlan({ rendered, plan: { target: 'tailwind', files: [], artifacts: [] } });
  const application = { status: 'skipped' as const, reason: 'plan-only' as const };

  const applied = appliedProject({ validated, application });

  expect(applied).toEqual({ validated, application });
  expect(applied.validated).toBe(validated);
  expect(applied.application).not.toBe(application);
  expect(Object.isFrozen(applied)).toBe(true);
  expect(Object.isFrozen(applied.application)).toBe(true);
});
