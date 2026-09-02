import { access, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url);

describe('maintainer documentation', () => {
  it('provides contribution, security, support, and governance files', async () => {
    const required = [
      '.github/CODEOWNERS',
      '.github/pull_request_template.md',
      'CHANGELOG.md',
      'CODE_OF_CONDUCT.md',
      'CONTRIBUTING.md',
      'SECURITY.md',
      'docs/SUPPORT.md',
    ];
    await Promise.all(required.map(path => access(new URL(path, root))));

    const contributing = await readFile(new URL('CONTRIBUTING.md', root), 'utf8');
    expect(contributing).toContain('npm ci');
    expect(contributing).toContain('npm run verify');

    const security = await readFile(new URL('SECURITY.md', root), 'utf8');
    expect(security).toContain('private vulnerability reporting');

    const readme = await readFile(new URL('README.md', root), 'utf8');
    expect(readme).toContain('Version 2 is under active development');
    expect(readme).not.toContain('npm install -g @ng-flex/layout-migrator');
  });

  it('publishes the exact npm beta operator contract', async () => {
    const [readme, contributing, releaseProcess] = await Promise.all(
      ['README.md', 'CONTRIBUTING.md', 'docs/architecture/release-process.md'].map(path =>
        readFile(new URL(path, root), 'utf8'),
      ),
    );
    const publicReleaseDocs = [readme, contributing, releaseProcess].join('\n');

    expect(readme).toContain('npm install --save-dev @nipe-solutions/flex-layout-codemod@beta');
    expect(readme).toContain('docs/architecture/release-process.md');

    for (const securityInput of [
      'NIPE-Solutions/flex-layout-migrator',
      'stage-release.yml',
      'npm',
      'npm stage publish',
      'npm stage approve',
      'npm publish <tarball> --access public --tag beta',
      '2.0.0-beta.1',
    ]) {
      expect(publicReleaseDocs).toContain(securityInput);
    }

    for (const operatorCommand of [
      'gh workflow run release-pr.yml',
      'npm run release:prepare -- --github-output',
      'npm publish <tarball> --access public --tag beta',
      'gh workflow run stage-release.yml',
      'npm stage download <stage-id>',
      'npm stage approve <stage-id>',
      'npm view @nipe-solutions/flex-layout-codemod@<version>',
      'git tag -s <version>',
      'gh release create <version>',
    ]) {
      expect(contributing).toContain(operatorCommand);
    }

    expect(contributing).toContain('one-time bootstrap exception');
    expect(contributing).toContain('explicit user approval');
    expect(publicReleaseDocs).toContain('Do not add an npm token to GitHub');
    expect(publicReleaseDocs).not.toMatch(/\bgh secret set\b|\b(?:NPM_TOKEN|NODE_AUTH_TOKEN)\s*=|\bsecrets\.NPM\b/u);
  });

  it('requires release-sensitive changes to be reviewed by the release owner', async () => {
    const codeowners = await readFile(new URL('.github/CODEOWNERS', root), 'utf8');

    for (const protectedPath of [
      '/.github/workflows/release-pr.yml @Cylop',
      '/.github/workflows/stage-release.yml @Cylop',
      '/.changeset/ @Cylop',
      '/scripts/release-artifact.mjs @Cylop',
      '/package.json @Cylop',
    ]) {
      expect(codeowners).toContain(protectedPath);
    }
  });
});
