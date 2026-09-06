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

The original source remains visible for unresolved conversion results. A source-template parse error prevents analysis against an invalid tree. A generated-template parse error discards the proposed file edits so invalid output is not applied.

## Resolve the cause

Typical resolution paths include repairing invalid source, removing a destination conflict, confirming a project-specific option, selecting another target, simplifying a dynamic binding, or completing a manual migration.

Resolve the complete affected semantic family, not only the reported attribute. A diagnostic on one responsive member can preserve base or dependent behavior because a partial rewrite would change precedence or layout context.

Rerun the same scope after the change. The public diagnostic registry supplies the exact current code set, preservation rationale, resolution steps, and rerun eligibility. Unknown codes or statuses are a contract compatibility event for automation, not text to discard.

## Complete diagnostic reference

Search all 13 conversion codes and both parse-error codes by code, message, or family. Each entry reads its actionable meaning, unsafe-to-guess rationale, and resolution directly from the immutable diagnostic registry. Preservation and rerun text is derived from the entry's rerun eligibility. Each code heading is its one stable `/docs/diagnostics#<code>` deep-link target.

:::diagnostic-reference

## Automation contract

Treat `code` as the stable category and the accompanying reason as source-specific detail. Automation may aggregate known codes, but it must retain unknown codes and statuses as a contract-compatibility event rather than silently discarding them.

Exit handling is separate from diagnostic identity. Strict mode returns exit code 2 when a safe plan or application contains unresolved review, unsupported, or invalid results. Parse errors and operational failures use exit code 1. `--allow-unresolved` changes the final unresolved exit decision; it does not hide diagnostic entries or force migration.

## Escalate a minimal reproduction

If a generated-template parse error or unexpected preservation remains after checking the registry, reduce the case while retaining the relevant directive combination, responsive aliases, and existing class or style ownership. Report the installed version, target, exact command, minimal non-sensitive template, actual and expected output, and diagnostic. Never publish proprietary templates or credentials.
