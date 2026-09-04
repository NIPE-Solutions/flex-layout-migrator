import type { FileMigrationPlan } from '../../migrator/migration-plan';
import { AngularTemplateParser } from '../../template/angular-template.parser';
import type { TemplateParser } from '../analyze/template-parser.port';
import { analyzedProject } from '../analyzed-project';
import { projectManifest } from '../project-manifest';
import { renderedProject, type RenderedProject } from '../rendered-project';
import { CssReferenceCollector } from './css-reference.collector';

const A = `flm-${'a'.repeat(64)}`;
const B = `flm-${'b'.repeat(64)}`;

describe('CssReferenceCollector', () => {
  test('prefers proposed artifacts and reuses analyzed source for unchanged in-place outputs', async () => {
    const read = vi.fn();
    const parser = countingParser();
    const rendered = renderedFixture([
      {
        inputPath: '/project/changed-input.html',
        outputPath: '/project/changed-output.html',
        source: '<div></div>',
      },
      {
        inputPath: '/project/in-place.html',
        outputPath: '/project/in-place.html',
        source: `<div class="${B}"></div>`,
      },
    ]);
    const files: readonly FileMigrationPlan[] = [
      {
        file: {
          inputPath: '/project/changed-input.html',
          outputPath: '/project/changed-output.html',
          changed: true,
          results: [],
        },
        artifact: {
          kind: 'template',
          path: '/project/changed-output.html',
          original: { status: 'absent' },
          proposed: { status: 'present', contents: `<div class="${A}"></div>` },
        },
      },
      {
        file: {
          inputPath: '/project/in-place.html',
          outputPath: '/project/in-place.html',
          changed: false,
          results: [],
        },
      },
    ];

    const references = await new CssReferenceCollector(parser, { read }).collect(rendered, files);

    expect([...references.classNames]).toEqual([A, B]);
    expect(references.complete).toBe(true);
    expect(parser.parse).toHaveBeenCalledTimes(2);
    expect(parser.parse).toHaveBeenNthCalledWith(1, `<div class="${A}"></div>`, 'proposed-template.html');
    expect(parser.parse).toHaveBeenNthCalledWith(2, `<div class="${B}"></div>`, 'proposed-template.html');
    expect(read).not.toHaveBeenCalled();
  });

  test('reads each distinct unchanged destination once', async () => {
    const read = vi.fn(async () => `<div class="${A}"></div>`);
    const rendered = renderedFixture([
      {
        inputPath: '/project/first.html',
        outputPath: '/project/shared.html',
        source: '<div></div>',
      },
      {
        inputPath: '/project/second.html',
        outputPath: '/project/shared.html',
        source: '<div></div>',
      },
    ]);
    const files = unchangedFiles(rendered);

    const references = await new CssReferenceCollector(new AngularTemplateParser(), { read }).collect(rendered, files);

    expect([...references.classNames]).toEqual([A]);
    expect(references.complete).toBe(true);
    expect(read).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledWith('/project/shared.html');
  });

  test('marks reference authority incomplete when a distinct destination is absent or cannot be parsed', async () => {
    const read = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }))
      .mockResolvedValueOnce('<div');
    const rendered = renderedFixture([
      { inputPath: '/project/first.html', outputPath: '/project/first-output.html', source: '<div></div>' },
      { inputPath: '/project/second.html', outputPath: '/project/second-output.html', source: '<div></div>' },
    ]);

    const references = await new CssReferenceCollector(new AngularTemplateParser(), { read }).collect(
      rendered,
      unchangedFiles(rendered),
    );

    expect([...references.classNames]).toEqual([]);
    expect(references.complete).toBe(false);
  });

  test.each([
    ['literal class', `class="${A}"`, [A], true],
    ['literal ngClass', `ngClass="${A}"`, [A], false],
    ['responsive literal ngClass', `ngClass.sm="${A}"`, [A], false],
    ['dynamic ngClass', '[ngClass]="classes"', [], false],
    ['named class binding', `[class.${B}]="enabled"`, [B], true],
    ['dynamic class binding', '[class]="classes"', [], false],
    ['interpolated class', `class="${A} {{ extra }}"`, [], false],
    ['boundary-adjacent handwritten class', `class="${A}-modifier"`, [], true],
  ] as const)('collects %s with exact completeness', async (_label, attribute, classNames, complete) => {
    const rendered = renderedFixture([
      { inputPath: '/project/input.html', outputPath: '/project/input.html', source: `<div ${attribute}></div>` },
    ]);

    const references = await new CssReferenceCollector(new AngularTemplateParser(), { read: vi.fn() }).collect(
      rendered,
      unchangedFiles(rendered),
    );

    expect([...references.classNames]).toEqual(classNames);
    expect(references.complete).toBe(complete);
  });

  test('propagates a non-ENOENT destination read failure unchanged', async () => {
    const failure = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    const rendered = renderedFixture([
      { inputPath: '/project/input.html', outputPath: '/project/output.html', source: '<div></div>' },
    ]);

    await expect(
      new CssReferenceCollector(new AngularTemplateParser(), { read: vi.fn().mockRejectedValue(failure) }).collect(
        rendered,
        unchangedFiles(rendered),
      ),
    ).rejects.toBe(failure);
  });
});

function renderedFixture(
  templates: readonly { readonly inputPath: string; readonly outputPath: string; readonly source: string }[],
): RenderedProject {
  const manifest = projectManifest({
    invocation: {
      inputPath: '/project',
      outputPath: '/project/output',
      options: { mode: 'plan', stylesheetPath: '/project/flex-layout.css' },
    },
    templates: templates.map(({ inputPath, outputPath }) => ({ inputPath, outputPath })),
  });
  const analyzed = analyzedProject({
    manifest,
    templates: templates.map((template, index) => ({
      status: 'parsed' as const,
      file: manifest.templates[index]!,
      source: template.source,
      parseResult: { status: 'parsed' as const, elements: [] },
      inputs: [],
    })),
  });
  return renderedProject({
    analyzed,
    target: 'css',
    files: manifest.templates.map(file => ({ ...file, edits: [], results: [] })),
    session: { target: 'css', rules: [] },
  });
}

function unchangedFiles(rendered: RenderedProject): readonly FileMigrationPlan[] {
  return rendered.files.map(file => ({
    file: {
      inputPath: file.inputPath,
      outputPath: file.outputPath,
      changed: false,
      results: file.results,
    },
  }));
}

function countingParser(): { readonly parse: ReturnType<typeof vi.fn<TemplateParser['parse']>> } {
  const parser = new AngularTemplateParser();
  return { parse: vi.fn((source, fileName) => parser.parse(source, fileName)) };
}
