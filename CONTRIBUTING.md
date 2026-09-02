# Contributing

Thank you for improving Angular Flex-Layout Codemod. Keep pull requests focused on one migration behavior or maintenance concern.

## Local setup

Use Node.js 24 and npm 11.19.0:

```bash
npm ci
npm run verify
```

Create a `feature/*`, `fix/*`, `test/*`, `docs/*`, or `chore/*` branch. Do not commit generated `dist` or coverage output.

## Tests and pull requests

Behavior changes use test-driven development: add the smallest failing test, confirm that it fails for the intended reason, implement the change, and run the complete suite. Conversion changes need a minimal before/after fixture and must cover diagnostics for unsafe cases.

Pull request titles use Conventional Commit prefixes such as `feat:`, `fix:`, `test:`, `docs:`, and `chore:`. Complete the pull request template and explain dependency changes. CI is authoritative even when local Git hooks pass.

Add a Changeset for user-facing behavior, CLI, or API changes. Tests, internal refactors, repository maintenance, and documentation-only changes do not require one.

Do not include confidential templates, credentials, customer names, or proprietary source code in issues or fixtures.

## Releasing a beta

Releases are operated from `NIPE-Solutions/flex-layout-migrator`. The release pull-request workflow prepares version and changelog changes only. It cannot publish or stage a package. To request a version pull request after the required Changesets reach `main`, run:

```bash
gh workflow run release-pr.yml --repo NIPE-Solutions/flex-layout-migrator --ref main
```

Review the resulting pull request like any other change. Confirm that the package and lockfile versions agree, the changelog is accurate, consumed Changesets are removed, and the version is `2.0.0-beta.N`. The first public version must be `2.0.0-beta.1`. Merge only after CI and required review pass. Merging makes the version eligible for release; it does not publish it.

### Inspect the release artifact

Start from a clean checkout of the versioned `main` commit. Record `git rev-parse HEAD`, confirm `git status --short` is empty, and create the release tarball only after all local checks pass:

```bash
branch="$(git branch --show-current)"
test "$branch" = main
npm ci
npm run verify
npm audit --audit-level=high
release_outputs="$(mktemp)"
GITHUB_REF_NAME="$branch" npm run release:prepare -- --github-output "$release_outputs"
cat release-artifact.json
tarball="$(node -p "require('./release-artifact.json').tarball")"
tar -tf "$tarball"
smoke_dir="$(mktemp -d)"
npm install --ignore-scripts --prefix "$smoke_dir" "./$tarball"
"$smoke_dir/node_modules/.bin/flex-layout-codemod" --version
GITHUB_REF_NAME="$branch" npm run release:verify
```

`release:prepare` computes SHA-512 SRI from the generated tarball bytes, requires an exact match with npm's pack descriptor, and clean-installs and executes that same tarball before writing any metadata or GitHub output. The final `release:verify` command rehashes the retained bytes against that metadata after manual inspection. `release-artifact.json` is the record of the exact package name, version, tarball, and verified SHA-512 integrity. The tarball's file list must be exactly `CHANGELOG.md`, `LICENSE`, `README.md`, `dist/cli.js`, `dist/cli.js.map`, and `package.json`. Remove the temporary smoke directory and output file after review. Do not rebuild or repack between approval and publication.

### First publication: one-time bootstrap exception

The first publication of `@nipe-solutions/flex-layout-codemod` is a one-time bootstrap exception because npm cannot configure Trusted Publishing or stage a package before that package exists. It applies only to `2.0.0-beta.1` and only after explicit user approval of the recorded commit, package name, version, tarball, and integrity. A maintainer with npm organization-owner access and two-factor authentication runs the following command template locally, replacing `<tarball>` with the exact value from `release-artifact.json`:

```bash
npm publish <tarball> --access public --tag beta
```

Stop if the approval is absent, the checkout changed, the tarball differs, the version already exists, or npm reports an unexpected identity. Never put this bootstrap command in a workflow.

Immediately after registry verification, an npm organization owner must configure the package's Trusted Publisher with these exact security inputs:

- Provider: GitHub Actions
- GitHub organization and repository: `NIPE-Solutions/flex-layout-migrator`
- Workflow filename: `stage-release.yml`
- GitHub environment: `npm`
- Allowed action: `npm stage publish` only

Require two-factor authentication for package changes and disallow traditional publish tokens. Do not add an npm token to GitHub. Future stages authenticate only through the `stage-release.yml` job's short-lived OIDC identity in the protected `npm` environment.

### Later publications: stage, review, and approve

For every later beta, dispatch the manual staging workflow from the versioned `main` commit:

```bash
gh workflow run stage-release.yml --repo NIPE-Solutions/flex-layout-migrator --ref main
```

The workflow verifies the repository, creates and uploads the exact tarball and metadata, rehashes the retained tarball immediately before staging, then runs `npm stage publish` for that same path with public access and the `beta` tag. It never publishes directly and never approves its own stage.

Record the workflow run ID and exact commit. Inspect the `npm-release` workflow artifact and the staged package on npmjs.com. To download the staged package for independent inspection, use:

```bash
gh run download <run-id> --repo NIPE-Solutions/flex-layout-migrator --name npm-release
npm stage download <stage-id>
```

Set `downloaded_tarball` to the staged `.tgz` returned by npm. Compute its SHA-512 SRI with built-in Node APIs and compare it byte-for-byte with the recorded integrity:

```bash
downloaded_tarball="/absolute/path/to/downloaded-stage.tgz"
expected_sri="$(node -p "require('./release-artifact.json').integrity")"
downloaded_sri="$(
  node -e "const { createHash } = require('node:crypto'); const { readFileSync } = require('node:fs'); console.log('sha512-' + createHash('sha512').update(readFileSync(process.argv[1])).digest('base64'))" "$downloaded_tarball"
)"
printf '%s\n' "$downloaded_sri"
test "$downloaded_sri" = "$expected_sri"
```

The final `test` must exit successfully. Any difference means the downloaded bytes are not the reviewed artifact and the stage must not be approved. Compare the staged package name, version, and file list with `release-artifact.json`, and run the packaged CLI smoke checks against `downloaded_tarball`. If every value matches and the release is approved, a maintainer completes npm's two-factor prompt with:

```bash
npm stage approve <stage-id>
```

Approval is the publication boundary. Do not create a Git tag or GitHub release before it succeeds.

### Verify and finalize

Verify the published version directly from the registry; do not rely only on the workflow result:

```bash
npm view @nipe-solutions/flex-layout-codemod@<version> name version dist.integrity --json
npm view @nipe-solutions/flex-layout-codemod dist-tags.beta
npm exec --yes --package=@nipe-solutions/flex-layout-codemod@<version> -- flex-layout-codemod --version
```

The name, version, and integrity must match `release-artifact.json`, `dist-tags.beta` must equal the approved version, and the packaged CLI must report that version. Then create a signed tag from the exact staged commit and a matching GitHub prerelease:

```bash
git tag -s <version> <staged-commit> -m "Release <version>"
git push origin <version>
gh release create <version> --repo NIPE-Solutions/flex-layout-migrator --verify-tag --prerelease --title <version> --generate-notes
```

### Recovery

If `npm stage publish` ends with an ambiguous network result or reports a version collision, do not retry it first. Discover whether npm accepted the original request and recover its stage ID:

```bash
npm stage list @nipe-solutions/flex-layout-codemod
npm stage download <stage-id>
```

If the version is listed, inspect the downloaded tarball and compare its SHA-512 SRI with the retained `release-artifact.json` using the staged-review procedure above. Approve or reject that recovered stage; do not create a duplicate. Retry staging only when the list proves that npm accepted no stage and the version remains available.

- If verification fails before a staging request, correct the cause and rerun from the same unchanged versioned commit.
- If OIDC or Trusted Publisher matching fails, correct the npm publisher configuration or GitHub environment. Do not fall back to a token.
- If inspection fails after staging, retain immutable copies of the downloaded tarball and workflow `release-artifact.json`, then run `npm stage reject <stage-id>` and complete two-factor authentication. Successful rejection removes the staged record. An operational retry may restage the same version only after rejection, and only when the candidate is byte-identical and produces an identical SHA-512 SRI to the retained `release-artifact.json` from the rejected stage.
- Changed or rebuilt bytes always require a new beta version and Changeset; never stage different bytes under the rejected version.
- If an approved package is incorrect, do not overwrite or unpublish it. Correct the issue in a new beta version.
- If tagging or GitHub prerelease creation fails after npm approval, retry those steps against the already published version and exact staged commit.

For an operational same-version retry after rejection, prepare the candidate from the same unchanged commit in a clean checkout. Set the first two paths to the immutable copies retained from the rejected stage, then require both an exact byte comparison and equality between a fresh candidate-byte SRI and the retained rejected-stage SRI:

```bash
retained_metadata="/absolute/path/to/rejected-stage/release-artifact.json"
retained_tarball="/absolute/path/to/rejected-stage/package.tgz"
candidate_metadata="./release-artifact.json"
candidate_tarball="$(
  node -e "const { readFileSync } = require('node:fs'); console.log(JSON.parse(readFileSync(process.argv[1], 'utf8')).tarball)" "$candidate_metadata"
)"
retained_sri="$(
  node -e "const { readFileSync } = require('node:fs'); console.log(JSON.parse(readFileSync(process.argv[1], 'utf8')).integrity)" "$retained_metadata"
)"
candidate_sri="$(
  node -e "const { createHash } = require('node:crypto'); const { readFileSync } = require('node:fs'); console.log('sha512-' + createHash('sha512').update(readFileSync(process.argv[1])).digest('base64'))" "$candidate_tarball"
)"
cmp --silent "$retained_tarball" "$candidate_tarball"
test "$candidate_sri" = "$retained_sri"
```

Both final commands must exit successfully before the same version may be restaged. Any byte or SRI difference requires a new beta version and Changeset.

The architecture and trust-boundary rationale are defined in [docs/architecture/release-process.md](docs/architecture/release-process.md).
