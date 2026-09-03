import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  inspectPackManifest,
  registryVersionExists,
  runReleaseArtifact,
  runRetainedReleaseArtifact,
  validateReleaseVersion,
} from './release-artifact.mjs';

const repositoryManifest = {
  name: '@nipe-solutions/flex-layout-codemod',
  version: '2.0.0-beta.1',
};

const packageFiles = ['CHANGELOG.md', 'LICENSE', 'README.md', 'dist/cli.js', 'dist/cli.js.map', 'package.json'];

const validIntegrity =
  'sha512-9Jhh+r3AV3ueQrk/q5yzjjwLjiu31YNEUwiSaanCkT/xltlT/xl29M58AExj5C85YykKP4CnpE9WeSmv4AbsaA==';

const validPackManifest = {
  id: '@nipe-solutions/flex-layout-codemod@2.0.0-beta.1',
  name: '@nipe-solutions/flex-layout-codemod',
  version: '2.0.0-beta.1',
  size: 12_345,
  unpackedSize: 54_321,
  shasum: '0123456789abcdef0123456789abcdef01234567',
  integrity: validIntegrity,
  filename: 'nipe-solutions-flex-layout-codemod-2.0.0-beta.1.tgz',
  files: packageFiles.map(path => ({ path, size: 100, mode: 0o644 })),
  entryCount: packageFiles.length,
  bundled: [],
};

const tarballFilename = validPackManifest.filename;
const metadataFilename = 'release-artifact.json';

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
      integrity: validIntegrity,
    });
    expect(Object.isFrozen(artifact)).toBe(true);
  });

  it.each([
    ['wrong package name', { name: '@nipe-solutions/other-package' }, /package identity boundary/i],
    ['wrong package version', { version: '2.0.0-beta.2' }, /package version boundary/i],
    ['absent integrity', { integrity: undefined }, /package integrity boundary/i],
    ['wrong tarball filename', { filename: 'other-package-2.0.0-beta.1.tgz' }, /tarball filename boundary/i],
  ])('rejects a pack manifest with %s', (_label, overrides, expectedError) => {
    expect(() =>
      inspectPackManifest({
        repositoryManifest,
        packManifest: { ...validPackManifest, ...overrides },
      }),
    ).toThrow(expectedError);
  });

  it.each([
    ['short digest', 'sha512-YWJjZA=='],
    ['long digest', 'sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='],
    ['malformed Base64', 'sha512-safe\ninjected=value'],
    [
      'non-canonical padding',
      'sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    ],
  ])('rejects %s integrity', (_label, integrity) => {
    expect(() =>
      inspectPackManifest({
        repositoryManifest,
        packManifest: { ...validPackManifest, integrity },
      }),
    ).toThrow(/package integrity boundary.*canonical.*64-byte SHA-512/i);
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

async function expectPathMissing(path: string) {
  await expect(access(path)).rejects.toMatchObject({ code: 'ENOENT' });
}

async function writeInvocationTarball(repository: string) {
  await writeFile(join(repository, tarballFilename), 'generated by this invocation', 'utf8');
}

async function withRealPackRepository(run: (repository: string) => Promise<void>) {
  const repository = await mkdtemp(join(tmpdir(), 'release-artifact-real-pack-'));
  try {
    await mkdir(join(repository, 'dist'));
    await writeFile(
      join(repository, 'package.json'),
      JSON.stringify({
        ...repositoryManifest,
        type: 'module',
        files: ['dist', 'README.md', 'LICENSE', 'CHANGELOG.md'],
        bin: { 'flex-layout-codemod': './dist/cli.js' },
      }),
      'utf8',
    );
    await writeFile(
      join(repository, 'dist', 'cli.js'),
      `#!/usr/bin/env node
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
const arguments_ = process.argv.slice(2);
if (arguments_.includes('--help')) {
  console.log('Plan migrations by default; use --write to apply. planned output HTML file or folder --write --report <path> --allow-unresolved --stylesheet <path> --orientation-breakpoints --print-with-breakpoints <aliases> path must end in .json single-file output must end in .html');
} else if (arguments_.includes('--version')) {
  console.log('${repositoryManifest.version}');
} else {
  const output = arguments_[arguments_.indexOf('--output') + 1];
  const report = arguments_[arguments_.indexOf('--report') + 1];
  const write = arguments_.includes('--write');
  if (arguments_.includes('--report')) {
    await mkdir(dirname(report), { recursive: true });
    await writeFile(report, JSON.stringify({
      schemaVersion: 2,
      mode: write ? 'write' : 'plan',
      application: write ? { status: 'applied' } : { status: 'skipped', reason: 'plan-only' },
    }));
  }
  if (!write) {
    console.log('Plan: 1 files scanned, 1 would change');
  } else if (arguments_.includes('--target') && arguments_.includes('css')) {
    const stylesheet = arguments_[arguments_.indexOf('--stylesheet') + 1];
    const existed = await access(output).then(() => true, () => false);
    const className = 'flm-5db098b5a4e638fdd1aff69e13d53ea10eb01e6c58577e5ecdf136b90eaee103';
    await mkdir(dirname(output), { recursive: true });
    await mkdir(dirname(stylesheet), { recursive: true });
    await writeFile(output, '<div class="' + className + '"></div>');
    await writeFile(stylesheet, '/* flex-layout-codemod:start schema=1 */\\n/* flex-layout-codemod:rule id=' + className.slice(4) + ' */\\n.' + className + ' {\\n  display: flex;\\n  box-sizing: border-box;\\n  flex-direction: row;\\n}\\n/* flex-layout-codemod:end */');
    console.log('Applied: 1 files scanned, ' + (existed ? '0 changed' : '1 changed'));
  } else {
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, '<div class="flex flex-row box-border"></div>');
    console.log('Applied: 1 files scanned, 1 changed');
  }
}
`,
      { encoding: 'utf8', mode: 0o755 },
    );
    await writeFile(join(repository, 'dist', 'cli.js.map'), '{}', 'utf8');
    await writeFile(join(repository, 'README.md'), '# Real pack fixture', 'utf8');
    await writeFile(join(repository, 'LICENSE'), 'Fixture license', 'utf8');
    await writeFile(join(repository, 'CHANGELOG.md'), '# Changelog', 'utf8');
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

  it('wraps a pack-process failure and removes only invocation-owned artifacts', async () => {
    await withTemporaryRepository(async repository => {
      const packFailure = new Error('npm pack failed');
      const unrelatedTarball = join(repository, 'preexisting-unrelated.tgz');
      await writeFile(unrelatedTarball, 'preserve me', 'utf8');

      await expect(
        runReleaseArtifact({
          args: ['--github-output', join(repository, 'github-output.txt')],
          env: { GITHUB_REF_NAME: 'main' },
          repository,
          fetchImpl: vi.fn(async () => new Response(null, { status: 404 })),
          execFileImpl: vi.fn(async () => {
            await writeInvocationTarball(repository);
            throw packFailure;
          }),
        }),
      ).rejects.toMatchObject({
        message: expect.stringMatching(/pack process release boundary failed/i),
        cause: packFailure,
      });

      await expectPathMissing(join(repository, tarballFilename));
      await expectPathMissing(join(repository, metadataFilename));
      await expect(readFile(unrelatedTarball, 'utf8')).resolves.toBe('preserve me');
    });
  });

  it.each([
    ['malformed npm pack JSON', '{not-json', /pack manifest boundary.*invalid npm pack JSON/i],
    ['missing npm pack descriptor', '[]', /pack manifest boundary.*exactly one npm pack descriptor/i],
  ])('cleans invocation-owned artifacts after %s', async (_label, stdout, expectedError) => {
    await withTemporaryRepository(async repository => {
      const unrelatedFile = join(repository, 'preexisting-unrelated.txt');
      await writeFile(unrelatedFile, 'preserve me', 'utf8');

      await expect(
        runReleaseArtifact({
          args: ['--github-output', join(repository, 'github-output.txt')],
          env: { GITHUB_REF_NAME: 'main' },
          repository,
          fetchImpl: vi.fn(async () => new Response(null, { status: 404 })),
          execFileImpl: vi.fn(async () => {
            await writeInvocationTarball(repository);
            return { stdout, stderr: '' };
          }),
        }),
      ).rejects.toThrow(expectedError);

      await expectPathMissing(join(repository, tarballFilename));
      await expectPathMissing(join(repository, metadataFilename));
      await expect(readFile(unrelatedFile, 'utf8')).resolves.toBe('preserve me');
    });
  });

  it('rejects descriptor integrity that differs from the tarball bytes and cleans release artifacts', async () => {
    await withTemporaryRepository(async repository => {
      const mismatchedDescriptor = {
        ...validPackManifest,
        integrity: 'sha512-kwXvPpifreXKzM0FEK0BgXoElGhxYkzrgTK2Dz7nb4XUnokw+L+BIuZIpD2Y/qZ5td9NhjDdYNwt1DM39LKdIg==',
      };

      await expect(
        runReleaseArtifact({
          args: ['--github-output', join(repository, 'github-output.txt')],
          env: { GITHUB_REF_NAME: 'main' },
          repository,
          fetchImpl: vi.fn(async () => new Response(null, { status: 404 })),
          execFileImpl: vi.fn(async () => {
            await writeInvocationTarball(repository);
            return { stdout: JSON.stringify([mismatchedDescriptor]), stderr: '' };
          }),
        }),
      ).rejects.toThrow(/tarball integrity boundary.*mismatch/i);

      await expectPathMissing(join(repository, tarballFilename));
      await expectPathMissing(join(repository, metadataFilename));
    });
  });

  it('cleans release artifacts when reading the tarball for hashing fails', async () => {
    await withTemporaryRepository(async repository => {
      const readFailure = new Error('tarball filesystem unavailable');

      await expect(
        runReleaseArtifact({
          args: ['--github-output', join(repository, 'github-output.txt')],
          env: { GITHUB_REF_NAME: 'main' },
          repository,
          fetchImpl: vi.fn(async () => new Response(null, { status: 404 })),
          execFileImpl: vi.fn(async () => {
            await writeInvocationTarball(repository);
            return { stdout: JSON.stringify([validPackManifest]), stderr: '' };
          }),
          readTarballImpl: vi.fn(async () => {
            throw readFailure;
          }),
        }),
      ).rejects.toMatchObject({
        message: expect.stringMatching(/tarball integrity boundary read failed/i),
        cause: readFailure,
      });

      await expectPathMissing(join(repository, tarballFilename));
      await expectPathMissing(join(repository, metadataFilename));
    });
  });

  it('cleans release artifacts when hashing the tarball bytes fails', async () => {
    await withTemporaryRepository(async repository => {
      const hashFailure = new Error('SHA-512 unavailable');

      await expect(
        runReleaseArtifact({
          args: ['--github-output', join(repository, 'github-output.txt')],
          env: { GITHUB_REF_NAME: 'main' },
          repository,
          fetchImpl: vi.fn(async () => new Response(null, { status: 404 })),
          execFileImpl: vi.fn(async () => {
            await writeInvocationTarball(repository);
            return { stdout: JSON.stringify([validPackManifest]), stderr: '' };
          }),
          hashBytesImpl: vi.fn(() => {
            throw hashFailure;
          }),
        }),
      ).rejects.toMatchObject({
        message: expect.stringMatching(/tarball integrity boundary hash failed/i),
        cause: hashFailure,
      });

      await expectPathMissing(join(repository, tarballFilename));
      await expectPathMissing(join(repository, metadataFilename));
    });
  });

  it('wraps a metadata write failure and cleans invocation-owned artifacts', async () => {
    await withTemporaryRepository(async repository => {
      const writeFailure = new Error('metadata filesystem unavailable');

      await expect(
        runReleaseArtifact({
          args: ['--github-output', join(repository, 'github-output.txt')],
          env: { GITHUB_REF_NAME: 'main' },
          repository,
          fetchImpl: vi.fn(async () => new Response(null, { status: 404 })),
          execFileImpl: vi.fn(async () => {
            await writeInvocationTarball(repository);
            return { stdout: JSON.stringify([validPackManifest]), stderr: '' };
          }),
          smokeTarballImpl: async () => {},
          writeFileImpl: vi.fn(async () => {
            throw writeFailure;
          }),
        }),
      ).rejects.toMatchObject({
        message: expect.stringMatching(/release metadata boundary write failed/i),
        cause: writeFailure,
      });

      await expectPathMissing(join(repository, tarballFilename));
      await expectPathMissing(join(repository, metadataFilename));
    });
  });

  it('wraps a GitHub output append failure and removes tarball and metadata', async () => {
    await withTemporaryRepository(async repository => {
      const appendFailure = new Error('GitHub output filesystem unavailable');
      const githubOutput = join(repository, 'github-output.txt');
      const unrelatedFile = join(repository, 'preexisting-unrelated.txt');
      await writeFile(githubOutput, 'existing=kept\n', 'utf8');
      await writeFile(unrelatedFile, 'preserve me', 'utf8');

      await expect(
        runReleaseArtifact({
          args: ['--github-output', githubOutput],
          env: { GITHUB_REF_NAME: 'main' },
          repository,
          fetchImpl: vi.fn(async () => new Response(null, { status: 404 })),
          execFileImpl: vi.fn(async () => {
            await writeInvocationTarball(repository);
            return { stdout: JSON.stringify([validPackManifest]), stderr: '' };
          }),
          smokeTarballImpl: async () => {},
          appendFileImpl: vi.fn(async () => {
            throw appendFailure;
          }),
        }),
      ).rejects.toMatchObject({
        message: expect.stringMatching(/GitHub output release boundary append failed/i),
        cause: appendFailure,
      });

      await expectPathMissing(join(repository, tarballFilename));
      await expectPathMissing(join(repository, metadataFilename));
      await expect(readFile(githubOutput, 'utf8')).resolves.toBe('existing=kept\n');
      await expect(readFile(unrelatedFile, 'utf8')).resolves.toBe('preserve me');
    });
  });

  it('packs once, hashes and smokes that exact tarball, then writes metadata and GitHub outputs', async () => {
    await withTemporaryRepository(async repository => {
      const githubOutput = join(repository, 'github-output.txt');
      await writeFile(githubOutput, 'existing=kept\n', 'utf8');
      const executedCommands: Array<{ file: string; args: string[] }> = [];
      let smokedArtifact:
        | {
            tarballPath: string;
            packageName: string;
            expectedVersion: string;
            bytes: string;
          }
        | undefined;
      const execFileImpl = vi.fn(async (file: string, args: string[]) => {
        executedCommands.push({ file, args });
        await writeInvocationTarball(repository);
        return { stdout: JSON.stringify([validPackManifest]), stderr: '' };
      });

      const artifact = await runReleaseArtifact({
        args: ['--github-output', githubOutput],
        env: { GITHUB_REF_NAME: 'main' },
        repository,
        fetchImpl: vi.fn(async () => new Response(null, { status: 404 })),
        execFileImpl,
        smokeTarballImpl: async ({
          tarballPath,
          packageName,
          expectedVersion,
        }: {
          tarballPath: string;
          packageName: string;
          expectedVersion: string;
        }) => {
          smokedArtifact = {
            tarballPath,
            packageName,
            expectedVersion,
            bytes: await readFile(tarballPath, 'utf8'),
          };
        },
      });

      expect(artifact).toEqual({
        name: '@nipe-solutions/flex-layout-codemod',
        version: '2.0.0-beta.1',
        tarball: 'nipe-solutions-flex-layout-codemod-2.0.0-beta.1.tgz',
        integrity: validIntegrity,
      });
      expect(execFileImpl).toHaveBeenCalledOnce();
      expect(execFileImpl).toHaveBeenCalledWith('npm', ['pack', '--json', '--ignore-scripts'], {
        cwd: repository,
      });
      expect(executedCommands).toEqual([{ file: 'npm', args: ['pack', '--json', '--ignore-scripts'] }]);
      expect(JSON.stringify(executedCommands)).not.toMatch(/npm publish|npm stage|stage approve|token/i);
      expect(smokedArtifact).toEqual({
        tarballPath: join(repository, tarballFilename),
        packageName: repositoryManifest.name,
        expectedVersion: repositoryManifest.version,
        bytes: 'generated by this invocation',
      });

      await expect(readFile(join(repository, 'release-artifact.json'), 'utf8')).resolves.toBe(
        `${JSON.stringify(artifact, null, 2)}\n`,
      );
      await expect(readFile(join(repository, tarballFilename), 'utf8')).resolves.toBe('generated by this invocation');
      await expect(readFile(githubOutput, 'utf8')).resolves.toBe(
        [
          'existing=kept',
          'tarball=nipe-solutions-flex-layout-codemod-2.0.0-beta.1.tgz',
          'name=@nipe-solutions/flex-layout-codemod',
          'version=2.0.0-beta.1',
          `integrity=${validIntegrity}`,
          '',
        ].join('\n'),
      );
    });
  });

  it('does not retain or describe a tarball that fails its exact-file smoke boundary', async () => {
    await withTemporaryRepository(async repository => {
      const smokeFailure = new Error('packaged CLI failed');

      await expect(
        runReleaseArtifact({
          args: ['--github-output', join(repository, 'github-output.txt')],
          env: { GITHUB_REF_NAME: 'main' },
          repository,
          fetchImpl: vi.fn(async () => new Response(null, { status: 404 })),
          execFileImpl: vi.fn(async () => {
            await writeInvocationTarball(repository);
            return { stdout: JSON.stringify([validPackManifest]), stderr: '' };
          }),
          smokeTarballImpl: async () => {
            throw smokeFailure;
          },
        }),
      ).rejects.toMatchObject({
        message: expect.stringMatching(/exact tarball smoke boundary failed/i),
        cause: smokeFailure,
      });

      await expectPathMissing(join(repository, tarballFilename));
      await expectPathMissing(join(repository, metadataFilename));
    });
  });

  it('rejects and cleans a tarball whose bytes change during smoke verification', async () => {
    await withTemporaryRepository(async repository => {
      await expect(
        runReleaseArtifact({
          args: ['--github-output', join(repository, 'github-output.txt')],
          env: { GITHUB_REF_NAME: 'main' },
          repository,
          fetchImpl: vi.fn(async () => new Response(null, { status: 404 })),
          execFileImpl: vi.fn(async () => {
            await writeInvocationTarball(repository);
            return { stdout: JSON.stringify([validPackManifest]), stderr: '' };
          }),
          smokeTarballImpl: async ({ tarballPath }: { tarballPath: string }) => {
            await writeFile(tarballPath, 'changed during smoke', 'utf8');
          },
        }),
      ).rejects.toThrow(/post-smoke tarball integrity boundary.*mismatch/i);

      await expectPathMissing(join(repository, tarballFilename));
      await expectPathMissing(join(repository, metadataFilename));
    });
  });

  it('real-packs, hashes, clean-installs, executes, and retains one byte-identical tarball', async () => {
    await withRealPackRepository(async repository => {
      const githubOutput = join(repository, 'github-output.txt');
      const artifact = await runReleaseArtifact({
        args: ['--github-output', githubOutput],
        env: { GITHUB_REF_NAME: 'main' },
        repository,
        fetchImpl: vi.fn(async () => new Response(null, { status: 404 })),
      });
      const retainedTarball = join(repository, artifact.tarball);
      const retainedBytes = await readFile(retainedTarball);

      expect(artifact.integrity).toBe(`sha512-${createHash('sha512').update(retainedBytes).digest('base64')}`);
      await expect(readFile(join(repository, metadataFilename), 'utf8')).resolves.toBe(
        `${JSON.stringify(artifact, null, 2)}\n`,
      );
      await expect(readFile(githubOutput, 'utf8')).resolves.toContain(`tarball=${artifact.tarball}\n`);
      await expect(
        runRetainedReleaseArtifact({
          env: { GITHUB_REF_NAME: 'main' },
          repository,
        }),
      ).resolves.toEqual(artifact);
    });
  });
});

describe('runRetainedReleaseArtifact', () => {
  it('rehashes the exact retained tarball against release metadata before staging', async () => {
    await withTemporaryRepository(async repository => {
      await writeInvocationTarball(repository);
      await writeFile(
        join(repository, metadataFilename),
        `${JSON.stringify(
          {
            name: repositoryManifest.name,
            version: repositoryManifest.version,
            tarball: tarballFilename,
            integrity: validIntegrity,
          },
          null,
          2,
        )}\n`,
        'utf8',
      );

      await expect(
        runRetainedReleaseArtifact({
          env: { GITHUB_REF_NAME: 'main' },
          repository,
        }),
      ).resolves.toEqual({
        name: repositoryManifest.name,
        version: repositoryManifest.version,
        tarball: tarballFilename,
        integrity: validIntegrity,
      });
    });
  });

  it('rejects changed retained bytes without deleting the forensic artifacts', async () => {
    await withTemporaryRepository(async repository => {
      const metadataPath = join(repository, metadataFilename);
      const tarballPath = join(repository, tarballFilename);
      await writeFile(tarballPath, 'changed after preparation', 'utf8');
      await writeFile(
        metadataPath,
        `${JSON.stringify({
          name: repositoryManifest.name,
          version: repositoryManifest.version,
          tarball: tarballFilename,
          integrity: validIntegrity,
        })}\n`,
        'utf8',
      );

      await expect(
        runRetainedReleaseArtifact({
          env: { GITHUB_REF_NAME: 'main' },
          repository,
        }),
      ).rejects.toThrow(/retained tarball integrity boundary.*mismatch/i);

      await expect(readFile(tarballPath, 'utf8')).resolves.toBe('changed after preparation');
      await expect(readFile(metadataPath, 'utf8')).resolves.toContain(validIntegrity);
    });
  });
});
