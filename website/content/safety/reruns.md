---
path: /docs/reruns
title: Reruns and idempotency
description: Use repeated plans to confirm completed work without assuming every preserved case disappears automatically.
group: safety
order: 6
---

# Reruns and idempotency

## Re-plan the same scope

After an applied or manual migration, run the planner again against the same files and target. Already resolved source should not be treated as fresh Flex-Layout work, while intentionally preserved directives remain visible until their cause changes.

Compare reports by path and diagnostic rather than expecting identical summary counts after source edits. A smaller unresolved set is useful only when each removed item has a reviewed explanation.

## Avoid mixed ownership

Do not hand-edit a generated native CSS marker block while also expecting the codemod to own it. Keep manual rules outside the owned boundary and let the current plan determine generated rules.

If a rerun differs unexpectedly, inspect target options, scope, package version, source changes, and stylesheet path before writing again.
