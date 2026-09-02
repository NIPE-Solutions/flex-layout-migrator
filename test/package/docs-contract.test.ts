import { access, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

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

function expectCurrentBetaBoundaries(readme: string): void {
  expect(readme).toContain('writes changed templates in place when neither `--dry-run` nor `--output` is supplied');
  expect(readme).toContain('Tailwind CSS v4 remains the default target');
  expect(readme).toContain('native CSS target is available with `--target css --stylesheet <path>`');
  expect(readme).toContain('exactly eight Flex semantic families');
  expect(readme).toContain(
    'Grid, visibility, responsive class/style, orientation, print, and custom aliases remain preserved for CSS',
  );
  expect(readme).toContain('Responsive `imgSrc` remains an independent opt-in native `<picture>` migration');
  expect(readme).toContain('--responsive-images');
  expect(readme).toContain('former parent');
  expect(readme).toContain('Orientation and print conversion require explicit source-configuration evidence');
  expect(readme).toContain('--orientation-breakpoints');
  expect(readme).toContain('--print-with-breakpoints');
  expect(readme).toContain('adaptive plan-by-default workflow is a later CLI improvement');
  expect(readme).toContain('unconfirmed recovery');
}

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

    const [readme, changesetReadme] = await Promise.all([
      readRepositoryFile('README.md'),
      readRepositoryFile('.changeset/README.md'),
    ]);
    expect(readme).toContain('Version 2 remains a prerelease');
    expect(readme).not.toContain('not published to npm yet');
    expect(readme).not.toContain('After the v2 beta is published');
    expect(readme).not.toContain('npm install -g @ng-flex/layout-migrator');
    expect(changesetReadme).toContain('reviewed beta release process');
    expect(changesetReadme).not.toContain('workflow is reviewed separately');
  });

  it('publishes the exact npm beta operator contract', async () => {
    const [readme, contributing, releaseProcess] = await Promise.all([
      readRepositoryFile('README.md'),
      readRepositoryFile('CONTRIBUTING.md'),
      readRepositoryFile('docs/architecture/release-process.md'),
    ]);
    const contributingRelease = sectionAfter(contributing, '## Releasing a beta');
    const architectureRelease = sectionAfter(releaseProcess, '## Repository automation');

    expect(readme).toContain('npm install --save-dev --save-exact @nipe-solutions/flex-layout-codemod@beta');
    expect(readme).toContain('docs/architecture/release-process.md');

    const exactTrustInputs = [
      'NIPE-Solutions/flex-layout-migrator',
      'stage-release.yml',
      'npm',
      'npm stage publish',
      'npm stage approve',
      'npm publish <tarball> --access public --tag beta',
      '2.0.0-beta.1',
    ];
    for (const document of [contributingRelease, architectureRelease]) {
      for (const securityInput of exactTrustInputs) expect(document).toContain(securityInput);
    }

    const contributingTrust = sectionBetween(
      contributing,
      'Immediately after registry verification',
      '### Later publications: stage, review, and approve',
    );
    for (const trustInput of [
      'GitHub organization and repository: `NIPE-Solutions/flex-layout-migrator`',
      'Workflow filename: `stage-release.yml`',
      'GitHub environment: `npm`',
      'Allowed action: `npm stage publish` only',
    ]) {
      expect(contributingTrust).toContain(trustInput);
    }

    const architectureTrust = sectionBetween(releaseProcess, '## npm trust boundary', '## Bootstrap release');
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
      'npm view @nipe-solutions/flex-layout-codemod@<version>',
      'git tag -s <version>',
      'gh release create <version>',
    ]) {
      expect(contributingRelease).toContain(operatorCommand);
    }

    const contributingBootstrap = sectionBetween(
      contributing,
      '### First publication: one-time bootstrap exception',
      '### Later publications: stage, review, and approve',
    );
    const architectureBootstrap = sectionBetween(
      releaseProcess,
      '## Bootstrap release',
      '## Approval and finalization',
    );
    expect(contributingBootstrap).toContain('explicit user approval');
    expect(architectureBootstrap).toContain('user explicitly approves');

    for (const document of [contributingRelease, releaseProcess]) {
      expect(document).toContain('Do not add an npm token to GitHub');
      expect(document).not.toMatch(/\bgh secret set\b|\b(?:NPM_TOKEN|NODE_AUTH_TOKEN)\s*=|\bsecrets\.NPM\b/u);
    }

    expect(releaseProcess).toContain('computes SHA-512 SRI from the generated tarball bytes');
    expect(releaseProcess).toContain('smoke-installs and executes that exact tarball');
    expect(releaseProcess).toContain('rehashes the retained tarball immediately before staging');
  });

  it('documents a safe and reproducible beta onboarding path', async () => {
    const readme = await readRepositoryFile('README.md');

    expectInOrder(readme, [
      'npx @nipe-solutions/flex-layout-codemod@beta ./src --dry-run',
      'npm install --save-dev --save-exact @nipe-solutions/flex-layout-codemod@beta',
      'npx flex-layout-codemod ./src --dry-run',
      'npx flex-layout-codemod ./src --target tailwind',
      'npx flex-layout-codemod ./src --target css --stylesheet ./src/flex-layout-migration.css',
    ]);
    expect(readme).toContain('docs/compatibility.md');
    expect(readme).toContain('--report ./reports/flex-layout.json');
    expect(readme).toContain('--allow-unresolved');
    expect(readme).not.toContain('npm install -g');
    expect(readme).not.toContain('production-ready conversion coverage');
  });

  it('documents the current beta safety boundaries', async () => {
    const readme = await readRepositoryFile('README.md');

    expectCurrentBetaBoundaries(readme);
  });

  it('rejects a paraphrased false-current-capability claim that the former blacklist misses', async () => {
    const readme = await readRepositoryFile('README.md');
    const falseCurrentCapability = readme.replace(
      'Tailwind CSS v4 remains the default target. A native CSS target is available with `--target css --stylesheet <path>` for exactly eight Flex semantic families at base and the 13 standard viewport aliases. Grid, visibility, responsive class/style, orientation, print, and custom aliases remain preserved for CSS. Responsive `imgSrc` remains an independent opt-in native `<picture>` migration.',
      'This beta has native CSS and Tailwind CSS targets. Grid directives, responsive `imgSrc`, orientation, print, and custom breakpoint aliases convert directly.',
    );

    for (const unavailableClaim of [
      /CSS target is available with no limitations/u,
      /Grid conversion is available/u,
      /orientation conversion is available/u,
      /print conversion is available/u,
      /imgSrc conversion is available/u,
    ]) {
      expect(falseCurrentCapability).not.toMatch(unavailableClaim);
    }

    expect(() => expectCurrentBetaBoundaries(falseCurrentCapability)).toThrow();
  });

  it('requires byte-for-byte staged artifact verification before approval and finalization', async () => {
    const [contributing, releaseProcess] = await Promise.all([
      readRepositoryFile('CONTRIBUTING.md'),
      readRepositoryFile('docs/architecture/release-process.md'),
    ]);
    const stagedReview = sectionBetween(
      contributing,
      '### Later publications: stage, review, and approve',
      '### Verify and finalize',
    );
    const contributingRelease = sectionAfter(contributing, '## Releasing a beta');
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
      'npm view @nipe-solutions/flex-layout-codemod@<version>',
      'git tag -s <version>',
      'gh release create <version>',
    ]);
    expectInOrder(architectureApproval, [
      'npm stage approve <stage-id>',
      'verifies the published integrity',
      'signed or protected Git tag',
      'GitHub prerelease',
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
      expect(section).toContain('Changed or rebuilt bytes always require a new beta version');
      expect(section).not.toContain('cannot be reused');
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
