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
    const job = workflow.jobs.stage;
    const runCommands = (job.steps as Array<{ run?: string }>)
      .map((step: { run?: string }) => step.run)
      .filter((command: string | undefined): command is string => command !== undefined);

    expect(Object.keys(workflow).sort()).toEqual(['concurrency', 'jobs', 'name', 'on']);
    expect(Object.keys(workflow.jobs)).toEqual(['stage']);
    expect(job).toMatchObject({
      name: 'stage',
      if: "github.ref == 'refs/heads/main'",
      environment: 'npm',
      'runs-on': 'ubuntu-latest',
    });
    expect(job.steps[0]).toEqual({
      uses: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
    });
    expect(job.steps[1]).toEqual({
      uses: 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
      with: {
        'node-version': 24,
        'package-manager-cache': false,
      },
    });

    expect(runCommands).toEqual([
      'npm install --global npm@11.19.0',
      'npm ci',
      'npm run verify',
      'npm audit --audit-level=high',
      'npm run release:prepare -- --github-output "$GITHUB_OUTPUT"',
      'npm stage publish "./${{ steps.release.outputs.tarball }}" --access public --tag beta',
    ]);

    const releaseStep = job.steps.find((step: { id?: string }) => step.id === 'release');
    expect(releaseStep).toEqual({
      id: 'release',
      run: 'npm run release:prepare -- --github-output "$GITHUB_OUTPUT"',
    });

    const uploadStep = job.steps.find(
      (step: { uses?: string }) => step.uses === 'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
    );
    expect(uploadStep).toBeDefined();
    expect(uploadStep.with).toMatchObject({
      'if-no-files-found': 'error',
    });
    expect(uploadStep.with.path.trim().split('\n')).toEqual([
      '${{ steps.release.outputs.tarball }}',
      'release-artifact.json',
    ]);

    expect(job.steps.at(-1)).toEqual({
      name: 'Stage ${{ steps.release.outputs.name }}@${{ steps.release.outputs.version }} (${{ steps.release.outputs.integrity }})',
      run: 'npm stage publish "./${{ steps.release.outputs.tarball }}" --access public --tag beta',
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
});
