import type { OwnedCssReferences } from '../../adapter/css/stylesheet/owned-stylesheet.merger';
import type { PlannedOutputArtifact } from '../../migrator/migration-plan';
import type { StylesheetPlanner } from '../../migrator/stylesheet.planner';
import type { TemplateParser } from '../analyze/template-parser.port';
import { analyzedProject, type AnalyzedTemplate } from '../analyzed-project';
import { projectManifest } from '../project-manifest';
import { renderedProject, type RenderedProject } from '../rendered-project';
import type { CssReferenceCollector } from './css-reference.collector';
import { TemplateProposalValidator } from './template-proposal.validator';
import { ValidateProjectStage } from './validate-project.stage';

describe('ValidateProjectStage', () => {
  test('materializes and reparses each changed template exactly once in rendered order', async () => {
    const parser = parserDouble();
    const read = vi.fn().mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));
    const rendered = renderedFixture({
      target: 'tailwind',
      templates: [
        { inputPath: '/project/a.html', outputPath: '/project/a-output.html', source: 'old-a', replacement: 'new-a' },
        { inputPath: '/project/b.html', outputPath: '/project/b-output.html', source: 'old-b', replacement: 'new-b' },
      ],
    });

    const validated = await new ValidateProjectStage(
      new TemplateProposalValidator(parser, { read }),
      collectorThatMustNotRun(),
      plannerThatMustNotRun(),
    ).run(rendered);

    expect(parser.parse).toHaveBeenCalledTimes(2);
    expect(parser.parse).toHaveBeenNthCalledWith(1, 'new-a', '/project/a-output.html');
    expect(parser.parse).toHaveBeenNthCalledWith(2, 'new-b', '/project/b-output.html');
    expect(validated.plan.files.map(file => file.outputPath)).toEqual([
      '/project/a-output.html',
      '/project/b-output.html',
    ]);
    expect(validated.plan.artifacts.map(artifact => artifact.proposed)).toEqual([
      { status: 'present', contents: 'new-a' },
      { status: 'present', contents: 'new-b' },
    ]);
    expect(read).toHaveBeenCalledTimes(2);
  });

  test('preserves original parse failures as edit-free unchanged files without reparsing', async () => {
    const parser = parserDouble();
    const rendered = parseErrorRenderedFixture();

    const validated = await new ValidateProjectStage(
      new TemplateProposalValidator(parser, { read: vi.fn() }),
      collectorThatMustNotRun(),
      plannerThatMustNotRun(),
    ).run(rendered);

    expect(parser.parse).not.toHaveBeenCalled();
    expect(validated.plan.files).toEqual([
      {
        inputPath: '/project/broken.html',
        outputPath: '/project/broken-output.html',
        changed: false,
        results: [
          {
            status: 'parse-error',
            fileName: '/project/broken.html',
            code: 'template-parse-error',
            reason: 'incomplete start tag',
            source: { start: 0, end: 4 },
          },
        ],
      },
    ]);
    expect(validated.plan.artifacts).toEqual([]);
  });

  test('delegates finalized-session congruence to the canonical constructor after validating proposals', async () => {
    const validate = vi.fn(async (template: AnalyzedTemplate) => ({
      file: {
        inputPath: template.file.inputPath,
        outputPath: template.file.outputPath,
        changed: false,
        results: [],
      },
    }));
    const rendered = renderedFixture({
      target: 'tailwind',
      finalizedTarget: 'css',
      templates: [{ inputPath: '/project/card.html', outputPath: '/project/card.html', source: '<div></div>' }],
    });

    await expect(
      new ValidateProjectStage({ validate }, collectorThatMustNotRun(), plannerThatMustNotRun()).run(rendered),
    ).rejects.toMatchObject({
      code: 'internal-invariant',
      message: 'Render session finalized for target "css" but its renderer targets "tailwind".',
      paths: [],
    });
    expect(validate).toHaveBeenCalledOnce();
  });

  test('collects complete-project CSS references and appends exact stylesheet metadata', async () => {
    const rendered = renderedFixture({
      target: 'css',
      stylesheetPath: '/project/flex-layout.css',
      templates: [
        { inputPath: '/project/a.html', outputPath: '/project/a.html', source: '<div></div>' },
        { inputPath: '/project/b.html', outputPath: '/project/b.html', source: '<div></div>' },
      ],
    });
    const references: OwnedCssReferences = { classNames: new Set(['flm-a']), complete: false };
    const collect = vi.fn<CssReferenceCollector['collect']>().mockResolvedValue(references);
    const stylesheetArtifact: PlannedOutputArtifact = {
      kind: 'stylesheet',
      path: '/project/flex-layout.css',
      original: { status: 'absent' },
      proposed: { status: 'present', contents: '.flm-a {}' },
    };
    const plan = vi.fn<StylesheetPlanner['plan']>().mockResolvedValue(stylesheetArtifact);
    const validate = vi.fn(async (template: AnalyzedTemplate) => ({
      file: {
        inputPath: template.file.inputPath,
        outputPath: template.file.outputPath,
        changed: false,
        results: [],
      },
    }));

    const validated = await new ValidateProjectStage({ validate }, { collect }, { plan }).run(rendered);
    if (rendered.session.target !== 'css') throw new Error('Expected a CSS session fixture.');

    expect(validate).toHaveBeenCalledTimes(2);
    expect(collect).toHaveBeenCalledOnce();
    expect(collect).toHaveBeenCalledWith(rendered, [
      {
        file: { inputPath: '/project/a.html', outputPath: '/project/a.html', changed: false, results: [] },
      },
      {
        file: { inputPath: '/project/b.html', outputPath: '/project/b.html', changed: false, results: [] },
      },
    ]);
    expect(plan).toHaveBeenCalledOnce();
    expect(plan).toHaveBeenCalledWith('/project/flex-layout.css', rendered.session.rules, references);
    expect(validated.plan.artifacts).toEqual([stylesheetArtifact]);
    expect(validated.stylesheet).toEqual({ path: '/project/flex-layout.css', change: 'created' });
  });

  test('never collects references or plans a stylesheet for Tailwind', async () => {
    const collect = vi.fn<CssReferenceCollector['collect']>();
    const plan = vi.fn<StylesheetPlanner['plan']>();
    const rendered = renderedFixture({ target: 'tailwind', templates: [] });

    const validated = await new ValidateProjectStage({ validate: vi.fn() }, { collect }, { plan }).run(rendered);

    expect(validated.stylesheet).toBeUndefined();
    expect(collect).not.toHaveBeenCalled();
    expect(plan).not.toHaveBeenCalled();
  });

  test.each([
    ['css without stylesheet', 'css', undefined, '--target css requires --stylesheet <path>.'],
    [
      'Tailwind with stylesheet',
      'tailwind',
      '/project/flex-layout.css',
      '--stylesheet can only be used with --target css.',
    ],
  ] as const)('preserves invalid configuration behavior for %s', async (_label, target, stylesheetPath, message) => {
    const rendered = renderedFixture({ target, stylesheetPath, templates: [] });

    await expect(
      new ValidateProjectStage({ validate: vi.fn() }, collectorThatMustNotRun(), plannerThatMustNotRun()).run(rendered),
    ).rejects.toMatchObject({ code: 'invalid-configuration', message });
  });

  test('validates topology before reading a colliding destination', async () => {
    const rendered = renderedFixture({
      target: 'tailwind',
      templates: [
        { inputPath: '/project/a.html', outputPath: '/project/shared.html', source: 'old', replacement: 'new' },
        { inputPath: '/project/b.html', outputPath: '/project/shared.html', source: 'old', replacement: 'new' },
      ],
    });
    const validate = vi.fn();

    await expect(
      new ValidateProjectStage({ validate }, collectorThatMustNotRun(), plannerThatMustNotRun()).run(rendered),
    ).rejects.toMatchObject({ code: 'path-collision', paths: ['/project/shared.html'] });
    expect(validate).not.toHaveBeenCalled();
  });
});

interface RenderedFixtureOptions {
  readonly target: 'css' | 'tailwind';
  readonly finalizedTarget?: 'css' | 'tailwind';
  readonly stylesheetPath?: string;
  readonly templates: readonly {
    readonly inputPath: string;
    readonly outputPath: string;
    readonly source: string;
    readonly replacement?: string;
  }[];
}

function renderedFixture(options: RenderedFixtureOptions): RenderedProject {
  const manifest = projectManifest({
    invocation: {
      inputPath: '/project',
      outputPath: '/project/output',
      options: {
        mode: 'plan',
        ...(options.stylesheetPath === undefined ? {} : { stylesheetPath: options.stylesheetPath }),
      },
    },
    templates: options.templates.map(({ inputPath, outputPath }) => ({ inputPath, outputPath })),
  });
  const analyzed = analyzedProject({
    manifest,
    templates: options.templates.map((template, index) => ({
      status: 'parsed' as const,
      file: manifest.templates[index]!,
      source: template.source,
      parseResult: { status: 'parsed' as const, elements: [] },
      inputs: [],
    })),
  });
  const finalizedTarget = options.finalizedTarget ?? options.target;
  return renderedProject({
    analyzed,
    target: options.target,
    files: options.templates.map(template => ({
      inputPath: template.inputPath,
      outputPath: template.outputPath,
      edits:
        template.replacement === undefined
          ? []
          : [{ range: { start: 0, end: template.source.length }, text: template.replacement, inputId: 'replacement' }],
      results: [],
    })),
    session: finalizedTarget === 'css' ? { target: 'css', rules: [] } : { target: 'tailwind' },
  });
}

function parseErrorRenderedFixture(): RenderedProject {
  const manifest = projectManifest({
    invocation: { inputPath: '/project', outputPath: '/project/output', options: { mode: 'plan' } },
    templates: [{ inputPath: '/project/broken.html', outputPath: '/project/broken-output.html' }],
  });
  const analyzed = analyzedProject({
    manifest,
    templates: [
      {
        status: 'parse-error',
        file: manifest.templates[0]!,
        source: '<div',
        parseResult: {
          status: 'parse-error',
          diagnostics: [{ message: 'incomplete start tag', source: { start: 0, end: 4 } }],
        },
      },
    ],
  });
  return renderedProject({
    analyzed,
    target: 'tailwind',
    files: [
      {
        inputPath: '/project/broken.html',
        outputPath: '/project/broken-output.html',
        edits: [],
        results: [
          {
            status: 'parse-error',
            fileName: '/project/broken.html',
            code: 'template-parse-error',
            reason: 'incomplete start tag',
            source: { start: 0, end: 4 },
          },
        ],
      },
    ],
    session: { target: 'tailwind' },
  });
}

function parserDouble(): { readonly parse: ReturnType<typeof vi.fn<TemplateParser['parse']>> } {
  return { parse: vi.fn(() => ({ status: 'parsed', elements: [] })) };
}

function collectorThatMustNotRun(): Pick<CssReferenceCollector, 'collect'> {
  return { collect: vi.fn(() => Promise.reject(new Error('CSS reference collection must not run.'))) };
}

function plannerThatMustNotRun(): Pick<StylesheetPlanner, 'plan'> {
  return { plan: vi.fn(() => Promise.reject(new Error('Stylesheet planning must not run.'))) };
}
