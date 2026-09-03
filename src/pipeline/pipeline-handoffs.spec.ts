import * as path from 'node:path';
import type { AdapterSessionResult } from '../adapter/conversion-adapter.session';
import type { OwnedCssRule } from '../adapter/css/css-artifact.model';
import type { LocatedFlexLayoutInput } from '../analyzer/flex-layout-attribute.analyzer';
import type { FileMigrationPlan, MigrationPlan } from '../migrator/migration-plan';
import { MigrationApplicationError } from '../migrator/migration-application.error';
import type { MigrationOptions } from '../migrator/migrator';
import type { StylesheetMigrationResult } from '../report/migration-report.builder';
import type { TemplateParseResult } from '../template/template.model';
import { analyzedProject, type AnalyzedProject, type AnalyzedTemplate } from './analyzed-project';
import { migrationInvocation, projectManifest, type ManifestTemplate, type ProjectManifest } from './project-manifest';
import { renderedProject, type RenderedProject } from './rendered-project';
import { validatedProjectPlan } from './validated-project-plan';

function manifestFor(inputPath = 'templates/card.html', outputPath = 'generated/card.html'): ProjectManifest {
  return projectManifest({
    invocation: {
      inputPath: 'templates',
      outputPath: 'generated',
      options: { mode: 'plan' },
    },
    templates: [{ inputPath, outputPath }],
  });
}

function twoTemplateManifest(): ProjectManifest {
  return projectManifest({
    invocation: {
      inputPath: 'templates',
      outputPath: 'generated',
      options: { mode: 'plan' },
    },
    templates: [
      { inputPath: 'templates/alpha.html', outputPath: 'generated/alpha.html' },
      { inputPath: 'templates/beta.html', outputPath: 'generated/beta.html' },
    ],
  });
}

function parseErrorTemplate(file: ManifestTemplate): AnalyzedTemplate {
  return {
    status: 'parse-error',
    file: { ...file },
    source: '<div',
    parseResult: {
      status: 'parse-error',
      diagnostics: [{ message: 'incomplete start tag', source: { start: 0, end: 4 } }],
    },
  };
}

function locatedInput(fileName = path.resolve('templates/card.html')): LocatedFlexLayoutInput {
  return {
    id: `${fileName}:5`,
    fileName,
    elementId: '0',
    sourceName: 'fxLayout',
    directive: 'fxLayout',
    value: 'row',
    binding: 'literal',
    breakpoint: undefined,
    source: { start: 5, end: 19 },
    nameSource: { start: 5, end: 13 },
    valueSource: { start: 15, end: 18 },
  };
}

function parsedProject(manifest = manifestFor()): AnalyzedProject {
  const parseResult: Extract<TemplateParseResult, { readonly status: 'parsed' }> = {
    status: 'parsed',
    elements: [],
  };
  return analyzedProject({
    manifest,
    templates: [
      {
        status: 'parsed',
        file: { ...manifest.templates[0]! },
        source: '<div fxLayout="row"></div>',
        parseResult,
        inputs: [locatedInput(manifest.templates[0]!.inputPath)],
      },
    ],
  });
}

function rawFilePlan(inputPath: string, outputPath: string): FileMigrationPlan {
  return {
    file: {
      inputPath,
      outputPath,
      changed: false,
      results: [],
    },
  };
}

function cssRule(): OwnedCssRule {
  return {
    owner: 'flex-layout-codemod',
    id: 'a'.repeat(64),
    className: `flm-${'a'.repeat(64)}`,
    family: 'layout',
    declarations: [{ property: 'display', value: 'flex' }],
    context: { priority: 0 },
  };
}

function renderedCssProject(): RenderedProject {
  const analyzed = parsedProject(
    projectManifest({
      invocation: {
        inputPath: 'templates',
        outputPath: 'generated',
        options: { mode: 'plan', stylesheetPath: path.resolve('generated/flex-layout.css') },
      },
      templates: [{ inputPath: 'templates/card.html', outputPath: 'generated/card.html' }],
    }),
  );
  return renderedProject({
    analyzed,
    files: [rawFilePlan(analyzed.manifest.templates[0]!.inputPath, analyzed.manifest.templates[0]!.outputPath)],
    session: { target: 'css', rules: [cssRule()] },
  });
}

function captureInternalInvariant(action: () => unknown): MigrationApplicationError {
  try {
    action();
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(MigrationApplicationError);
    expect(error).toMatchObject({ code: 'internal-invariant' });
    return error as MigrationApplicationError;
  }
  throw new Error('Expected an internal invariant error.');
}

describe('pipeline handoff factories', () => {
  test('preserves raw invocation paths, exposes canonical identities, and owns an immutable options copy', () => {
    const options: MigrationOptions = {
      mode: 'write',
      responsiveImages: true,
      stylesheetPath: 'styles/generated.css',
      reportPath: 'reports/result.json',
    };

    const invocation = migrationInvocation({
      inputPath: 'fixtures/../templates',
      outputPath: 'dist/../generated',
      options,
    });

    expect(invocation).toEqual({
      inputPath: 'fixtures/../templates',
      outputPath: 'dist/../generated',
      canonicalInputPath: path.resolve('templates'),
      canonicalOutputPath: path.resolve('generated'),
      options: {
        mode: 'write',
        responsiveImages: true,
        stylesheetPath: 'styles/generated.css',
        reportPath: 'reports/result.json',
      },
    });
    expect(invocation.options).not.toBe(options);
    expect(Object.isFrozen(invocation)).toBe(true);
    expect(Object.isFrozen(invocation.options)).toBe(true);

    (options as { mode: 'write' | 'plan' }).mode = 'plan';
    expect(invocation.options.mode).toBe('write');
  });

  test('preserves manifest template order while normalizing and owning every path record', () => {
    const templates = [
      { inputPath: 'templates/zeta/../zeta.html', outputPath: 'generated/zeta.html' },
      { inputPath: 'templates/alpha.html', outputPath: 'generated/nested/../alpha.html' },
    ];

    const manifest = projectManifest({
      invocation: {
        inputPath: 'templates',
        outputPath: 'generated',
        options: { mode: 'plan' },
      },
      templates,
    });

    expect(manifest.templates).toEqual([
      { inputPath: path.resolve('templates/zeta.html'), outputPath: path.resolve('generated/zeta.html') },
      { inputPath: path.resolve('templates/alpha.html'), outputPath: path.resolve('generated/alpha.html') },
    ]);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.templates)).toBe(true);
    expect(manifest.templates.every(template => Object.isFrozen(template))).toBe(true);

    templates.reverse();
    templates[0]!.inputPath = 'mutated.html';
    expect(manifest.templates.map(template => path.basename(template.inputPath))).toEqual(['zeta.html', 'alpha.html']);
  });

  test('preserves invocation canonical identities when the current working directory changes', () => {
    const originalWorkingDirectory = process.cwd();
    const invocation = migrationInvocation({
      inputPath: 'templates/source',
      outputPath: 'generated/output',
      options: { mode: 'plan' },
    });
    const expectedInputPath = path.join(originalWorkingDirectory, 'templates', 'source');
    const expectedOutputPath = path.join(originalWorkingDirectory, 'generated', 'output');

    try {
      process.chdir(path.dirname(originalWorkingDirectory));

      const manifest = projectManifest({ invocation, templates: [] });

      expect(manifest.invocation.canonicalInputPath).toBe(expectedInputPath);
      expect(manifest.invocation.canonicalOutputPath).toBe(expectedOutputPath);
    } finally {
      process.chdir(originalWorkingDirectory);
    }
  });

  test('recursively owns parsed elements, attributes, and every nested source range', () => {
    const manifest = manifestFor();
    const elementSource = { start: 0, end: 26 };
    const startTag = { start: 0, end: 20 };
    const endTag = { start: 20, end: 26 };
    const attributeSource = { start: 5, end: 19 };
    const attributeNameSource = { start: 5, end: 13 };
    const attributeValueSource = { start: 15, end: 18 };
    const attribute = {
      name: 'fxLayout',
      rawName: 'fxLayout',
      rawValue: 'row',
      value: 'row',
      binding: 'literal' as const,
      source: attributeSource,
      nameSource: attributeNameSource,
      valueSource: attributeValueSource,
    };
    const attributes = [attribute];
    const element = {
      id: '0',
      name: 'div',
      source: elementSource,
      startTag,
      endTag,
      structural: false,
      attributes,
    };
    const elements = [element];
    const parseResult: Extract<TemplateParseResult, { readonly status: 'parsed' }> = {
      status: 'parsed',
      elements,
    };
    const source = '<div fxLayout="row">\r\né🚀</div>';
    const inputs = [locatedInput(manifest.templates[0]!.inputPath)];
    const templates = [
      {
        status: 'parsed' as const,
        file: {
          inputPath: path.join('templates', '.', 'card.html'),
          outputPath: path.join('generated', '.', 'card.html'),
        },
        source,
        parseResult,
        inputs,
      },
    ];

    const analyzed = analyzedProject({ manifest, templates });

    expect(analyzed.templates[0]!.file).toBe(analyzed.manifest.templates[0]);
    expect(analyzed.templates[0]!.source).toBe(source);
    expect(analyzed.templates[0]!.status).toBe('parsed');
    if (analyzed.templates[0]!.status !== 'parsed') throw new Error('Expected a parsed template.');
    expect(analyzed.templates[0]!.parseResult).not.toBe(parseResult);
    expect(analyzed.templates[0]!.parseResult.elements).not.toBe(elements);
    const ownedElement = analyzed.templates[0]!.parseResult.elements[0]!;
    const ownedAttribute = ownedElement.attributes[0]!;
    expect(ownedElement).not.toBe(element);
    expect(ownedElement.attributes).not.toBe(attributes);
    expect(ownedAttribute).not.toBe(attribute);
    expect(ownedElement.source).not.toBe(elementSource);
    expect(ownedElement.startTag).not.toBe(startTag);
    expect(ownedElement.endTag).not.toBe(endTag);
    expect(ownedAttribute.source).not.toBe(attributeSource);
    expect(ownedAttribute.nameSource).not.toBe(attributeNameSource);
    expect(ownedAttribute.valueSource).not.toBe(attributeValueSource);
    expect(Object.isFrozen(analyzed.templates[0]!.parseResult)).toBe(true);
    expect(Object.isFrozen(analyzed.templates[0]!.parseResult.elements)).toBe(true);
    expect(Object.isFrozen(ownedElement)).toBe(true);
    expect(Object.isFrozen(ownedElement.attributes)).toBe(true);
    expect(Object.isFrozen(ownedAttribute)).toBe(true);
    expect(Object.isFrozen(ownedElement.source)).toBe(true);
    expect(Object.isFrozen(ownedElement.startTag)).toBe(true);
    expect(Object.isFrozen(ownedElement.endTag)).toBe(true);
    expect(Object.isFrozen(ownedAttribute.source)).toBe(true);
    expect(Object.isFrozen(ownedAttribute.nameSource)).toBe(true);
    expect(Object.isFrozen(ownedAttribute.valueSource)).toBe(true);
    expect(Object.isFrozen(analyzed)).toBe(true);
    expect(Object.isFrozen(analyzed.templates)).toBe(true);
    expect(Object.isFrozen(analyzed.templates[0])).toBe(true);
    expect(
      Object.isFrozen((analyzed.templates[0] as { readonly inputs: readonly LocatedFlexLayoutInput[] }).inputs),
    ).toBe(true);
    expect(
      Object.isFrozen((analyzed.templates[0] as { readonly inputs: readonly LocatedFlexLayoutInput[] }).inputs[0]),
    ).toBe(true);
    expect(Object.isFrozen(element)).toBe(false);
    expect(Object.isFrozen(attribute)).toBe(false);

    const input = inputs[0]!;
    element.name = 'section';
    attribute.name = 'class';
    elementSource.start = 2;
    startTag.end = 18;
    endTag.start = 18;
    attributeSource.start = 4;
    attributeNameSource.end = 12;
    attributeValueSource.start = 14;
    (input.source as { start: number }).start = 4;
    (input.nameSource as { end: number }).end = 12;
    (input.valueSource as { start: number }).start = 14;
    inputs.pop();
    templates.pop();
    elements.pop();
    attributes.pop();
    (parseResult as unknown as { elements: readonly (typeof element)[] }).elements = [];
    expect((analyzed.templates[0] as { readonly inputs: readonly LocatedFlexLayoutInput[] }).inputs).toHaveLength(1);
    expect(analyzed.templates).toHaveLength(1);
    expect(ownedElement.name).toBe('div');
    expect(ownedElement.source).toEqual({ start: 0, end: 26 });
    expect(ownedElement.startTag).toEqual({ start: 0, end: 20 });
    expect(ownedElement.endTag).toEqual({ start: 20, end: 26 });
    expect(ownedElement.attributes).toHaveLength(1);
    expect(ownedAttribute.name).toBe('fxLayout');
    expect(ownedAttribute.source).toEqual({ start: 5, end: 19 });
    expect(ownedAttribute.nameSource).toEqual({ start: 5, end: 13 });
    expect(ownedAttribute.valueSource).toEqual({ start: 15, end: 18 });
    const ownedInput = (analyzed.templates[0] as { readonly inputs: readonly LocatedFlexLayoutInput[] }).inputs[0]!;
    expect(ownedInput.source).toEqual({ start: 5, end: 19 });
    expect(ownedInput.nameSource).toEqual({ start: 5, end: 13 });
    expect(ownedInput.valueSource).toEqual({ start: 15, end: 18 });
  });

  test('recursively owns parse-error diagnostics and source ranges', () => {
    const manifest = manifestFor();
    const sourceRange = { start: 0, end: 5 };
    const diagnostic = { message: 'invalid template', source: sourceRange };
    const diagnostics = [diagnostic];
    const parseResult: Extract<TemplateParseResult, { readonly status: 'parse-error' }> = {
      status: 'parse-error',
      diagnostics,
    };

    const analyzed = analyzedProject({
      manifest,
      templates: [
        {
          status: 'parse-error',
          file: { ...manifest.templates[0]! },
          source: '<span />',
          parseResult,
        },
      ],
    });

    const template = analyzed.templates[0]!;
    expect(template.status).toBe('parse-error');
    if (template.status !== 'parse-error') throw new Error('Expected a parse-error template.');
    expect(template.parseResult).not.toBe(parseResult);
    expect(template.parseResult.diagnostics).not.toBe(diagnostics);
    expect(template.parseResult.diagnostics[0]).not.toBe(diagnostic);
    expect(template.parseResult.diagnostics[0]!.source).not.toBe(sourceRange);
    expect(Object.isFrozen(template.parseResult)).toBe(true);
    expect(Object.isFrozen(template.parseResult.diagnostics)).toBe(true);
    expect(Object.isFrozen(template.parseResult.diagnostics[0])).toBe(true);
    expect(Object.isFrozen(template.parseResult.diagnostics[0]!.source)).toBe(true);

    diagnostics.pop();
    diagnostic.message = 'mutated message';
    sourceRange.start = 4;
    (parseResult as { diagnostics: readonly (typeof diagnostic)[] }).diagnostics = [];
    expect(template.parseResult).toEqual({
      status: 'parse-error',
      diagnostics: [{ message: 'invalid template', source: { start: 0, end: 5 } }],
    });
  });

  test('rejects an analyzed template whose normalized path pair is absent from its manifest', () => {
    const manifest = manifestFor();

    captureInternalInvariant(() =>
      analyzedProject({
        manifest,
        templates: [
          {
            status: 'parse-error',
            file: { inputPath: 'templates/other.html', outputPath: 'generated/other.html' },
            source: '<span />',
            parseResult: {
              status: 'parse-error',
              diagnostics: [{ message: 'invalid', source: { start: 0, end: 5 } }],
            },
          },
        ],
      }),
    );
  });

  test('requires analyzed templates to match every manifest template once and in the same order', () => {
    const manifest = twoTemplateManifest();
    const first = parseErrorTemplate(manifest.templates[0]!);
    const second = parseErrorTemplate(manifest.templates[1]!);
    const malformedSequences = [
      { name: 'omission', templates: [first] },
      { name: 'duplicate', templates: [first, first] },
      { name: 'extra', templates: [first, second, first] },
      { name: 'reordered', templates: [second, first] },
    ];

    for (const scenario of malformedSequences) {
      const error = captureInternalInvariant(() => analyzedProject({ manifest, templates: scenario.templates }));
      expect(error.message, scenario.name).toBe(
        'Analyzed project templates must match its manifest one-to-one and in the same order.',
      );
    }
  });

  test('owns rendered file plans and CSS session rules through immutable copies', () => {
    const analyzed = parsedProject();
    const results: NonNullable<FileMigrationPlan['file']['results']>[number][] = [];
    const files: FileMigrationPlan[] = [
      {
        file: {
          inputPath: analyzed.manifest.templates[0]!.inputPath,
          outputPath: analyzed.manifest.templates[0]!.outputPath,
          changed: false,
          results,
        },
      },
    ];
    const rule = cssRule();
    const rules = [rule];
    const session: AdapterSessionResult = { target: 'css', rules };

    const rendered = renderedProject({ analyzed, files, session });

    expect(Object.isFrozen(rendered)).toBe(true);
    expect(Object.isFrozen(rendered.files)).toBe(true);
    expect(Object.isFrozen(rendered.files[0])).toBe(true);
    expect(Object.isFrozen(rendered.files[0]!.file.results)).toBe(true);
    expect(Object.isFrozen(rendered.session)).toBe(true);
    expect(rendered.session.target).toBe('css');
    if (rendered.session.target !== 'css') throw new Error('Expected a CSS session.');
    expect(Object.isFrozen(rendered.session.rules)).toBe(true);
    expect(Object.isFrozen(rendered.session.rules[0])).toBe(true);
    expect(rendered.session.rules[0]).not.toBe(rule);

    files.pop();
    results.push({
      status: 'parse-error',
      fileName: 'late.html',
      code: 'template-parse-error',
      reason: 'late mutation',
      source: { start: 0, end: 1 },
    });
    rules.pop();
    expect(rendered.files).toHaveLength(1);
    expect(rendered.files[0]!.file.results).toHaveLength(0);
    expect(rendered.session.rules).toHaveLength(1);
  });

  test('rejects a rendered file whose code-unit-exact normalized pair is absent from analyzed templates', () => {
    const analyzed = parsedProject();

    captureInternalInvariant(() =>
      renderedProject({
        analyzed,
        files: [
          rawFilePlan(
            analyzed.manifest.templates[0]!.inputPath,
            analyzed.manifest.templates[0]!.outputPath.replace('card.html', 'Card.html'),
          ),
        ],
        session: { target: 'tailwind' },
      }),
    );
  });

  test('requires rendered files to match every analyzed template once and in the same order', () => {
    const manifest = twoTemplateManifest();
    const analyzed = analyzedProject({
      manifest,
      templates: manifest.templates.map(file => parseErrorTemplate(file)),
    });
    const first = rawFilePlan(manifest.templates[0]!.inputPath, manifest.templates[0]!.outputPath);
    const second = rawFilePlan(manifest.templates[1]!.inputPath, manifest.templates[1]!.outputPath);
    const malformedSequences = [
      { name: 'omission', files: [first] },
      { name: 'duplicate', files: [first, first] },
      { name: 'extra', files: [first, second, first] },
      { name: 'reordered', files: [second, first] },
    ];

    for (const scenario of malformedSequences) {
      const error = captureInternalInvariant(() =>
        renderedProject({ analyzed, files: scenario.files, session: { target: 'tailwind' } }),
      );
      expect(error.message, scenario.name).toBe(
        'Rendered project files must match its analyzed templates one-to-one and in the same order.',
      );
    }
  });

  test('canonicalizes rendered file identities without dropping results or template artifacts', () => {
    const analyzed = parsedProject();
    const identity = analyzed.manifest.templates[0]!;
    const inputPath = `${path.dirname(identity.inputPath)}${path.sep}nested${path.sep}..${path.sep}${path.basename(identity.inputPath)}`;
    const outputPath = `${path.dirname(identity.outputPath)}${path.sep}nested${path.sep}..${path.sep}${path.basename(identity.outputPath)}`;
    const result = {
      status: 'parse-error' as const,
      fileName: inputPath,
      code: 'template-parse-error' as const,
      reason: 'fixture diagnostic',
      source: { start: 1, end: 2 },
    };
    const artifact: MigrationPlan['artifacts'][number] = {
      kind: 'template',
      path: identity.outputPath,
      original: { status: 'absent' },
      proposed: { status: 'present', contents: '<div></div>' },
    };

    const rendered = renderedProject({
      analyzed,
      files: [
        {
          file: { inputPath, outputPath, changed: true, results: [result] },
          artifact,
        },
      ],
      session: { target: 'tailwind' },
    });

    expect(rendered.files[0]!.file).toEqual({
      inputPath: identity.inputPath,
      outputPath: identity.outputPath,
      changed: true,
      results: [result],
    });
    expect(rendered.files[0]!.artifact).toEqual(artifact);
    expect(rendered.files[0]!.artifact).not.toBe(artifact);
  });

  test('owns migration plan contents and a plain stylesheet result record', () => {
    const rendered = renderedCssProject();
    const files = [rawFilePlan('templates/card.html', 'generated/card.html').file];
    const artifacts: MigrationPlan['artifacts'][number][] = [];
    const plan: MigrationPlan = { target: 'css', files, artifacts };
    const stylesheet: StylesheetMigrationResult = {
      path: path.resolve('generated/flex-layout.css'),
      change: 'unchanged',
    };

    const validated = validatedProjectPlan({ rendered, plan, stylesheet });

    expect(Object.isFrozen(validated)).toBe(true);
    expect(Object.isFrozen(validated.plan)).toBe(true);
    expect(Object.isFrozen(validated.plan.files)).toBe(true);
    expect(Object.isFrozen(validated.plan.artifacts)).toBe(true);
    expect(Object.isFrozen(validated.stylesheet)).toBe(true);
    expect(validated.stylesheet).not.toBe(stylesheet);

    files.pop();
    artifacts.push({
      kind: 'stylesheet',
      path: path.resolve('generated/late.css'),
      original: { status: 'absent' },
      proposed: { status: 'present', contents: '.late {}' },
    });
    (stylesheet as { path: string }).path = 'mutated.css';
    expect(validated.plan.files).toHaveLength(1);
    expect(validated.plan.artifacts).toHaveLength(0);
    expect(validated.stylesheet?.path).toBe(path.resolve('generated/flex-layout.css'));
  });

  test('rejects a validated plan whose target differs from the finalized session target', () => {
    const rendered = renderedCssProject();

    captureInternalInvariant(() =>
      validatedProjectPlan({
        rendered,
        plan: { target: 'tailwind', files: [], artifacts: [] },
      }),
    );
  });
});
