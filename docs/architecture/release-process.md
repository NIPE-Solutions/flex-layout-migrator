# Release process

## Decision

Version 2 releases use reviewed Changesets, a protected GitHub release workflow, npm Trusted Publishing, and npm staged publishing. Repository automation may prepare a release and stage an existing package version, but a maintainer must approve every staged package with two-factor authentication before it becomes public.

The first public package is a one-time bootstrap exception because npm cannot stage or configure a trusted publisher for a package that does not yet exist. A maintainer publishes `2.0.0-beta.1` directly from a verified local checkout with two-factor authentication and the `beta` distribution tag. All later releases use the staged workflow.

## Goals

- Keep version, changelog, and package-content changes reviewable in pull requests.
- Prevent a pull request, ordinary push, or untrusted fork from publishing.
- Avoid long-lived npm write tokens in GitHub.
- Require human proof of presence for every automated publication.
- Publish prereleases under `beta` without changing npm's `latest` tag.
- Generate npm provenance through GitHub Actions OIDC.
- Make release failures safe to retry without silently publishing a different artifact.

## Non-goals

- Publish from pull-request workflows.
- Publish automatically when a version pull request merges.
- Publish private packages.
- Support multiple packages or npm workspaces.
- Promote a beta version to stable without a separate reviewed release decision.
- Automate npm stage approval or rejection; those actions require a maintainer and two-factor authentication.

## Version policy

The first public version is `2.0.0-beta.1`. Beta versions use the form `2.0.0-beta.N`, where `N` is a positive integer, and are staged or published with `--tag beta`. Stable versions contain no prerelease component and use `latest` only after an explicit change to the release policy and its tests.

The repository remains in Changesets prerelease mode through a committed `.changeset/pre.json` with the `beta` tag. Entering prerelease mode from the current `2.0.0-beta.0` manifest and applying the pending Changesets deterministically produces `2.0.0-beta.1`; this transition is covered by a repository contract test. Leaving prerelease mode is a separate reviewed stable-release decision.

User-facing behavior, CLI, or API changes require a Changeset. The Changesets release pull request consumes pending Changesets, updates `package.json`, `package-lock.json`, and `CHANGELOG.md`, and is reviewed like any other pull request. Merging it makes the selected version eligible for staging; it does not publish.

The release workflow rejects:

- a version that is not a supported beta prerelease;
- a version already present in the npm registry;
- a checkout other than the protected `main` branch;
- a package whose verification, audit, build, or package-content checks fail;
- a tarball whose manifest name or version differs from the repository manifest.

## Repository automation

### Changesets release pull request

`.github/workflows/release-pr.yml` runs after changes reach `main` and may also be dispatched manually. It uses the Changesets GitHub Action to open or update one release pull request. Its permissions are limited to `contents: write` and `pull-requests: write`; it has no npm credential and no OIDC permission.

The action invokes the repository's version command rather than publishing. The resulting pull request contains the version, changelog, lockfile, and removal of consumed Changesets. Conventional review, CI, and branch protection remain mandatory.

### Staged package workflow

`.github/workflows/stage-release.yml` is manual-only through `workflow_dispatch`. It runs on a GitHub-hosted Ubuntu runner from the protected `main` branch and uses the protected `npm` GitHub environment. Only this job receives `id-token: write`; repository contents remain read-only.

The workflow:

1. checks out the exact `main` commit with pinned actions;
2. installs Node.js 24 and the repository's exact npm 11 release, at least npm 11.15.0, without a dependency cache;
3. installs from `package-lock.json` with `npm ci`;
4. runs formatting, linting, type checking, coverage, build, package-contract checks, and `npm audit --audit-level=high`;
5. creates one tarball with `npm pack --json` and validates its six-file package surface;
6. installs the tarball into a temporary project and runs the packaged CLI smoke test;
7. confirms the manifest is a new `2.0.0-beta.N` version;
8. stages that exact tarball with `npm stage publish <tarball> --access public --tag beta`.

The workflow uploads the verified tarball and package metadata as GitHub artifacts before staging. It never runs `npm publish`, never uses `NODE_AUTH_TOKEN`, and never approves a staged package.

Concurrency is global for npm staging and does not cancel an in-progress run. This prevents two operators from staging different commits concurrently. A failed run publishes nothing. Once npm accepts a staged version, that semantic version is reserved until a maintainer approves or rejects it.

## npm trust boundary

After the bootstrap publication creates `@nipe-solutions/flex-layout-codemod`, an npm organization owner configures one trusted publisher:

- provider: GitHub Actions;
- GitHub organization: `NIPE-Solutions`;
- repository: `flex-layout-migrator`;
- workflow filename: `stage-release.yml`;
- environment: `npm`;
- allowed action: `npm stage publish` only.

The package's publishing access is then set to require two-factor authentication and disallow traditional publish tokens. Trusted Publishing exchanges the GitHub OIDC identity for a short-lived npm credential and automatically attaches provenance for this public repository and public package.

The workflow filename, repository URL in `package.json`, environment name, and GitHub repository identity are security inputs and must match npm's configuration exactly.

## Bootstrap release

The initial package cannot use staged publishing because npm requires the package to exist first. The bootstrap therefore follows a stricter local checklist:

1. merge the release-engineering pull request;
2. generate, review, and merge the Changesets release pull request for `2.0.0-beta.1`;
3. check out the resulting `main` commit in a clean workspace;
4. run the complete repository verification, high-severity audit, package inspection, clean-install smoke test, and repository hygiene checks;
5. create the tarball once and record its SHA-512 integrity;
6. publish that exact tarball with `npm publish <tarball> --access public --tag beta`, completing the two-factor prompt;
7. verify the registry name, version, `beta` tag, package files, and installed CLI behavior; the local bootstrap does not claim OIDC provenance;
8. configure the trusted publisher and token restrictions described above.

The bootstrap command is never embedded in repository automation. It runs only after the user explicitly approves publishing the verified version.

## Approval and finalization

For later releases, a maintainer reviews the staged package on npmjs.com or downloads it with `npm stage download <stage-id>`. Approval uses `npm stage approve <stage-id>` or the npmjs.com approval interface and always requires two-factor authentication.

After registry approval, the maintainer verifies the published integrity and `beta` distribution tag, then creates the matching signed or protected Git tag and GitHub prerelease from the exact staged commit. Tags and GitHub releases are not created before npm approval, so a rejected staged artifact cannot appear as a completed release.

## Error handling

- A failed verification, audit, package inspection, or smoke test stops before OIDC authentication and staging.
- A registry version collision stops without changing dist-tags.
- An OIDC or trusted-publisher mismatch fails without falling back to a token.
- A staged package that fails manual inspection is rejected with two-factor authentication; its version cannot be reused.
- A successful stage is not described as published until npm approval completes.
- A published package is immutable. Corrections require a new beta version and Changeset rather than overwriting or unpublishing the release.

## Testing strategy

Repository contract tests parse the workflows and release scripts to prove:

- release preparation cannot publish and has no OIDC permission;
- staging is manual-only, main-only, environment-protected, and non-cancelling;
- only the staging job has `id-token: write` and no npm token is referenced;
- actions are pinned to immutable commits;
- the stage command always specifies the verified tarball, public access, and `beta` tag;
- stable or malformed versions, existing registry versions, mismatched tarball metadata, and unexpected package files fail before staging;
- the tarball contains exactly `CHANGELOG.md`, `LICENSE`, `README.md`, `dist/cli.js`, `dist/cli.js.map`, and `package.json`;
- a clean temporary installation executes the packaged CLI successfully;
- public maintenance documentation matches the implemented bootstrap, staging, approval, and recovery procedures.

The complete local and CI gates remain `npm run verify`, `npm audit --audit-level=high`, package inspection, clean-install CLI smoke, `git diff --check`, clean status, and forbidden-control-file scans.
