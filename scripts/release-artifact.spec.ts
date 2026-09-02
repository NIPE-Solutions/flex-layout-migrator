import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  inspectPackManifest,
  registryVersionExists,
  runReleaseArtifact,
  validateReleaseVersion,
} from './release-artifact.mjs';

const repositoryManifest = {
  name: '@nipe-solutions/flex-layout-codemod',
  version: '2.0.0-beta.1',
};

const packageFiles = ['CHANGELOG.md', 'LICENSE', 'README.md', 'dist/cli.js', 'dist/cli.js.map', 'package.json'];

const validPackManifest = {
  id: '@nipe-solutions/flex-layout-codemod@2.0.0-beta.1',
  name: '@nipe-solutions/flex-layout-codemod',
  version: '2.0.0-beta.1',
  size: 12_345,
  unpackedSize: 54_321,
  shasum: '0123456789abcdef0123456789abcdef01234567',
  integrity: 'sha512-YWJjZA==',
  filename: 'nipe-solutions-flex-layout-codemod-2.0.0-beta.1.tgz',
  files: packageFiles.map(path => ({ path, size: 100, mode: 0o644 })),
  entryCount: packageFiles.length,
  bundled: [],
};

describe('validateReleaseVersion', () => {
  it('accepts a positive 2.0.0 beta version', () => {
    expect(() => validateReleaseVersion('2.0.0-beta.1')).not.toThrow();
  });

  it.each(['2.0.0-beta.0', '2.0.0', '2.0.1-beta.1', '2.0.0-alpha.1', '2.0.0-beta.x'])(
    'rejects unsupported version %s',
    invalid => {
      expect(() => validateReleaseVersion(invalid)).toThrow(/release version boundary/i);
    },
  );
});

describe('registryVersionExists', () => {
  it.each([
    [200, true],
    [404, false],
  ])('maps registry status %i to %s', async (status, expected) => {
    const fetchImpl = vi.fn(async () => new Response(null, { status }));

    await expect(
      registryVersionExists({
        name: '@nipe-solutions/flex-layout-codemod',
        version: '2.0.0-beta.1',
        fetchImpl,
      }),
    ).resolves.toBe(expected);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://registry.npmjs.org/%40nipe-solutions%2Fflex-layout-codemod/2.0.0-beta.1',
    );
  });

  it.each([401, 429, 500])('rejects registry status %i', async status => {
    const fetchImpl = vi.fn(async () => new Response(null, { status }));

    await expect(
      registryVersionExists({
        name: '@nipe-solutions/flex-layout-codemod',
        version: '2.0.0-beta.1',
        fetchImpl,
      }),
    ).rejects.toThrow(new RegExp(`registry uniqueness boundary.*${status}`, 'i'));
  });

  it('preserves the registry boundary when the request fails', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network unavailable');
    });

    await expect(
      registryVersionExists({
        name: '@nipe-solutions/flex-layout-codemod',
        version: '2.0.0-beta.1',
        fetchImpl,
      }),
    ).rejects.toThrow(/registry uniqueness boundary.*request failed/i);
  });
});

describe('inspectPackManifest', () => {
  it('rejects a missing npm pack descriptor', () => {
    expect(() => inspectPackManifest({ repositoryManifest, packManifest: null })).toThrow(
      /pack manifest boundary.*exactly one npm pack descriptor/i,
    );
  });

  it('returns immutable release metadata for the exact package artifact', () => {
    const artifact = inspectPackManifest({ repositoryManifest, packManifest: validPackManifest });

    expect(artifact).toEqual({
      name: '@nipe-solutions/flex-layout-codemod',
      version: '2.0.0-beta.1',
      tarball: 'nipe-solutions-flex-layout-codemod-2.0.0-beta.1.tgz',
      integrity: 'sha512-YWJjZA==',
    });
    expect(Object.isFrozen(artifact)).toBe(true);
  });

  it.each([
    ['wrong package name', { name: '@nipe-solutions/other-package' }, /package identity boundary/i],
    ['wrong package version', { version: '2.0.0-beta.2' }, /package version boundary/i],
    ['absent integrity', { integrity: undefined }, /package integrity boundary/i],
    ['malformed integrity', { integrity: 'sha512-safe\ninjected=value' }, /package integrity boundary/i],
    ['wrong tarball filename', { filename: 'other-package-2.0.0-beta.1.tgz' }, /tarball filename boundary/i],
  ])('rejects a pack manifest with %s', (_label, overrides, expectedError) => {
    expect(() =>
      inspectPackManifest({
        repositoryManifest,
        packManifest: { ...validPackManifest, ...overrides },
      }),
    ).toThrow(expectedError);
  });

  it('rejects a pack manifest with a missing package file', () => {
    expect(() =>
      inspectPackManifest({
        repositoryManifest,
        packManifest: { ...validPackManifest, files: validPackManifest.files.slice(1) },
      }),
    ).toThrow(/package file surface boundary.*missing \[CHANGELOG\.md\]/i);
  });

  it('rejects a pack manifest with an unexpected package file', () => {
    expect(() =>
      inspectPackManifest({
        repositoryManifest,
        packManifest: {
          ...validPackManifest,
          files: [...validPackManifest.files, { path: 'src/main.ts', size: 100, mode: 0o644 }],
        },
      }),
    ).toThrow(/package file surface boundary.*unexpected \[src\/main\.ts\]/i);
  });

  it('rejects duplicate entries in the package file surface', () => {
    expect(() =>
      inspectPackManifest({
        repositoryManifest,
        packManifest: {
          ...validPackManifest,
          files: [...validPackManifest.files, validPackManifest.files[2]],
        },
      }),
    ).toThrow(/package file surface boundary.*duplicate \[README\.md\]/i);
  });
});

async function withTemporaryRepository(run: (repository: string) => Promise<void>) {
  const repository = await mkdtemp(join(tmpdir(), 'release-artifact-test-'));
  try {
    await writeFile(join(repository, 'package.json'), JSON.stringify(repositoryManifest), 'utf8');
    await run(repository);
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
}

describe('runReleaseArtifact', () => {
  it('rejects a non-main ref before registry lookup or packing', async () => {
    await withTemporaryRepository(async repository => {
      const fetchImpl = vi.fn();
      const execFileImpl = vi.fn();

      await expect(
        runReleaseArtifact({
          args: ['--github-output', join(repository, 'github-output.txt')],
          env: { GITHUB_REF_NAME: 'feature/release' },
          repository,
          fetchImpl,
          execFileImpl,
        }),
      ).rejects.toThrow(/protected branch boundary.*main/i);

      expect(fetchImpl).not.toHaveBeenCalled();
      expect(execFileImpl).not.toHaveBeenCalled();
    });
  });

  it('rejects an existing registry version before packing', async () => {
    await withTemporaryRepository(async repository => {
      const execFileImpl = vi.fn();

      await expect(
        runReleaseArtifact({
          args: ['--github-output', join(repository, 'github-output.txt')],
          env: { GITHUB_REF_NAME: 'main' },
          repository,
          fetchImpl: vi.fn(async () => new Response(null, { status: 200 })),
          execFileImpl,
        }),
      ).rejects.toThrow(/registry uniqueness boundary.*already exists/i);

      expect(execFileImpl).not.toHaveBeenCalled();
    });
  });

  it('packs once and writes machine-readable artifact metadata and GitHub outputs', async () => {
    await withTemporaryRepository(async repository => {
      const githubOutput = join(repository, 'github-output.txt');
      await writeFile(githubOutput, 'existing=kept\n', 'utf8');
      const executedCommands: Array<{ file: string; args: string[] }> = [];
      const execFileImpl = vi.fn(async (file: string, args: string[]) => {
        executedCommands.push({ file, args });
        return { stdout: JSON.stringify([validPackManifest]), stderr: '' };
      });

      const artifact = await runReleaseArtifact({
        args: ['--github-output', githubOutput],
        env: { GITHUB_REF_NAME: 'main' },
        repository,
        fetchImpl: vi.fn(async () => new Response(null, { status: 404 })),
        execFileImpl,
      });

      expect(artifact).toEqual({
        name: '@nipe-solutions/flex-layout-codemod',
        version: '2.0.0-beta.1',
        tarball: 'nipe-solutions-flex-layout-codemod-2.0.0-beta.1.tgz',
        integrity: 'sha512-YWJjZA==',
      });
      expect(execFileImpl).toHaveBeenCalledOnce();
      expect(execFileImpl).toHaveBeenCalledWith('npm', ['pack', '--json', '--ignore-scripts'], {
        cwd: repository,
      });
      expect(executedCommands).toEqual([{ file: 'npm', args: ['pack', '--json', '--ignore-scripts'] }]);
      expect(JSON.stringify(executedCommands)).not.toMatch(/npm publish|npm stage|stage approve|token/i);

      await expect(readFile(join(repository, 'release-artifact.json'), 'utf8')).resolves.toBe(
        `${JSON.stringify(artifact, null, 2)}\n`,
      );
      await expect(readFile(githubOutput, 'utf8')).resolves.toBe(
        [
          'existing=kept',
          'tarball=nipe-solutions-flex-layout-codemod-2.0.0-beta.1.tgz',
          'name=@nipe-solutions/flex-layout-codemod',
          'version=2.0.0-beta.1',
          'integrity=sha512-YWJjZA==',
          '',
        ].join('\n'),
      );
    });
  });
});
