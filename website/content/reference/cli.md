---
path: /docs/cli
title: CLI reference
description: Use the installed command's verified options for target selection, planning, reporting, and explicit writes.
group: reference
order: 1
---

# CLI reference

## Command shape

The CLI accepts a file or directory scope and plans a migration using its documented defaults. Options select the output target, capture reports, confirm project-specific responsive behavior, control unresolved-result policy, and explicitly apply writes.

When exact flags are required, use the installed command's help output and the immutable CLI registry verified against the production Commander definition. A prose workflow should never be treated as a second option list.

## Configuration boundary

Current migration configuration is command-driven. Record the full invocation with a batch so target and safety decisions remain visible to reviewers and reproducible in automation.

Run the command from the intended workspace context and inspect help for the installed version. Examples written for another prerelease should not override the locally verified interface.
