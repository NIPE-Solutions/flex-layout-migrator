import type { ConversionRenderer } from '../../render/conversion-renderer';
import type { AdapterSessionResult, RenderSession } from '../../render/render-session';
import { analyzedProject, type AnalyzedProject } from '../analyzed-project';
import { projectManifest } from '../project-manifest';
import { fileMigrationPlan, type FileMigrationPlan } from '../../migrator/migration-plan';
import type { RenderTemplatePlanner } from './render-project.stage';
import { RenderProjectStage } from './render-project.stage';

describe('RenderProjectStage', () => {
  test('renders parsed templates in analyzed order and finalizes once', async () => {
    const analyzed = parsedProject();
    const plannedPaths: string[] = [];
    const planner: RenderTemplatePlanner = {
      plan(template) {
        plannedPaths.push(template.file.inputPath);
        return { edits: [], results: [] };
      },
    };
    const validate = vi.fn(async template => unchangedPlan(template.file.inputPath, template.file.outputPath));
    const finalize = vi.fn(() => ({ target: 'tailwind' as const }));
    const stage = new RenderProjectStage(sessionDouble(finalize), planner, { validate });

    const rendered = await stage.run(analyzed);

    expect(plannedPaths).toEqual([
      '/project/input/first.html',
      '/project/input/second.html',
    ]);
    expect(finalize).toHaveBeenCalledOnce();
    expect(rendered.files.map(file => file.file.inputPath)).toEqual([
      '/project/input/first.html',
      '/project/input/second.html',
    ]);
    expect(validate).toHaveBeenCalledTimes(2);
    expect(Object.isFrozen(rendered)).toBe(true);
  });

  test('preserves stored parse diagnostics without invoking semantic or target rendering', async () => {
    const analyzed = parseErrorProject();
    const planner = { plan: vi.fn() } as unknown as RenderTemplatePlanner;
    const validate = vi.fn();
    const stage = new RenderProjectStage(sessionDouble(vi.fn(() => ({ target: 'tailwind' as const }))), planner, {
      validate,
    });

    const rendered = await stage.run(analyzed);

    expect(planner.plan).not.toHaveBeenCalled();
    expect(validate).not.toHaveBeenCalled();
    expect(rendered.files[0]?.file.results).toEqual([
      {
        status: 'parse-error',
        fileName: '/project/input/broken.html',
        code: 'template-parse-error',
        reason: 'Unexpected closing block',
        source: { start: 7, end: 9 },
      },
    ]);
  });

  test('does not finalize after a template render throws', async () => {
    const renderFailure = new Error('renderer failed');
    const planner: RenderTemplatePlanner = {
      plan() {
        throw renderFailure;
      },
    };
    const finalize = vi.fn(() => ({ target: 'tailwind' as const }));
    const stage = new RenderProjectStage(sessionDouble(finalize), planner, { validate: vi.fn() });

    await expect(stage.run(parsedProject())).rejects.toThrow(renderFailure);

    expect(finalize).not.toHaveBeenCalled();
  });
});

function sessionDouble(finalize: () => AdapterSessionResult): RenderSession {
  return {
    renderer: { target: 'tailwind' } as ConversionRenderer,
    finalize,
  };
}

function parsedProject(): AnalyzedProject {
  const manifest = projectManifest({
    invocation: {
      inputPath: '/project/input',
      outputPath: '/project/output',
      options: { mode: 'plan', responsiveImages: true },
    },
    templates: [
      { inputPath: '/project/input/first.html', outputPath: '/project/output/first.html' },
      { inputPath: '/project/input/second.html', outputPath: '/project/output/second.html' },
    ],
  });
  return analyzedProject({
    manifest,
    templates: manifest.templates.map(file => ({
      status: 'parsed' as const,
      file,
      source: '<div></div>',
      parseResult: { status: 'parsed' as const, elements: [] },
      inputs: [],
    })),
  });
}

function parseErrorProject(): AnalyzedProject {
  const manifest = projectManifest({
    invocation: { inputPath: '/project/input', outputPath: '/project/output', options: { mode: 'plan' } },
    templates: [{ inputPath: '/project/input/broken.html', outputPath: '/project/output/broken.html' }],
  });
  return analyzedProject({
    manifest,
    templates: [
      {
        status: 'parse-error',
        file: manifest.templates[0]!,
        source: '<broken>',
        parseResult: {
          status: 'parse-error',
          diagnostics: [{ message: 'Unexpected closing block', source: { start: 7, end: 9 } }],
        },
      },
    ],
  });
}

function unchangedPlan(inputPath: string, outputPath: string): FileMigrationPlan {
  return fileMigrationPlan({ file: { inputPath, outputPath, changed: false, results: [] } });
}
