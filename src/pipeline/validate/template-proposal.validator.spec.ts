import type { TemplateParser } from '../analyze/template-parser.port';
import { analyzedProject, type AnalyzedTemplate } from '../analyzed-project';
import { projectManifest } from '../project-manifest';
import type { RenderedTemplateFile } from '../rendered-project';
import { TemplateProposalValidator } from './template-proposal.validator';

describe('TemplateProposalValidator', () => {
  test('preserves stored original parse failures without editing, reparsing, or reading a destination', async () => {
    const parser = parserDouble();
    const read = vi.fn();
    const analyzed = templateParseError();

    const plan = await new TemplateProposalValidator(parser, { read }).validate(analyzed, {
      inputPath: analyzed.file.inputPath,
      outputPath: analyzed.file.outputPath,
      edits: [],
      results: originalParseResults(analyzed),
    });

    expect(plan).toEqual({
      file: {
        inputPath: '/project/input.html',
        outputPath: '/project/output.html',
        changed: false,
        results: originalParseResults(analyzed),
      },
    });
    expect(parser.parse).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  test('returns unchanged without reparsing or reading a destination when edits preserve the source', async () => {
    const parser = parserDouble();
    const read = vi.fn();

    const plan = await new TemplateProposalValidator(parser, { read }).validate(
      template('<div></div>'),
      renderedFile({ edits: [] }),
    );

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
      new TemplateProposalValidator(parserDouble(), { read: vi.fn() }).validate(
        template('<div></div>'),
        renderedFile({ edits: [{ range: { start: 0, end: 99 }, text: '', inputId: 'broken' }] }),
      ),
    ).rejects.toThrow('Invalid edit plan for /project/input.html: Edit broken has a range outside the source.');
  });

  test('maps generated template parse errors without reading the destination', async () => {
    const parser = parserDouble({
      status: 'parse-error',
      diagnostics: [{ message: 'Generated template is invalid', source: { start: 2, end: 5 } }],
    });
    const read = vi.fn();

    const plan = await new TemplateProposalValidator(parser, { read }).validate(
      template('<div></div>'),
      replacementFile(),
    );

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
    expect(parser.parse).toHaveBeenCalledOnce();
    expect(parser.parse).toHaveBeenCalledWith('<span></span>', '/project/output.html');
    expect(read).not.toHaveBeenCalled();
  });

  test('uses analyzed source as the original state for in-place edits', async () => {
    const parser = parserDouble();
    const read = vi.fn();
    const analyzed = template('<div></div>', '/project/input.html', '/project/input.html');

    const plan = await new TemplateProposalValidator(parser, { read }).validate(
      analyzed,
      replacementFile(analyzed.file.inputPath, analyzed.file.outputPath),
    );

    expect(plan.artifact).toMatchObject({
      original: { status: 'present', contents: '<div></div>' },
      proposed: { status: 'present', contents: '<span></span>' },
    });
    expect(parser.parse).toHaveBeenCalledOnce();
    expect(read).not.toHaveBeenCalled();
  });

  test('records a distinct destination present state before replacing it', async () => {
    const read = vi.fn().mockResolvedValue('<main></main>');

    const plan = await new TemplateProposalValidator(parserDouble(), { read }).validate(
      template('<div></div>'),
      replacementFile(),
    );

    expect(plan.artifact).toMatchObject({
      original: { status: 'present', contents: '<main></main>' },
      proposed: { status: 'present', contents: '<span></span>' },
    });
    expect(read).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledWith('/project/output.html');
  });

  test('does not emit an artifact when a changed proposal already matches the distinct destination', async () => {
    const read = vi.fn().mockResolvedValue('<span></span>');

    const plan = await new TemplateProposalValidator(parserDouble(), { read }).validate(
      template('<div></div>'),
      replacementFile(),
    );

    expect(plan).toEqual({
      file: {
        inputPath: '/project/input.html',
        outputPath: '/project/output.html',
        changed: false,
        results: [],
      },
    });
    expect(read).toHaveBeenCalledOnce();
  });

  test('records a distinct absent destination state before creating it', async () => {
    const read = vi.fn().mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));

    const plan = await new TemplateProposalValidator(parserDouble(), { read }).validate(
      template('<div></div>'),
      replacementFile(),
    );

    expect(plan.artifact).toMatchObject({
      original: { status: 'absent' },
      proposed: { status: 'present', contents: '<span></span>' },
    });
  });

  test('propagates an exact distinct destination read error', async () => {
    const readFailure = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    const read = vi.fn().mockRejectedValue(readFailure);

    await expect(
      new TemplateProposalValidator(parserDouble(), { read }).validate(template('<div></div>'), replacementFile()),
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

function templateParseError(): Extract<AnalyzedTemplate, { readonly status: 'parse-error' }> {
  const manifest = projectManifest({
    invocation: {
      inputPath: '/project/input.html',
      outputPath: '/project/output.html',
      options: { mode: 'plan' },
    },
    templates: [{ inputPath: '/project/input.html', outputPath: '/project/output.html' }],
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
  const result = analyzed.templates[0];
  if (result?.status !== 'parse-error') throw new Error('Expected parse-error template.');
  return result;
}

function originalParseResults(template: Extract<AnalyzedTemplate, { readonly status: 'parse-error' }>) {
  return template.parseResult.diagnostics.map(diagnostic => ({
    status: 'parse-error' as const,
    fileName: template.file.inputPath,
    code: 'template-parse-error' as const,
    reason: diagnostic.message,
    source: diagnostic.source,
  }));
}

function renderedFile(overrides: Partial<RenderedTemplateFile> = {}): RenderedTemplateFile {
  return {
    inputPath: '/project/input.html',
    outputPath: '/project/output.html',
    edits: [],
    results: [],
    ...overrides,
  };
}

function replacementFile(inputPath = '/project/input.html', outputPath = '/project/output.html'): RenderedTemplateFile {
  return renderedFile({
    inputPath,
    outputPath,
    edits: [{ range: { start: 0, end: 11 }, text: '<span></span>', inputId: 'replacement' }],
  });
}

function parserDouble(result: ReturnType<TemplateParser['parse']> = { status: 'parsed', elements: [] }): {
  readonly parse: ReturnType<typeof vi.fn<TemplateParser['parse']>>;
} {
  return { parse: vi.fn(() => result) };
}
