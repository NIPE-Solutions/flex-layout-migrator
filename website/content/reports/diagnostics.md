---
path: /docs/diagnostics
title: Diagnostics
description: Turn each preserved, unsupported, invalid, or review result into a specific follow-up decision.
group: reports
order: 1
---

# Diagnostics

## Why wasn't this migrated?

A diagnostic explains why the engine did not prove an automatic replacement or why the result needs review. The code identifies a stable category; the reason and suggestion provide source-specific context. Read all three with the result status, exact source attribute, zero-based offset, target, neighboring directives, and responsive aliases.

`review` usually marks runtime values, unverified configuration, precedence, or semantic context. `unsupported` marks a recognized behavior outside the target renderer. `invalid` marks a value that violates the supported source contract. `parse-error` identifies source or generated Angular syntax that prevents application.

## Resolve the cause

Typical resolution paths include repairing invalid source, removing a destination conflict, confirming a project-specific option, selecting another target, simplifying a dynamic binding, or completing a manual migration.

Resolve the complete affected semantic family, not only the reported attribute. A diagnostic on one responsive member can preserve base or dependent behavior because a partial rewrite would change precedence or layout context.

Rerun the same scope after the change. The public diagnostic registry supplies the exact current code set, preservation rationale, resolution steps, and rerun eligibility. Unknown codes or statuses are a contract compatibility event for automation, not text to discard.

## Example diagnostic boundaries

These callouts are rendered from the diagnostic registry. One requires project evidence before a rerun; the other marks a selected-target boundary whose registry resolution may include choosing a different target.

:::diagnostic-callout dynamic-binding
:::diagnostic-callout target-unsupported

## Escalate a minimal reproduction

If a generated-template parse error or unexpected preservation remains after checking the registry, reduce the case while retaining the relevant directive combination, responsive aliases, and existing class or style ownership. Report the installed version, target, exact command, minimal non-sensitive template, actual and expected output, and diagnostic. Never publish proprietary templates or credentials.
