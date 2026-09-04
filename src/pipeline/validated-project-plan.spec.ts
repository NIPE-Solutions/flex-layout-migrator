import * as path from 'node:path';
import { MigrationApplicationError } from '../migrator/migration-application.error';
import type {
  ArtifactState,
  FileMigrationPlan,
  MigrationPlan,
  PlannedOutputArtifact,
} from '../migrator/migration-plan';
import type { StylesheetMigrationResult } from '../report/migration-report.builder';
import { analyzedProject } from './analyzed-project';
import { projectManifest, type ProjectManifest } from './project-manifest';
import { renderedProject, type RenderedProject } from './rendered-project';
import { validatedProjectPlan } from './validated-project-plan';

function manifestFor(names: readonly string[], stylesheetPath?: string): ProjectManifest {
  return projectManifest({
    invocation: {
      inputPath: 'templates',
      outputPath: 'generated',
      options: { mode: 'plan', ...(stylesheetPath === undefined ? {} : { stylesheetPath }) },
    },
    templates: names.map(name => ({
      inputPath: path.resolve('templates', name),
      outputPath: path.resolve('generated', name),
    })),
  });
}

function renderedFor(manifest: ProjectManifest, target: 'css' | 'tailwind'): RenderedProject {
  const analyzed = analyzedProject({
    manifest,
    templates: manifest.templates.map(file => ({
      status: 'parsed' as const,
      file,
      source: '<div></div>',
      parseResult: { status: 'parsed' as const, elements: [] },
      inputs: [],
    })),
  });

  return renderedProject({
    analyzed,
    target,
    files: manifest.templates.map(file => ({ ...file, edits: [], results: [] })),
    session: target === 'tailwind' ? { target } : { target, rules: [] },
  });
}

function unchangedFiles(rendered: RenderedProject): MigrationPlan['files'] {
  return rendered.files.map(file => ({
    inputPath: file.inputPath,
    outputPath: file.outputPath,
    changed: false,
    results: file.results,
  }));
}

function templateArtifact(
  file: { readonly outputPath: string },
  contents: string,
  original: ArtifactState = { status: 'absent' },
): PlannedOutputArtifact {
  return {
    kind: 'template',
    path: file.outputPath,
    original,
    proposed: { status: 'present', contents },
  };
}

function changedFile(
  rendered: RenderedProject,
  index: number,
  contents: string,
): { readonly file: MigrationPlan['files'][number]; readonly artifact: PlannedOutputArtifact } {
  const proposal = rendered.files[index]!;
  return {
    file: {
      inputPath: proposal.inputPath,
      outputPath: proposal.outputPath,
      changed: true,
      results: proposal.results,
    },
    artifact: templateArtifact(proposal, contents),
  };
}

function stylesheetArtifact(
  stylesheetPath: string,
  change: Exclude<StylesheetMigrationResult['change'], 'unchanged'>,
): PlannedOutputArtifact {
  let original: ArtifactState;
  let proposed: ArtifactState;
  switch (change) {
    case 'created':
      original = { status: 'absent' };
      proposed = { status: 'present', contents: '.created {}' };
      break;
    case 'updated':
      original = { status: 'present', contents: '.before {}' };
      proposed = { status: 'present', contents: '.after {}' };
      break;
    case 'removed':
      original = { status: 'present', contents: '.removed {}' };
      proposed = { status: 'absent' };
      break;
  }
  return { kind: 'stylesheet', path: stylesheetPath, original, proposed };
}

function noncanonicalPath(value: string): string {
  return `${path.dirname(value)}${path.sep}nested${path.sep}..${path.sep}${path.basename(value)}`;
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

describe('validatedProjectPlan', () => {
  test('requires the plan target to agree with the finalized session target', () => {
    const rendered = renderedFor(manifestFor([]), 'tailwind');

    expect(
      captureInternalInvariant(() =>
        validatedProjectPlan({
          rendered,
          plan: { target: 'css', files: [], artifacts: [] },
        }),
      ).message,
    ).toBe('Validated migration plan target differs from its finalized adapter session target.');
  });

  test('requires plan files to match every rendered proposal once, in order, and with canonical results', () => {
    const rendered = renderedFor(manifestFor(['alpha.html', 'beta.html']), 'tailwind');
    const [first, second] = unchangedFiles(rendered);
    const malformedSequences = [
      { name: 'omission', files: [first!] },
      { name: 'duplicate', files: [first!, first!] },
      { name: 'extra', files: [first!, second!, first!] },
      { name: 'reordered', files: [second!, first!] },
      {
        name: 'changed results',
        files: [
          {
            ...first!,
            results: [
              {
                status: 'parse-error' as const,
                fileName: first!.inputPath,
                code: 'template-parse-error' as const,
                reason: 'unrelated diagnostic',
                source: { start: 0, end: 1 },
              },
            ],
          },
          second!,
        ],
      },
    ];

    for (const scenario of malformedSequences) {
      const error = captureInternalInvariant(() =>
        validatedProjectPlan({
          rendered,
          plan: { target: 'tailwind', files: scenario.files, artifacts: [] },
        }),
      );
      expect(error.message, scenario.name).toBe(
        'Validated migration plan files must match rendered files one-to-one and in the same order.',
      );
    }
  });

  test('canonicalizes equivalent plan file identities to the rendered manifest identities', () => {
    const rendered = renderedFor(manifestFor(['card.html']), 'tailwind');
    const renderedFile = unchangedFiles(rendered)[0]!;

    const validated = validatedProjectPlan({
      rendered,
      plan: {
        target: 'tailwind',
        files: [
          {
            ...renderedFile,
            inputPath: noncanonicalPath(renderedFile.inputPath),
            outputPath: noncanonicalPath(renderedFile.outputPath),
          },
        ],
        artifacts: [],
      },
    });

    expect(validated.plan.files[0]).toEqual(renderedFile);
    expect(validated.plan.files[0]!.inputPath).toBe(rendered.files[0]!.inputPath);
    expect(validated.plan.files[0]!.outputPath).toBe(rendered.files[0]!.outputPath);
  });

  test('requires template artifacts to correspond exactly to changed file outputs in file order', () => {
    const rendered = renderedFor(manifestFor(['alpha.html', 'beta.html']), 'tailwind');
    const first = changedFile(rendered, 0, '<article>alpha</article>');
    const second = changedFile(rendered, 1, '<article>beta</article>');
    const files = [first.file, second.file];
    const validated = validatedProjectPlan({
      rendered,
      plan: { target: 'tailwind', files, artifacts: [first.artifact, second.artifact] },
    });
    const malformedPlans: readonly {
      readonly name: string;
      readonly files: MigrationPlan['files'];
      readonly artifacts: MigrationPlan['artifacts'];
    }[] = [
      { name: 'omission', files, artifacts: [first.artifact] },
      { name: 'duplicate', files, artifacts: [first.artifact, first.artifact] },
      { name: 'extra', files, artifacts: [first.artifact, second.artifact, first.artifact] },
      { name: 'reordered', files, artifacts: [second.artifact, first.artifact] },
      {
        name: 'unchanged file with artifact',
        files: [{ ...first.file, changed: false }, second.file],
        artifacts: [first.artifact, second.artifact],
      },
      {
        name: 'unrelated path',
        files,
        artifacts: [{ ...first.artifact, path: path.resolve('generated/unrelated.html') }, second.artifact],
      },
    ];

    expect(validated.plan.artifacts).toEqual([first.artifact, second.artifact]);
    expect(validated.plan.artifacts[0]).not.toBe(first.artifact);

    for (const scenario of malformedPlans) {
      const error = captureInternalInvariant(() =>
        validatedProjectPlan({
          rendered,
          plan: { target: 'tailwind', files: scenario.files, artifacts: scenario.artifacts },
        }),
      );
      expect(error.message, scenario.name).toBe(
        'Validated migration plan template artifacts must correspond exactly to changed file outputs in file order.',
      );
    }
  });

  test('accepts generated-template parse results as the only validation-owned result replacement', () => {
    const base = renderedFor(manifestFor(['card.html']), 'tailwind');
    const proposal = base.files[0]!;
    const rendered = renderedProject({
      ...base,
      files: [
        {
          ...proposal,
          edits: [{ range: { start: 0, end: 5 }, text: '<span>', inputId: 'replacement' }],
        },
      ],
    });
    const generatedParseError = {
      status: 'parse-error' as const,
      fileName: proposal.outputPath,
      code: 'generated-template-parse-error' as const,
      reason: 'generated output invalid',
      source: { start: 1, end: 2 },
    };

    const validated = validatedProjectPlan({
      rendered,
      plan: {
        target: 'tailwind',
        files: [
          {
            inputPath: proposal.inputPath,
            outputPath: proposal.outputPath,
            changed: false,
            results: [generatedParseError],
          },
        ],
        artifacts: [],
      },
    });

    expect(validated.plan.files[0]!.results).toEqual([generatedParseError]);
  });

  test.each(['created', 'updated', 'removed', 'unchanged'] as const)(
    'accepts CSS stylesheet metadata that exactly represents a %s artifact state',
    change => {
      const stylesheetPath = path.resolve('generated/flex-layout.css');
      const rendered = renderedFor(manifestFor(['card.html'], stylesheetPath), 'css');
      const artifact =
        change === 'unchanged' ? undefined : stylesheetArtifact(noncanonicalPath(stylesheetPath), change);

      const validated = validatedProjectPlan({
        rendered,
        plan: {
          target: 'css',
          files: unchangedFiles(rendered),
          artifacts: artifact === undefined ? [] : [artifact],
        },
        stylesheet: { path: noncanonicalPath(stylesheetPath), change },
      });

      expect(validated.stylesheet).toEqual({ path: stylesheetPath, change });
      expect(validated.plan.artifacts).toHaveLength(artifact === undefined ? 0 : 1);
      expect(validated.plan.artifacts[0]?.path).toBe(artifact === undefined ? undefined : stylesheetPath);
    },
  );

  test('rejects a CSS stylesheet path that collides with a template identity', () => {
    const stylesheetPath = path.resolve('generated/flex-layout.css');
    const manifest = projectManifest({
      invocation: {
        inputPath: 'templates',
        outputPath: 'generated',
        options: { mode: 'plan', stylesheetPath },
      },
      templates: [{ inputPath: path.resolve('templates/card.html'), outputPath: stylesheetPath }],
    });
    const rendered = renderedFor(manifest, 'css');

    const error = captureInternalInvariant(() =>
      validatedProjectPlan({
        rendered,
        plan: { target: 'css', files: unchangedFiles(rendered), artifacts: [] },
        stylesheet: { path: stylesheetPath, change: 'unchanged' },
      }),
    );

    expect(error.message).toBe(
      'Configured stylesheet path must not collide with any template input, output, or artifact path.',
    );
  });

  test('rejects every inconsistent CSS stylesheet metadata and artifact combination', () => {
    const stylesheetPath = path.resolve('generated/flex-layout.css');
    const otherStylesheetPath = path.resolve('generated/other.css');
    const rendered = renderedFor(manifestFor(['card.html'], stylesheetPath), 'css');
    const files = unchangedFiles(rendered);
    const created = stylesheetArtifact(stylesheetPath, 'created');
    const inconsistent = [
      { name: 'missing metadata', plan: { target: 'css' as const, files, artifacts: [] } },
      {
        name: 'changed metadata without artifact',
        plan: { target: 'css' as const, files, artifacts: [] },
        stylesheet: { path: stylesheetPath, change: 'created' as const },
      },
      { name: 'artifact without metadata', plan: { target: 'css' as const, files, artifacts: [created] } },
      {
        name: 'metadata path mismatch',
        plan: { target: 'css' as const, files, artifacts: [created] },
        stylesheet: { path: otherStylesheetPath, change: 'created' as const },
      },
      {
        name: 'artifact change mismatch',
        plan: { target: 'css' as const, files, artifacts: [created] },
        stylesheet: { path: stylesheetPath, change: 'updated' as const },
      },
      {
        name: 'multiple stylesheet artifacts',
        plan: {
          target: 'css' as const,
          files,
          artifacts: [created, stylesheetArtifact(otherStylesheetPath, 'created')],
        },
        stylesheet: { path: stylesheetPath, change: 'created' as const },
      },
    ];

    for (const scenario of inconsistent) {
      const error = captureInternalInvariant(() =>
        validatedProjectPlan({
          rendered,
          plan: scenario.plan,
          ...(scenario.stylesheet === undefined ? {} : { stylesheet: scenario.stylesheet }),
        }),
      );
      expect(error.message, scenario.name).toBe(
        'CSS stylesheet metadata must correspond exactly to its configured path and artifact change state.',
      );
    }
  });

  test.each([
    {
      name: 'metadata',
      artifacts: [] as const,
      stylesheet: { path: path.resolve('generated/flex-layout.css'), change: 'unchanged' as const },
    },
    {
      name: 'artifact',
      artifacts: [stylesheetArtifact(path.resolve('generated/flex-layout.css'), 'created')],
      stylesheet: undefined,
    },
  ])('rejects Tailwind stylesheet $name', scenario => {
    const rendered = renderedFor(manifestFor(['card.html']), 'tailwind');

    const error = captureInternalInvariant(() =>
      validatedProjectPlan({
        rendered,
        plan: { target: 'tailwind', files: unchangedFiles(rendered), artifacts: scenario.artifacts },
        ...(scenario.stylesheet === undefined ? {} : { stylesheet: scenario.stylesheet }),
      }),
    );

    expect(error.message).toBe('Tailwind migration plans cannot contain stylesheet artifacts or metadata.');
  });

  test('owns and deeply freezes the canonical plan, artifacts, and stylesheet metadata', () => {
    const stylesheetPath = path.resolve('generated/flex-layout.css');
    const rendered = renderedFor(manifestFor(['card.html'], stylesheetPath), 'css');
    const template = changedFile(rendered, 0, '<article>card</article>');
    const stylesheet = stylesheetArtifact(stylesheetPath, 'created');
    const filePlans: readonly FileMigrationPlan[] = [template];

    const validated = validatedProjectPlan({
      rendered,
      plan: {
        target: 'css',
        files: filePlans.map(item => item.file),
        artifacts: [template.artifact, stylesheet],
      },
      stylesheet: { path: stylesheetPath, change: 'created' },
    });

    for (const value of [
      validated,
      validated.plan,
      validated.plan.files,
      validated.plan.files[0]!,
      validated.plan.files[0]!.results,
      validated.plan.artifacts,
      validated.plan.artifacts[0]!,
      validated.plan.artifacts[0]!.original,
      validated.plan.artifacts[0]!.proposed,
      validated.stylesheet!,
    ]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
  });
});
