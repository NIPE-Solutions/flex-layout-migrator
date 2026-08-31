# Contributing

Thank you for improving Angular Flex-Layout Codemod. Keep pull requests focused on one migration behavior or maintenance concern.

## Local setup

Use Node.js 24 and npm 11:

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
