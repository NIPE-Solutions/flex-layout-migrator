import type { ConversionRenderer } from '../../render/conversion-renderer';
import type { AdapterSessionResult, RenderSession } from '../../render/render-session';
import { TailwindRenderer } from '../../render/tailwind/tailwind.renderer';
import { analyzedProject, type AnalyzedProject } from '../analyzed-project';
import { projectManifest } from '../project-manifest';
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
    const finalize = vi.fn(() => ({ target: 'tailwind' as const }));
    const stage = new RenderProjectStage(sessionDouble(finalize), planner);

    const rendered = await stage.run(analyzed);

    expect(plannedPaths).toEqual(['/project/input/first.html', '/project/input/second.html']);
    expect(finalize).toHaveBeenCalledOnce();
    expect(rendered.files.map(file => file.inputPath)).toEqual([
      '/project/input/first.html',
      '/project/input/second.html',
    ]);
    expect(Object.isFrozen(rendered)).toBe(true);
  });

  test('returns unresolved edit proposals without materializing template artifacts', async () => {
    const edits = [{ range: { start: 0, end: 3 }, text: 'new', inputId: 'replacement' }];
    const results = [
      {
        status: 'invalid' as const,
        input: {
          id: '/project/input/first.html:0',
          fileName: '/project/input/first.html',
          elementId: '0',
          sourceName: 'fxLayout',
          directive: 'fxLayout' as const,
          value: 'row',
          binding: 'literal' as const,
          breakpoint: undefined,
          source: { start: 0, end: 3 },
          nameSource: { start: 0, end: 3 },
        },
        code: 'invalid-value' as const,
        reason: 'fixture result',
        suggestion: 'fixture suggestion',
      },
    ];
    const planner: RenderTemplatePlanner = { plan: () => ({ edits, results }) };

    const rendered = await new RenderProjectStage(
      sessionDouble(vi.fn(() => ({ target: 'tailwind' as const }))),
      planner,
    ).run(parsedProject());

    expect(rendered.files[0]).toEqual({
      inputPath: '/project/input/first.html',
      outputPath: '/project/output/first.html',
      edits,
      results,
    });
    expect(rendered.files[0]).not.toHaveProperty('file');
    expect(rendered.files[0]).not.toHaveProperty('artifact');
    expect(rendered.analyzed.templates[0]?.source).toBe('<div></div>');
  });

  test('preserves stored parse diagnostics without invoking semantic or target rendering', async () => {
    const analyzed = parseErrorProject();
    const planner = { plan: vi.fn() } as unknown as RenderTemplatePlanner;
    const stage = new RenderProjectStage(sessionDouble(vi.fn(() => ({ target: 'tailwind' as const }))), planner);

    const rendered = await stage.run(analyzed);

    expect(planner.plan).not.toHaveBeenCalled();
    expect(rendered.files[0]?.edits).toEqual([]);
    expect(rendered.files[0]?.results).toEqual([
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
    const stage = new RenderProjectStage(sessionDouble(finalize), planner);

    await expect(stage.run(parsedProject())).rejects.toThrow(renderFailure);

    expect(finalize).not.toHaveBeenCalled();
  });

  test('records the render target so Validate can reject a mismatched finalized session', async () => {
    const planner: RenderTemplatePlanner = { plan: () => ({ edits: [], results: [] }) };
    const finalize = vi.fn(() => ({ target: 'css' as const, rules: [] }));
    const stage = new RenderProjectStage({ renderer: new TailwindRenderer(), finalize }, planner);

    const rendered = await stage.run(parsedProject());

    expect(rendered.target).toBe('tailwind');
    expect(rendered.session.target).toBe('css');
    expect(finalize).toHaveBeenCalledOnce();
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
