import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

describe('continuous integration', () => {
  it('guards the exact release pull request job to the main ref', async () => {
    const source = await readFile(new URL('../../.github/workflows/release-pr.yml', import.meta.url), 'utf8');
    const workflow = parse(source);

    expect(Object.keys(workflow).sort()).toEqual(['concurrency', 'jobs', 'name', 'on', 'permissions']);
    expect(workflow.on).toEqual({
      push: { branches: ['main'] },
      workflow_dispatch: null,
    });
    expect(workflow.jobs).toEqual({
      version: {
        name: 'version',
        if: "github.ref == 'refs/heads/main'",
        'runs-on': 'ubuntu-latest',
        steps: [
          { uses: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1' },
          {
            uses: 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
            with: { 'node-version': 24 },
          },
          { run: 'npm install --global npm@11.19.0' },
          { run: 'npm ci' },
          {
            uses: 'changesets/action@a45c4d594aa4e2c509dc14a9f2b3b67ba3780d0d',
            with: {
              version: 'npm run release:version',
              title: 'chore: version packages',
              commit: 'chore: version packages',
            },
            env: { GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}' },
          },
        ],
      },
    });
  });

  it('serializes release pull request updates without cancelling active runs', async () => {
    const source = await readFile(new URL('../../.github/workflows/release-pr.yml', import.meta.url), 'utf8');
    const workflow = parse(source);

    expect(workflow.concurrency).toEqual({
      group: 'release-pr',
      'cancel-in-progress': false,
    });
  });

  it('stages only the verified artifact with the exact npm toolchain', async () => {
    const source = await readFile(new URL('../../.github/workflows/stage-release.yml', import.meta.url), 'utf8');
    const workflow = parse(source);

    expect(Object.keys(workflow).sort()).toEqual(['concurrency', 'jobs', 'name', 'on']);
    expect(workflow.jobs).toEqual({
      stage: {
        name: 'stage',
        if: "github.ref == 'refs/heads/main'",
        'runs-on': 'ubuntu-latest',
        environment: 'npm',
        permissions: {
          contents: 'read',
          'id-token': 'write',
        },
        steps: [
          {
            uses: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
          },
          {
            uses: 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
            with: {
              'node-version': 24,
              'package-manager-cache': false,
              'registry-url': 'https://registry.npmjs.org',
            },
          },
          { run: 'npm install --global npm@11.19.0' },
          { run: 'npm ci' },
          { run: 'npm run verify' },
          { run: 'npm audit --audit-level=high' },
          {
            id: 'release',
            run: 'npm run release:prepare -- --github-output "$GITHUB_OUTPUT"',
          },
          {
            uses: 'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
            with: {
              name: 'npm-release',
              path: '${{ steps.release.outputs.tarball }}\nrelease-artifact.json\n',
              'if-no-files-found': 'error',
            },
          },
          { run: 'npm run release:verify' },
          {
            name: 'Stage ${{ steps.release.outputs.name }}@${{ steps.release.outputs.version }} (${{ steps.release.outputs.integrity }})',
            run: 'npm stage publish "./${{ steps.release.outputs.tarball }}" --access public --tag beta',
          },
        ],
      },
    });
  });

  it('defines stable, least-privilege required jobs on Node 24', async () => {
    const workflow = await readFile(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');

    for (const job of ['quality:', 'test:', 'package:', 'dependency-review:']) {
      expect(workflow).toContain(job);
    }
    expect(workflow).toContain('node-version: 24');
    expect(workflow).toContain('npm ci');
    expect(workflow).toContain('contents: read');
    expect(workflow).not.toContain('contents: write');
  });

  it('records the non-thresholded architecture benchmark as a retained CI artifact', async () => {
    const source = await readFile(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
    const workflow = parse(source);

    expect(workflow.jobs.benchmark).toEqual({
      name: 'architecture benchmark',
      'runs-on': 'ubuntu-latest',
      steps: [
        { uses: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1' },
        {
          uses: 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
          with: { 'node-version': 24, cache: 'npm' },
        },
        { run: 'npm ci' },
        { run: 'npm run build' },
        { run: 'npm run benchmark:architecture -- --json architecture-benchmark.json' },
        {
          uses: 'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
          with: {
            name: 'architecture-benchmark',
            path: 'architecture-benchmark.json',
            'if-no-files-found': 'error',
          },
        },
      ],
    });
  });
});
