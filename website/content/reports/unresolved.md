---
path: /docs/unresolved
title: Allowing unresolved work
description: Relax process policy only when the team intentionally accepts preserved or unsupported migration results.
group: reports
order: 4
---

# Allowing unresolved work

## Policy is not conversion

Allowing unresolved work changes only the final process exit code for `review`, `unsupported`, and `invalid` results. It does not convert preserved source, remove diagnostics, change proposed template or stylesheet output, expand target compatibility, or certify the remaining directives as safe.

Parse errors remain exit code 1. Configuration, discovery, validation, application, transaction, and report-writing failures also remain failures. The option is therefore an unresolved-debt policy, not a general ignore-errors switch.

Use this behavior only when another review system intentionally tracks the unresolved set and a strict process status would duplicate that policy.

## Record the accepted boundary

Capture the schema-2 report, exact command, installed version, scope, target, and rationale for every accepted result. Record diagnostic code and file identity rather than accepting only an aggregate count. Separate temporary migration debt from source that is intentionally staying on Flex-Layout.

Compare the current per-file unresolved set with a reviewed baseline and fail on additions, changed codes, or moved ownership according to repository policy. Do not discard diagnostics merely because the command returns 0.

Revisit each decision when source, target support, project configuration, or package version changes. A previous acceptance is not evidence that a new diagnostic or different template is equivalent.
