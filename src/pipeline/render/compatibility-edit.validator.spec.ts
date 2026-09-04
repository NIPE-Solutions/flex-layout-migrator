import type { FilePlan } from '../../planner/conversion-planner';
import type { TemplateParser } from '../analyze/template-parser.port';
import { analyzedProject, type AnalyzedTemplate } from '../analyzed-project';
import { projectManifest } from '../project-manifest';
import { DefaultCompatibilityEditValidator } from './compatibility-edit.validator';

describe('DefaultCompatibilityEditValidator', () => {
  test('returns unchanged without reparsing or reading a destination when edits preserve the source', async () => {
    const parser = parserDouble();
    const read = vi.fn();

    const plan = await new DefaultCompatibilityEditValidator(parser, { read }).validate(template('<div></div>'), emptyPlan());

    expect(plan).toEqual({
      file: {
        inputPath: '/project/input.html',
        outputPath: '/project/output.html',
        changed: false,
        results: [],
      },
    });
    expect(parser.parse).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  test('rejects edit ranges outside the analyzed source', async () => {
    await expect(
      new DefaultCompatibilityEditValidator(parserDouble(), { read: vi.fn() }).validate(template('<div></div>'), {
        edits: [{ range: { start: 0, end: 99 }, text: '', inputId: 'broken' }],
        results: [],
      }),
    ).rejects.toThrow('Invalid edit plan for /project/input.html: Edit broken has a range outside the source.');
  });

  test('maps generated template parse errors without reading the destination', async () => {
    const parser = parserDouble({
      status: 'parse-error',
      diagnostics: [{ message: 'Generated template is invalid', source: { start: 2, end: 5 } }],
    });
    const read = vi.fn();

    const plan = await new DefaultCompatibilityEditValidator(parser, { read }).validate(template('<div></div>'), replacementPlan());

    expect(plan.file).toEqual({
      inputPath: '/project/input.html',
      outputPath: '/project/output.html',
      changed: false,
      results: [
        {
          status: 'parse-error',
          fileName: '/project/output.html',
          code: 'generated-template-parse-error',
          reason: 'Generated template is invalid',
          source: { start: 2, end: 5 },
        },
      ],
    });
    expect(read).not.toHaveBeenCalled();
  });

  test('uses analyzed source as the original state for in-place edits', async () => {
    const parser = parserDouble();
    const read = vi.fn();

    const plan = await new DefaultCompatibilityEditValidator(parser, { read }).validate(
      template('<div></div>', '/project/input.html', '/project/input.html'),
      replacementPlan(),
    );

    expect(plan.artifact).toMatchObject({
      original: { status: 'present', contents: '<div></div>' },
      proposed: { status: 'present', contents: '<span></span>' },
    });
    expect(read).not.toHaveBeenCalled();
  });

  test('records a distinct destination present state before replacing it', async () => {
    const read = vi.fn().mockResolvedValue('<main></main>');

    const plan = await new DefaultCompatibilityEditValidator(parserDouble(), { read }).validate(template('<div></div>'), replacementPlan());

    expect(plan.artifact).toMatchObject({
      original: { status: 'present', contents: '<main></main>' },
      proposed: { status: 'present', contents: '<span></span>' },
    });
    expect(read).toHaveBeenCalledWith('/project/output.html');
  });

  test('records a distinct absent destination state before creating it', async () => {
    const read = vi.fn().mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));

    const plan = await new DefaultCompatibilityEditValidator(parserDouble(), { read }).validate(template('<div></div>'), replacementPlan());

    expect(plan.artifact).toMatchObject({
      original: { status: 'absent' },
      proposed: { status: 'present', contents: '<span></span>' },
    });
  });

  test('propagates an exact distinct destination read error', async () => {
    const readFailure = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    const read = vi.fn().mockRejectedValue(readFailure);

    await expect(
      new DefaultCompatibilityEditValidator(parserDouble(), { read }).validate(template('<div></div>'), replacementPlan()),
    ).rejects.toBe(readFailure);
  });
});

function template(
  source: string,
  inputPath = '/project/input.html',
  outputPath = '/project/output.html',
): Extract<AnalyzedTemplate, { readonly status: 'parsed' }> {
  const manifest = projectManifest({
    invocation: { inputPath, outputPath, options: { mode: 'plan' } },
    templates: [{ inputPath, outputPath }],
  });
  const analyzed = analyzedProject({
    manifest,
    templates: [
      {
        status: 'parsed',
        file: manifest.templates[0]!,
        source,
        parseResult: { status: 'parsed', elements: [] },
        inputs: [],
      },
    ],
  });
  const result = analyzed.templates[0];
  if (result?.status !== 'parsed') throw new Error('Expected parsed template.');
  return result;
}

function emptyPlan(): FilePlan {
  return { edits: [], results: [] };
}

function replacementPlan(): FilePlan {
  return {
    edits: [{ range: { start: 0, end: 11 }, text: '<span></span>', inputId: 'replacement' }],
    results: [],
  };
}

function parserDouble(result: ReturnType<TemplateParser['parse']> = { status: 'parsed', elements: [] }): {
  readonly parse: ReturnType<typeof vi.fn<TemplateParser['parse']>>;
} {
  return { parse: vi.fn(() => result) };
}
