import { access, readFile, readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { siteContent } from '../../website/src/site-content';

const root = new URL('../../', import.meta.url);

function readRepositoryFile(path: string): Promise<string> {
  return readFile(new URL(path, root), 'utf8');
}

function sectionBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start === -1 || end === -1) {
    throw new Error(`Missing documentation section boundary: ${startMarker} -> ${endMarker}`);
  }
  return source.slice(start, end);
}

function sectionAfter(source: string, startMarker: string): string {
  const start = source.indexOf(startMarker);
  if (start === -1) throw new Error(`Missing documentation section boundary: ${startMarker}`);
  return source.slice(start);
}

function expectInOrder(source: string, markers: string[]): void {
  let previous = -1;
  for (const marker of markers) {
    const current = source.indexOf(marker);
    expect(current, `expected ${marker} after the preceding release step`).toBeGreaterThan(previous);
    previous = current;
  }
}

describe('maintainer documentation', () => {
  it('marks the enterprise architecture roadmap complete with final evidence', async () => {
    const architecture = await readRepositoryFile('docs/architecture/enterprise-architecture-rewrite.md');

    expect(architecture).toContain('### 9. Final structural and performance report');
    expect(architecture).toContain('Implemented and evidenced');
    expect(architecture).toContain('docs/maintenance/2026-09-04-enterprise-architecture-final.md');
    expect(architecture).toContain('CLI -> Discover -> Analyze -> Render -> Validate -> Apply -> Presentation');
  });

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

    const [readme, changesetReadme] = await Promise.all([
      readRepositoryFile('README.md'),
      readRepositoryFile('.changeset/README.md'),
    ]);
    expect(readme).toContain('Version 2.0.0 is stable');
    expect(readme).not.toMatch(/Version 2 remains a prerelease|current beta/iu);
    expect(readme).not.toContain('@beta');
    expect(readme).not.toContain('not published to npm yet');
    expect(readme).not.toContain('After the v2 beta is published');
    expect(readme).not.toContain('npm install -g @ng-flex/layout-migrator');
    expect(changesetReadme).toContain('reviewed release process');
    expect(changesetReadme).not.toContain('workflow is reviewed separately');
  });

  it('publishes the exact stable 2.0.0 operator contract with historical bootstrap context', async () => {
    const [readme, contributing, releaseProcess] = await Promise.all([
      readRepositoryFile('README.md'),
      readRepositoryFile('CONTRIBUTING.md'),
      readRepositoryFile('docs/architecture/release-process.md'),
    ]);
    const contributingRelease = sectionAfter(contributing, '## Releasing stable 2.0.0');
    const architectureRelease = sectionAfter(releaseProcess, '## Repository automation');

    expect(readme).toContain('npm install --save-dev --save-exact @nipe-solutions/flex-layout-codemod');
    expect(readme).toContain('docs/architecture/release-process.md');

    const exactTrustInputs = [
      'NIPE-Solutions/flex-layout-migrator',
      'stage-release.yml',
      'npm',
      'npm stage publish',
      'npm stage approve',
      'npm stage publish <tarball> --access public --tag latest',
      'npm publish <tarball> --access public --tag beta',
      '2.0.0-beta.1',
    ];
    for (const document of [contributingRelease, architectureRelease]) {
      for (const securityInput of exactTrustInputs) expect(document).toContain(securityInput);
    }

    const contributingTrust = sectionBetween(
      contributing,
      'Immediately after registry verification',
      '### Stage stable 2.0.0, review, and approve',
    );
    for (const trustInput of [
      'GitHub organization and repository: `NIPE-Solutions/flex-layout-migrator`',
      'Workflow filename: `stage-release.yml`',
      'GitHub environment: `npm`',
      'Allowed action: `npm stage publish` only',
    ]) {
      expect(contributingTrust).toContain(trustInput);
    }

    const architectureTrust = sectionBetween(
      releaseProcess,
      '## npm trust boundary',
      '## Historical bootstrap release',
    );
    for (const trustInput of [
      'for `NIPE-Solutions/flex-layout-migrator`',
      '- workflow filename: `stage-release.yml`;',
      '- environment: `npm`;',
      '- allowed action: `npm stage publish` only.',
    ]) {
      expect(architectureTrust).toContain(trustInput);
    }

    for (const operatorCommand of [
      'gh workflow run release-pr.yml',
      'npm run release:prepare -- --github-output',
      'npm run release:verify',
      'npm publish <tarball> --access public --tag beta',
      'gh workflow run stage-release.yml',
      'npm stage download <stage-id>',
      'npm stage approve <stage-id>',
      'npm view @nipe-solutions/flex-layout-codemod@2.0.0 name version dist.integrity --json',
      'npm view @nipe-solutions/flex-layout-codemod dist-tags --json',
      'npm exec --yes --package=@nipe-solutions/flex-layout-codemod@2.0.0 -- flex-layout-codemod --version',
      'git tag -s v2.0.0 <staged-commit> -m "Release 2.0.0"',
      'git push origin v2.0.0',
      'gh release create v2.0.0 --repo NIPE-Solutions/flex-layout-migrator --verify-tag --title 2.0.0 --generate-notes',
    ]) {
      expect(contributingRelease).toContain(operatorCommand);
    }

    const contributingBootstrap = sectionBetween(
      contributing,
      '### Historical bootstrap: completed beta.1 exception',
      '### Stage stable 2.0.0, review, and approve',
    );
    const architectureBootstrap = sectionBetween(
      releaseProcess,
      '## Historical bootstrap release',
      '## Approval and finalization',
    );
    expect(contributingBootstrap).toContain('explicit user approval');
    expect(architectureBootstrap).toContain('user explicitly approves');

    for (const document of [contributingRelease, releaseProcess]) {
      expect(document).toContain('exactly `2.0.0`');
      expect(document).toContain('`latest=2.0.0`');
      expect(document).toContain('`beta=2.0.0-beta.4`');
      expect(document).toContain('not a prerelease');
    }
    for (const currentInstructions of [
      sectionBetween(contributing, '### Stage stable 2.0.0, review, and approve', '### Recovery'),
      sectionBetween(releaseProcess, '## Approval and finalization', '## Error handling'),
    ]) {
      expect(currentInstructions).not.toContain('--tag beta');
      expect(currentInstructions).not.toContain('--prerelease');
    }

    for (const document of [contributingRelease, releaseProcess]) {
      expect(document).toContain('Do not add an npm token to GitHub');
      expect(document).not.toMatch(/\bgh secret set\b|\b(?:NPM_TOKEN|NODE_AUTH_TOKEN)\s*=|\bsecrets\.NPM\b/u);
    }

    expect(releaseProcess).toContain('computes SHA-512 SRI from the generated tarball bytes');
    expect(releaseProcess).toContain('smoke-installs and executes that exact tarball');
    expect(releaseProcess).toContain('rehashes the retained tarball immediately before staging');
  });

  it('keeps the README as a concise review-first path into the dedicated documentation', async () => {
    const readme = await readRepositoryFile('README.md');

    expectInOrder(readme, [
      'npm install --save-dev --save-exact @nipe-solutions/flex-layout-codemod',
      'npx flex-layout-codemod ./src --target tailwind --tailwind-stylesheet ./src/styles.css --plan --report ./reports/flex-layout.json',
      'npx flex-layout-codemod ./src --target tailwind --tailwind-stylesheet ./src/styles.css --write',
    ]);
    expect(readme).toContain('Plan first. Review unresolved cases. Write only when you are ready.');
    for (const destination of [
      'https://angular-flex-layout-codemod.nipesolutions.com/docs',
      'https://angular-flex-layout-codemod.nipesolutions.com/#playground',
      'https://angular-flex-layout-codemod.nipesolutions.com/docs/installation',
      'https://angular-flex-layout-codemod.nipesolutions.com/docs/compatibility',
      'https://angular-flex-layout-codemod.nipesolutions.com/docs/diagnostics',
      'https://angular-flex-layout-codemod.nipesolutions.com/docs/cli',
    ]) {
      expect(readme).toContain(destination);
    }
    expect(readme.split(/\r?\n/u).length).toBeLessThanOrEqual(100);
    expect(readme).not.toContain('npm install -g');
    expect(readme).not.toContain('production-ready conversion coverage');
    expect(readme).not.toContain('## Examples');
    expect(readme).not.toContain('## Reports and exit codes');
  });

  it('keeps current public guidance on the stable lane while retaining historical release evidence', async () => {
    const [contributing, releaseProcess, ...currentDocuments] = await Promise.all([
      readRepositoryFile('CONTRIBUTING.md'),
      readRepositoryFile('docs/architecture/release-process.md'),
      readRepositoryFile('README.md'),
      readRepositoryFile('docs/compatibility.md'),
      readRepositoryFile('website/src/site-content.ts'),
      readRepositoryFile('website/src/pages/home.tsx'),
      ...(await readdir(new URL('website/content/', root), { recursive: true }))
        .filter(path => path.endsWith('.md'))
        .map(path => readRepositoryFile(`website/content/${path}`)),
    ]);
    const contributingCurrent = contributing.replace(
      sectionBetween(
        contributing,
        '### Historical bootstrap: completed beta.1 exception',
        '### Stage stable 2.0.0, review, and approve',
      ),
      '',
    );
    const releaseProcessCurrent = releaseProcess.replace(
      sectionBetween(releaseProcess, '## Historical bootstrap release', '## Approval and finalization'),
      '',
    );

    for (const document of [contributingCurrent, releaseProcessCurrent, ...currentDocuments]) {
      expect(document).not.toMatch(/@beta|remains a prerelease|GitHub prerelease|latest[`'" ]+is reserved/iu);
    }
    expect(siteContent.installCommand).toBe('npm install --save-dev --save-exact @nipe-solutions/flex-layout-codemod');
  });

  it('states the automated and human-reviewed boundaries of the public claim audit', async () => {
    const audit = await readRepositoryFile('docs/maintenance/2026-09-05-documentation-claim-audit.md');

    expect(audit).toContain('## Enforcement boundaries');
    expect(audit).toContain('Registry-enforced facts');
    expect(audit).toContain('Static metadata and link contracts');
    expect(audit).toContain('Targeted exact public-copy tests');
    expect(audit).toContain('Human-reviewed prose');
    expect(audit).toContain('does not comprehensively validate authored prose');
    expect(audit).not.toContain('Detailed facts remain under `website/content/**` and are checked');
  });

  it('collects actionable, redacted context in both public issue forms', async () => {
    const forms = await Promise.all(
      ['.github/ISSUE_TEMPLATE/bug.yml', '.github/ISSUE_TEMPLATE/feature.yml'].map(async path =>
        parse(await readRepositoryFile(path)),
      ),
    );

    for (const form of forms) {
      const source = JSON.stringify(form);
      const ids = new Set(form.body.map((entry: { readonly id?: string }) => entry.id).filter(Boolean));
      expect([...ids]).toEqual(
        expect.arrayContaining([
          'version',
          'node-version',
          'angular-version',
          'target',
          'command',
          'source',
          'diagnostics',
        ]),
      );
      expect(source).toContain('Do not include secrets or confidential project code');
      expect(source).toContain('https://github.com/NIPE-Solutions/flex-layout-migrator/security/advisories/new');
    }
  });

  it('defines the exact grouped footer destinations', () => {
    expect(siteContent.footerGroups.map(group => group.label)).toEqual(['Project', 'NIPE', 'Legal', 'License']);
    expect(siteContent.footerGroups.find(group => group.label === 'NIPE')).toEqual({
      label: 'NIPE',
      links: [{ label: 'NIPE Open Source', href: 'https://opensource.nipesolutions.com' }],
    });
  });

  it('requires byte-for-byte staged artifact verification before approval and finalization', async () => {
    const [contributing, releaseProcess] = await Promise.all([
      readRepositoryFile('CONTRIBUTING.md'),
      readRepositoryFile('docs/architecture/release-process.md'),
    ]);
    const stagedReview = sectionBetween(
      contributing,
      '### Stage stable 2.0.0, review, and approve',
      '### Verify and finalize',
    );
    const contributingRelease = sectionAfter(contributing, '## Releasing stable 2.0.0');
    const architectureApproval = sectionBetween(releaseProcess, '## Approval and finalization', '## Error handling');

    for (const commandFragment of [
      "createHash('sha512')",
      'readFileSync(process.argv[1])',
      ".digest('base64')",
      'expected_sri=',
      'downloaded_sri=',
      'test "$downloaded_sri" = "$expected_sri"',
    ]) {
      expect(stagedReview).toContain(commandFragment);
    }
    expect(stagedReview).toContain('byte-for-byte');
    expect(architectureApproval).toContain('byte-for-byte');

    expectInOrder(contributingRelease, [
      'npm stage approve <stage-id>',
      'npm view @nipe-solutions/flex-layout-codemod@2.0.0',
      'git tag -s v2.0.0',
      'gh release create v2.0.0',
    ]);
    expectInOrder(architectureApproval, [
      'npm stage approve <stage-id>',
      'verifies the published integrity',
      'signed or protected Git tag',
      'GitHub release',
    ]);
  });

  it('documents safe rejection, identical restaging, and new-version recovery semantics', async () => {
    const [contributing, releaseProcess] = await Promise.all([
      readRepositoryFile('CONTRIBUTING.md'),
      readRepositoryFile('docs/architecture/release-process.md'),
    ]);
    const recovery = sectionBetween(contributing, '### Recovery', 'The architecture and trust-boundary rationale');
    const errorHandling = sectionBetween(releaseProcess, '## Error handling', '## Testing strategy');

    for (const section of [recovery, errorHandling]) {
      expect(section).toContain('npm stage list @nipe-solutions/flex-layout-codemod');
      expect(section).toContain('npm stage download <stage-id>');
      expect(section).toContain('npm stage reject <stage-id>');
      expect(section).toContain('removes the staged record');
      expect(section).toContain('byte-identical');
      expect(section).toContain('same version');
      expect(section).toContain('identical SHA-512 SRI');
      expect(section).toContain('retained `release-artifact.json` from the rejected stage');
      expect(section).toContain('Changed or rebuilt bytes cannot reuse `2.0.0`');
      expect(section).toContain('later reviewed patch');
      expect(section).toContain('overwrite or unpublish');
    }

    expectInOrder(recovery, [
      'npm stage list @nipe-solutions/flex-layout-codemod',
      'npm stage download <stage-id>',
      'npm stage reject <stage-id>',
    ]);
    for (const commandFragment of [
      'retained_metadata=',
      'retained_tarball=',
      'candidate_tarball=',
      'retained_sri=',
      'candidate_sri=',
      'cmp --silent "$retained_tarball" "$candidate_tarball"',
      'test "$candidate_sri" = "$retained_sri"',
    ]) {
      expect(recovery).toContain(commandFragment);
    }
  });

  it('requires release-sensitive changes to be reviewed by the release owner', async () => {
    const codeowners = await readFile(new URL('.github/CODEOWNERS', root), 'utf8');

    for (const protectedPath of [
      '/.github/workflows/release-pr.yml @Cylop',
      '/.github/workflows/stage-release.yml @Cylop',
      '/.changeset/ @Cylop',
      '/scripts/release-artifact.mjs @Cylop',
      '/scripts/verify-package.mjs @Cylop',
      '/package.json @Cylop',
    ]) {
      expect(codeowners).toContain(protectedPath);
    }
  });
});
