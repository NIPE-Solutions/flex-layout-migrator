import * as path from 'node:path';
import type { ArtifactState, FileMigrationPlan, PlannedOutputArtifact } from '../migrator/migration-plan';
import { MigrationApplicationError } from '../migrator/migration-application.error';
import type { StylesheetMigrationResult } from '../report/migration-report.builder';
import { analyzedProject } from './analyzed-project';
import { projectManifest, type ManifestTemplate, type ProjectManifest } from './project-manifest';
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

function unchangedFile(file: ManifestTemplate): FileMigrationPlan {
  return {
    file: {
      inputPath: file.inputPath,
      outputPath: file.outputPath,
      changed: false,
      results: [],
    },
  };
}

function templateArtifact(file: ManifestTemplate, contents: string): PlannedOutputArtifact {
  return {
    kind: 'template',
    path: file.outputPath,
    original: { status: 'absent' },
    proposed: { status: 'present', contents },
  };
}

function changedFile(file: ManifestTemplate, contents: string): FileMigrationPlan {
  return {
    file: {
      inputPath: file.inputPath,
      outputPath: file.outputPath,
      changed: true,
      results: [],
    },
    artifact: templateArtifact(file, contents),
  };
}

function renderedFor(
  manifest: ProjectManifest,
  target: 'css' | 'tailwind',
  files: readonly FileMigrationPlan[] = manifest.templates.map(file => unchangedFile(file)),
): RenderedProject {
  const analyzed = analyzedProject({
    manifest,
    templates: manifest.templates.map(file => ({
      status: 'parse-error',
      file,
      source: '<div',
      parseResult: {
        status: 'parse-error',
        diagnostics: [{ message: 'incomplete start tag', source: { start: 0, end: 4 } }],
      },
    })),
  });

  return renderedProject({
    analyzed,
    files,
    session: target === 'tailwind' ? { target } : { target, rules: [] },
  });
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
  test('requires plan files to match every rendered file once, in order, and with the same state', () => {
    const manifest = manifestFor(['alpha.html', 'beta.html']);
    const rendered = renderedFor(manifest, 'tailwind');
    const first = rendered.files[0]!.file;
    const second = rendered.files[1]!.file;
    const malformedSequences = [
      { name: 'omission', files: [first] },
      { name: 'duplicate', files: [first, first] },
      { name: 'extra', files: [first, second, first] },
      { name: 'reordered', files: [second, first] },
      { name: 'changed state', files: [{ ...first, changed: true }, second] },
      {
        name: 'changed results',
        files: [
          {
            ...first,
            results: [
              {
                status: 'parse-error' as const,
                fileName: first.inputPath,
                code: 'template-parse-error' as const,
                reason: 'unrelated diagnostic',
                source: { start: 0, end: 1 },
              },
            ],
          },
          second,
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
    const manifest = manifestFor(['card.html']);
    const rendered = renderedFor(manifest, 'tailwind');
    const renderedFile = rendered.files[0]!.file;

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
    expect(validated.plan.files[0]!.inputPath).toBe(manifest.templates[0]!.inputPath);
    expect(validated.plan.files[0]!.outputPath).toBe(manifest.templates[0]!.outputPath);
  });

  test('requires plan template artifacts to exactly match rendered file artifacts in file order', () => {
    const manifest = manifestFor(['alpha.html', 'beta.html']);
    const rendered = renderedFor(manifest, 'tailwind', [
      changedFile(manifest.templates[0]!, '<article>alpha</article>'),
      changedFile(manifest.templates[1]!, '<article>beta</article>'),
    ]);
    const first = rendered.files[0]!.artifact!;
    const second = rendered.files[1]!.artifact!;
    const files = rendered.files.map(file => file.file);
    const validated = validatedProjectPlan({
      rendered,
      plan: { target: 'tailwind', files, artifacts: [first, second] },
    });
    const malformedArtifacts = [
      { name: 'omission', artifacts: [first] },
      { name: 'duplicate', artifacts: [first, first] },
      { name: 'extra', artifacts: [first, second, first] },
      { name: 'reordered', artifacts: [second, first] },
      {
        name: 'different state',
        artifacts: [
          first,
          { ...second, proposed: { status: 'present' as const, contents: '<article>tampered</article>' } },
        ],
      },
    ];

    expect(validated.plan.artifacts).toEqual([first, second]);
    expect(validated.plan.artifacts[0]).not.toBe(first);

    for (const scenario of malformedArtifacts) {
      const error = captureInternalInvariant(() =>
        validatedProjectPlan({
          rendered,
          plan: { target: 'tailwind', files, artifacts: scenario.artifacts },
        }),
      );
      expect(error.message, scenario.name).toBe(
        'Validated migration plan template artifacts must match rendered template artifacts in file order.',
      );
    }
  });

  test('requires every rendered template artifact to describe its changed file output', () => {
    const manifest = manifestFor(['card.html']);
    const unrelatedArtifact = {
      ...templateArtifact(manifest.templates[0]!, '<article>card</article>'),
      path: path.resolve('generated/unrelated.html'),
    };
    const rendered = renderedFor(manifest, 'tailwind', [
      {
        file: { ...unchangedFile(manifest.templates[0]!).file, changed: true },
        artifact: unrelatedArtifact,
      },
    ]);

    const error = captureInternalInvariant(() =>
      validatedProjectPlan({
        rendered,
        plan: { target: 'tailwind', files: rendered.files.map(file => file.file), artifacts: [unrelatedArtifact] },
      }),
    );

    expect(error.message).toBe('Rendered template artifacts must correspond exactly to changed file outputs.');
  });

  test.each(['created', 'updated', 'removed', 'unchanged'] as const)(
    'accepts CSS stylesheet metadata that exactly represents a %s artifact state',
    change => {
      const stylesheetPath = path.resolve('generated/flex-layout.css');
      const manifest = manifestFor(['card.html'], stylesheetPath);
      const rendered = renderedFor(manifest, 'css');
      const artifact =
        change === 'unchanged' ? undefined : stylesheetArtifact(noncanonicalPath(stylesheetPath), change);

      const validated = validatedProjectPlan({
        rendered,
        plan: {
          target: 'css',
          files: rendered.files.map(file => file.file),
          artifacts: artifact === undefined ? [] : [artifact],
        },
        stylesheet: { path: noncanonicalPath(stylesheetPath), change },
      });

      expect(validated.stylesheet).toEqual({ path: stylesheetPath, change });
      expect(validated.plan.artifacts).toHaveLength(artifact === undefined ? 0 : 1);
      expect(validated.plan.artifacts[0]?.path).toBe(artifact === undefined ? undefined : stylesheetPath);
    },
  );

  test('rejects every inconsistent CSS stylesheet metadata and artifact combination', () => {
    const stylesheetPath = path.resolve('generated/flex-layout.css');
    const otherStylesheetPath = path.resolve('generated/other.css');
    const manifest = manifestFor(['card.html'], stylesheetPath);
    const rendered = renderedFor(manifest, 'css');
    const files = rendered.files.map(file => file.file);
    const created = stylesheetArtifact(stylesheetPath, 'created');
    const inconsistent = [
      {
        name: 'missing metadata for unchanged stylesheet',
        plan: { target: 'css' as const, files, artifacts: [] },
      },
      {
        name: 'changed metadata without artifact',
        plan: { target: 'css' as const, files, artifacts: [] },
        stylesheet: { path: stylesheetPath, change: 'created' as const },
      },
      {
        name: 'artifact without metadata',
        plan: { target: 'css' as const, files, artifacts: [created] },
      },
      {
        name: 'metadata path mismatch',
        plan: { target: 'css' as const, files, artifacts: [created] },
        stylesheet: { path: otherStylesheetPath, change: 'created' as const },
      },
      {
        name: 'artifact path mismatch',
        plan: {
          target: 'css' as const,
          files,
          artifacts: [stylesheetArtifact(otherStylesheetPath, 'created')],
        },
        stylesheet: { path: stylesheetPath, change: 'created' as const },
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

  test('rejects CSS stylesheet state when the analyzed invocation has no configured stylesheet path', () => {
    const stylesheetPath = path.resolve('generated/flex-layout.css');
    const rendered = renderedFor(manifestFor(['card.html']), 'css');

    const error = captureInternalInvariant(() =>
      validatedProjectPlan({
        rendered,
        plan: { target: 'css', files: rendered.files.map(file => file.file), artifacts: [] },
        stylesheet: { path: stylesheetPath, change: 'unchanged' },
      }),
    );

    expect(error.message).toBe(
      'CSS stylesheet metadata must correspond exactly to its configured path and artifact change state.',
    );
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
        plan: { target: 'tailwind', files: rendered.files.map(file => file.file), artifacts: scenario.artifacts },
        ...(scenario.stylesheet === undefined ? {} : { stylesheet: scenario.stylesheet }),
      }),
    );

    expect(error.message).toBe('Tailwind migration plans cannot contain stylesheet artifacts or metadata.');
  });
});
