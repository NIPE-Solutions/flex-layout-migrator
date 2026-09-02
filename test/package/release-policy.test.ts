import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const execFileAsync = promisify(execFile);
const repository = resolve(import.meta.dirname, '../..');

describe('release policy', () => {
  it('keeps the release pull request workflow inside the preparation trust boundary', async () => {
    const source = await readFile(new URL('../../.github/workflows/release-pr.yml', import.meta.url), 'utf8');
    const workflow = parse(source);

    expect(workflow.permissions).toEqual({
      contents: 'write',
      'pull-requests': 'write',
    });
    expect(workflow.jobs.version.steps.at(-1)).toEqual({
      uses: 'changesets/action@a45c4d594aa4e2c509dc14a9f2b3b67ba3780d0d',
      with: {
        version: 'npm run release:version',
        title: 'chore: version packages',
        commit: 'chore: version packages',
      },
      env: { GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}' },
    });

    expect(source).not.toMatch(/\b(?:npm publish|npm stage|git tag|gh release)\b/u);
    expect(source).not.toMatch(/\bNODE_AUTH_TOKEN\b|secrets\.NPM/u);
  });

  it('keeps staged publication inside the manual OIDC trust boundary', async () => {
    const source = await readFile(new URL('../../.github/workflows/stage-release.yml', import.meta.url), 'utf8');
    const workflow = parse(source);
    const job = workflow.jobs.stage;
    const runCommands = (job.steps as Array<{ run?: string }>)
      .map((step: { run?: string }) => step.run)
      .filter((command: string | undefined): command is string => command !== undefined);
    const serializedWorkflow = JSON.stringify(workflow);

    expect(workflow.on).toEqual({ workflow_dispatch: null });
    expect(workflow.concurrency).toEqual({
      group: 'npm-stage',
      'cancel-in-progress': false,
    });
    expect(job.if).toBe("github.ref == 'refs/heads/main'");
    expect(job.environment).toBe('npm');
    expect(job.permissions).toEqual({
      contents: 'read',
      'id-token': 'write',
    });

    expect(runCommands.filter(command => /\bnpm (?:publish|stage)\b/u.test(command))).toEqual([
      'npm stage publish "./${{ steps.release.outputs.tarball }}" --access public --tag beta',
    ]);
    expect(runCommands.join('\n')).not.toMatch(
      /\bnpm publish\b|\bnpm stage (?:approve|reject)\b|\bgit tag\b|\bgh release\b/u,
    );
    expect(serializedWorkflow).not.toMatch(/\bNODE_AUTH_TOKEN\b|secrets\.NPM|continue-on-error/u);
    expect(source).not.toMatch(
      /\bnpm publish\b|\bnpm stage (?:approve|reject)\b|\bgit tag\b|\bgh release\b|\bNODE_AUTH_TOKEN\b|secrets\.NPM|continue-on-error/u,
    );

    const uploadIndex = job.steps.findIndex(
      (step: { uses?: string }) => step.uses === 'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
    );
    const stageIndex = job.steps.findIndex(
      (step: { run?: string }) =>
        step.run === 'npm stage publish "./${{ steps.release.outputs.tarball }}" --access public --tag beta',
    );
    expect(uploadIndex).toBeGreaterThanOrEqual(0);
    expect(stageIndex).toBeGreaterThan(uploadIndex);
  });

  it('binds every workflow-invoked npm script to a non-publishing implementation', async () => {
    const source = await readFile(new URL('../../package.json', import.meta.url), 'utf8');
    const manifest = JSON.parse(source);
    const expectedScripts = {
      prepare: 'husky',
      verify:
        'npm run format && npm run lint && npm run typecheck && npm run test:coverage && npm run build && npm run package:check',
      format: 'prettier --check .',
      lint: 'eslint .',
      typecheck: 'tsc --noEmit',
      'test:coverage': 'vitest run --coverage',
      build: 'tsup',
      'package:check': 'node scripts/verify-package.mjs',
      'release:prepare': 'node scripts/release-artifact.mjs',
      'release:verify': 'node scripts/release-artifact.mjs --verify-retained',
    };
    const invokedScriptSource = Object.keys(expectedScripts)
      .map(name => manifest.scripts[name] ?? '')
      .join('\n');

    for (const [name, command] of Object.entries(expectedScripts)) {
      expect(manifest.scripts[name]).toBe(command);
    }
    for (const hook of [
      'preinstall',
      'install',
      'postinstall',
      'prepublish',
      'prepublishOnly',
      'prepack',
      'postpack',
      'publish',
      'postpublish',
      'preprepare',
      'postprepare',
      ...Object.keys(expectedScripts).flatMap(name => [`pre${name}`, `post${name}`]),
    ]) {
      expect(manifest.scripts[hook]).toBeUndefined();
    }
    expect(invokedScriptSource).not.toMatch(
      /\b(?:npm|pnpm|yarn) publish\b|\bnpm stage (?:publish|approve|reject)\b|\b(?:curl|wget)\b|\bgit (?:push|tag)\b|\bgh release\b|\bNODE_AUTH_TOKEN\b|secrets\.NPM/u,
    );
  });

  it('keeps every package script outside direct publication and tagging boundaries', async () => {
    const source = await readFile(new URL('../../package.json', import.meta.url), 'utf8');
    const manifest = JSON.parse(source);
    const packageScriptSource = Object.entries(manifest.scripts)
      .map(([name, command]) => `${name}: ${command}`)
      .join('\n');

    expect(manifest.scripts.release).toBeUndefined();
    expect(packageScriptSource).not.toMatch(
      /\b(?:npm|pnpm|yarn)\s+(?:publish|version\b|stage\s+(?:publish|approve|reject))|\bchangesets?\s+(?:publish|git-tag)\b|\bgit\s+tag\b|\bgh\s+release\b/iu,
    );
  });

  it('pins the contributor Changesets script to add instead of forwarding arbitrary subcommands', async () => {
    const source = await readFile(new URL('../../package.json', import.meta.url), 'utf8');
    const manifest = JSON.parse(source);

    expect(manifest.scripts.changeset).toBe('changeset add');
  });

  it('allowlists only add and version Changesets commands in package scripts', async () => {
    const source = await readFile(new URL('../../package.json', import.meta.url), 'utf8');
    const manifest = JSON.parse(source);
    const changesetsScripts = Object.fromEntries(
      Object.entries(manifest.scripts).filter(([, command]) => /\bchangesets?\b/u.test(String(command))),
    );

    expect(changesetsScripts).toEqual({
      changeset: 'changeset add',
      'version-packages': 'changeset version',
      'release:version': 'changeset version && npm install --package-lock-only --ignore-scripts',
    });
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
    expect(manifest.devDependencies.yaml).toBeDefined();
    expect(lockfile.packages[''].devDependencies.yaml).toBe(manifest.devDependencies.yaml);
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

      await execFileAsync('npm', ['run', 'release:version'], {
        cwd: temporaryDirectory,
        env: {
          ...process.env,
          PATH: `${join(repository, 'node_modules', '.bin')}${delimiter}${process.env.PATH ?? ''}`,
        },
      });

      const [versionedManifest, versionedLockfile] = await Promise.all(
        ['package.json', 'package-lock.json'].map(async path =>
          JSON.parse(await readFile(join(temporaryDirectory, path), 'utf8')),
        ),
      );
      expect(versionedManifest.version).toBe('2.0.0-beta.1');
      expect(versionedLockfile.packages[''].version).toBe('2.0.0-beta.1');
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
