---
path: /docs/large-codebase
title: Large codebase strategy
description: Scale from a representative pilot to reviewable migration batches across a large Angular repository.
group: start
order: 5
---

# Large codebase strategy

## Pilot

Choose a small owned slice containing common flex layout, responsive aliases, visibility, shared components, existing classes or styles, and at least one known difficult template. Plan the same source for each viable target. Compare proposed output, preserved families, diagnostics, generated stylesheet ownership, and the team's existing styling conventions.

Record the exact command, package version, target, input and output scope, report schema version, diagnostic set, build and test results, and manual review notes. This pilot informs batch size and reviewer assignment; it is not a performance or compatibility promise for the whole repository.

## Expand in owned batches

Group templates by feature ownership or deployable boundary. Give every batch a clean checkpoint, one plan artifact, a named reviewer, an explicit unresolved policy, and a rollback route. Keep generated stylesheet changes with the templates that require them, and avoid mixing unrelated refactors into the same review.

Use strict exits to stop new unresolved debt unless another reviewed system owns an allowlist. Do not enable the unresolved override merely to make a broad first pass green; it changes only the final process code.

## Complete the repository migration

Repeat repository-wide discovery after the last batch. Build and test the application, inspect representative viewport ranges plus any enabled orientation or print behavior, and search for remaining Flex-Layout inputs. Classify each remainder as repaired, manually migrated, intentionally retained, or blocked with a diagnostic and owner.

Remove the legacy dependency or provider configuration only after the remaining-input check and application verification show it is no longer required. The codemod does not remove project dependencies or certify that repository cleanup is complete.

## Copyable checklist

Tool behavior:

- Plan and write use the same discovery, analysis, render, validation, and preflight path when source parsing succeeds.
- Folder discovery is deterministic, recursive, HTML-only, Git-ignore-aware, and excludes invocation-owned output, report, and stylesheet paths.
- A source parse error skips the complete write invocation rather than applying an earlier file.
- Reports remain schema-versioned and preserve per-file results after a completed plan or application.

Recommended practice:

- Pilot a representative owned slice and compare targets.
- Start each batch from a clean Git checkpoint and record the exact installed version.
- Review diagnostics and responsive families before writing.
- Verify diffs, builds, tests, responsive states, and remaining directives after writing.
- Assign owners and rationale to intentionally preserved work before dependency removal.
