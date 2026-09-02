import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const repository = resolve(import.meta.dirname, '../..');

describe('release policy', () => {
  it('keeps the release pull request workflow inside the preparation trust boundary', async () => {
    const workflow = await readFile(new URL('../../.github/workflows/release-pr.yml', import.meta.url), 'utf8');

    expect(workflow).toContain('contents: write');
    expect(workflow).toContain('pull-requests: write');
    expect(workflow).toContain('version: npm run release:version');

    for (const forbiddenCapability of [
      'id-token: write',
      'npm publish',
      'npm stage',
      'NODE_AUTH_TOKEN',
      'secrets.NPM',
      'git tag',
      'gh release',
      'releases: write',
      'actions/create-release',
    ]) {
      expect(workflow).not.toContain(forbiddenCapability);
    }
  });

  it('publishes public packages from main without automated release commits', async () => {
    const config = JSON.parse(await readFile(new URL('../../.changeset/config.json', import.meta.url), 'utf8'));

    expect(config).toMatchObject({
      access: 'public',
      baseBranch: 'main',
      updateInternalDependencies: 'patch',
      commit: false,
    });
  });

  it('commits the beta prerelease lane and exact npm toolchain', async () => {
    const [pre, manifest, lockfile] = await Promise.all(
      ['.changeset/pre.json', 'package.json', 'package-lock.json'].map(async path =>
        JSON.parse(await readFile(join(repository, path), 'utf8')),
      ),
    );

    expect(pre).toEqual({ mode: 'pre', tag: 'beta' });
    expect(manifest.packageManager).toBe('npm@11.19.0');
    expect(manifest.publishConfig).toEqual({ access: 'public' });
    expect(lockfile.packages[''].packageManager).toBeUndefined();
  });

  it('versions the pending changesets as the first public beta', async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'flex-layout-changeset-version-'));

    try {
      await Promise.all(
        ['package.json', 'package-lock.json', 'CHANGELOG.md', '.changeset'].map(path =>
          cp(join(repository, path), join(temporaryDirectory, path), { recursive: true }),
        ),
      );

      await execFileAsync(join(repository, 'node_modules', '.bin', 'changeset'), ['version'], {
        cwd: temporaryDirectory,
      });

      const versionedManifest = JSON.parse(await readFile(join(temporaryDirectory, 'package.json'), 'utf8'));
      expect(versionedManifest.version).toBe('2.0.0-beta.1');
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
