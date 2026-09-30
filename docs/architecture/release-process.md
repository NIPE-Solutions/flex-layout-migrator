# Release process

## Decision

The reviewed stable release targets exactly `2.0.0` under `latest`. Version 2 releases use reviewed Changesets, a protected GitHub release workflow, npm Trusted Publishing, and npm staged publishing. Repository automation may prepare a release and stage an existing package version, but a maintainer must approve every staged package with two-factor authentication before it becomes public. The public postcondition is `latest=2.0.0` and `beta=2.0.0-beta.4`.

The first public package used a one-time bootstrap exception because npm could not stage or configure a trusted publisher for a package that did not yet exist. A maintainer published `2.0.0-beta.1` directly from a verified local checkout with two-factor authentication and the `beta` distribution tag. That completed bootstrap is historical context; the stable release uses the staged workflow.

## Goals

- Keep version, changelog, and package-content changes reviewable in pull requests.
- Prevent a pull request, ordinary push, or untrusted fork from publishing.
- Avoid long-lived npm write tokens in GitHub.
- Require human proof of presence for every automated publication.
- Publish stable `2.0.0` under `latest` while retaining `beta=2.0.0-beta.4`.
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

The current one-time release lane accepts only literal `2.0.0`, with no prefix, prerelease component, or build metadata, and stages it with `--tag latest`. The existing `beta` distribution tag remains at `2.0.0-beta.4`. A later stable version requires a separate reviewed update to the release policy and its tests.

The reviewed stable transition has consumed Changesets prerelease state: `.changeset/pre.json` is absent, `package.json` and both lockfile version fields equal `2.0.0`, and the stable changelog preserves all beta history. Historically, the first public version was `2.0.0-beta.1` and beta versions used `2.0.0-beta.N` with `--tag beta`; these are no longer accepted by the artifact validator.

User-facing behavior, CLI, or API changes require a Changeset. The Changesets release pull request consumes pending Changesets, updates `package.json`, `package-lock.json`, and `CHANGELOG.md`, and is reviewed like any other pull request. Merging it makes the selected version eligible for staging; it does not publish.

The release workflow rejects:

- any version other than exactly `2.0.0`;
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
2. installs Node.js 24 and npm 11.19.0 without a dependency cache;
3. installs from `package-lock.json` with `npm ci`;
4. runs formatting, linting, type checking, coverage, build, package-contract checks, and `npm audit --audit-level=high`;
5. verifies current remote `main`, then creates one tarball with `npm pack --json` and validates its six-file package surface;
6. computes SHA-512 SRI from the generated tarball bytes, requires an exact match with npm's descriptor, and removes the tarball and metadata if reading, hashing, or comparison fails;
7. smoke-installs and executes that exact tarball in a temporary project;
8. rehashes that path after the smoke test, confirms the manifest is the unpublished `2.0.0` version, and writes metadata and GitHub outputs only while the bytes still match;
9. uploads that tarball and metadata as the workflow artifact;
10. rehashes the retained tarball immediately before staging, repeats current remote `main` verification, then passes that exact path to `npm stage publish <tarball> --access public --tag latest`.

Both freshness checks run `node scripts/release-artifact.mjs --verify-current-main`, using a fresh `git ls-remote --exit-code origin refs/heads/main` network lookup. Exactly one valid commit must match checked-out `HEAD` and `GITHUB_SHA` byte-for-byte. Missing, ambiguous, malformed, failed, or stale lookups fail closed. Reruns retain their original commit, so a run becomes ineligible when `main` advances; dispatch a new run from current `main`. This guard is mandatory in the protected staging workflow. Local pre-merge `npm run verify` and `npm run package:check` remain usable on a release branch without claiming current-main freshness.

The workflow uploads the verified tarball and package metadata as GitHub artifacts before staging. It never runs `npm publish`, never uses `NODE_AUTH_TOKEN`, and never approves a staged package.

Concurrency is global for npm staging and does not cancel an in-progress run. This prevents two operators from staging different commits concurrently. A failed run publishes nothing. Once npm accepts a staged version, that semantic version is reserved until a maintainer approves or rejects it.

## npm trust boundary

The completed bootstrap publication created `@nipe-solutions/flex-layout-codemod`. An npm organization owner must keep one trusted publisher configured for `NIPE-Solutions/flex-layout-migrator`:

- provider: GitHub Actions;
- GitHub organization: `NIPE-Solutions`;
- repository: `flex-layout-migrator`;
- workflow filename: `stage-release.yml`;
- environment: `npm`;
- allowed action: `npm stage publish` only.

The package's publishing access is then set to require two-factor authentication and disallow traditional publish tokens. Trusted Publishing exchanges the GitHub OIDC identity for a short-lived npm credential and automatically attaches provenance for this public repository and public package.

Do not add an npm token to GitHub. The staging workflow must fail closed if the OIDC identity or Trusted Publisher configuration does not match.

The workflow filename, repository URL in `package.json`, environment name, and GitHub repository identity are security inputs and must match npm's configuration exactly.

## Historical bootstrap release

This completed `2.0.0-beta.1` exception is historical context, not a current command path. The initial package could not use staged publishing because npm required the package to exist first. The historical bootstrap checklist was:

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

For stable `2.0.0`, a maintainer reviews the staged package on npmjs.com or downloads it with `npm stage download <stage-id>`. For a download, the maintainer computes its SHA-512 SRI from the tarball bytes and compares the complete SRI string byte-for-byte with `release-artifact.json`. Approval uses `npm stage approve <stage-id>` or the npmjs.com approval interface and always requires two-factor authentication.

After registry approval, the maintainer verifies the published integrity, package identity, installed CLI version, and distribution tags. The required public postcondition is `latest=2.0.0` and `beta=2.0.0-beta.4`. Only then does the maintainer create the signed or protected Git tag `v2.0.0` and the matching GitHub release, which is not a prerelease, from the exact staged commit. Tags and GitHub releases are not created before npm approval, so a rejected staged artifact cannot appear as a completed release.

## Error handling

- A failed verification, audit, package inspection, or smoke test stops before OIDC authentication and staging.
- After an ambiguous staging network result or version collision, the operator first runs `npm stage list @nipe-solutions/flex-layout-codemod`. If a stage exists, the operator recovers its stage ID, runs `npm stage download <stage-id>`, and compares the downloaded bytes and SHA-512 SRI with the retained workflow artifact before deciding whether to approve or reject it. A blind retry is prohibited; retry is allowed only after the list proves npm accepted no stage.
- An OIDC or trusted-publisher mismatch fails without falling back to a token.
- A staged package that fails manual inspection is rejected with `npm stage reject <stage-id>` and two-factor authentication. Before rejection, the operator retains both the downloaded tarball and `release-artifact.json`. Successful rejection removes the staged record. An operational retry may restage the same version only after rejection, and only when an exact byte comparison proves the candidate is byte-identical and re-verification produces an identical SHA-512 SRI to the retained `release-artifact.json` from the rejected stage.
- Changed or rebuilt bytes cannot reuse `2.0.0` after rejection. They require a later reviewed patch version, a Changeset, and a separately reviewed update to the exact-version release lane; different bytes are never staged under the rejected version.
- A successful stage is not described as published until npm approval completes.
- A published stable package is immutable. Correct a defect in a later reviewed patch with a Changeset and updated release policy; do not overwrite or unpublish `2.0.0`.

## Testing strategy

Repository contract tests parse the workflows and release scripts to prove:

- release preparation cannot publish and has no OIDC permission;
- staging is manual-only, main-only, environment-protected, and non-cancelling;
- only the staging job has `id-token: write` and no npm token is referenced;
- actions are pinned to immutable commits;
- the stage command always specifies the verified tarball, public access, and `latest` tag;
- versions other than literal `2.0.0`, existing registry versions, mismatched tarball metadata, and unexpected package files fail before staging;
- the tarball contains exactly `CHANGELOG.md`, `LICENSE`, `README.md`, `dist/cli.js`, `dist/cli.js.map`, and `package.json`;
- the descriptor SRI equals SHA-512 over the generated tarball bytes, and hash failures remove invocation-owned release artifacts;
- the same tarball path flows through hashing, a clean temporary CLI installation, metadata, GitHub outputs, artifact upload, final retained-byte verification, and staging;
- public maintenance documentation matches the implemented bootstrap, staging, approval, and recovery procedures.

The complete local and CI gates remain `npm run verify`, `npm audit --audit-level=high`, package inspection, clean-install CLI smoke, `git diff --check`, clean status, and forbidden-control-file scans.
