---
path: /docs/safety
title: Safety model
description: Understand the proof, preservation, and explicit-write rules that keep review ahead of mutation.
group: safety
order: 1
---

# Safety model

## Proof before replacement

The engine converts a directive only when the selected target can represent its parsed semantics without an unresolved conflict. Otherwise it preserves the original source and emits a diagnostic that identifies the review boundary. It does not evaluate application expressions, invent media queries, guess display restoration, or choose between competing class and style owners.

Preservation is part of the public behavior, not an incomplete edit. An attribute is removed only for a converted result. Review, unsupported, invalid, and parse-error outcomes do not authorize mutation of that input, and atomic dependency closure can preserve related inputs when converting only a subset would change behavior.

## Planning and writing are separate

The default project workflow discovers, analyzes, renders, validates, reparses changed templates, and preflights valid plans. Template and stylesheet mutation requires an explicit write decision after review. Plan mode does not write project templates or the companion stylesheet, but plan mode can create the requested report and its parent directory when `--report` is present.

Report writing is outside the coordinated project transaction. It occurs only after the migration result is known; a report-write failure returns a command failure but does not roll back a project application that already completed.

## Defense in depth

Before application, the pipeline validates edit ranges, output topology, artifact collisions, source identity, stylesheet ownership, and generated Angular syntax. The transaction preflight checks current destination state against the plan; concurrent changes fail closed instead of being overwritten as though they were the planned bytes.

These checks protect the codemod boundary, not the full application. Use version control as the durable checkpoint, inspect the diff, compile the application, exercise tests, review responsive states, and search for remaining directives before accepting a migration batch.
