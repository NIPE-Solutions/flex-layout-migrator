---
path: /docs/reruns
title: Reruns and idempotency
description: Use repeated plans to confirm completed work without assuming every preserved case disappears automatically.
group: safety
order: 6
---

# Reruns and idempotency

## Re-plan the same scope

After an applied or manual migration, run the planner again against the same files, target, stylesheet path, and project-configuration assertions. Converted attributes no longer appear as Flex-Layout inputs. Intentionally preserved directives remain visible until their source or the condition behind their diagnostic changes.

Compare reports by path and diagnostic rather than expecting identical summary counts after source edits. A smaller unresolved set is useful only when each removed item has a reviewed explanation.

## Avoid mixed ownership

Native CSS output is byte-idempotent for supported unchanged input: a rerun can report an unchanged owned stylesheet. The merger replaces matching incoming rule IDs and retains unmatched valid owned rules, even when the current invocation proposes fewer or no rules. Reruns do not garbage-collect stale owned CSS or remove its file, and the current CLI has no complete-project pruning mode. Do not hand-edit the generated marker block while also expecting the codemod to own it; keep manual rules outside the owned boundary.

Idempotency is not a promise that all preserved cases disappear or that a different invocation produces identical bytes. If a rerun differs unexpectedly, inspect the exact package version, target, scope, output, stylesheet, breakpoint assertions, responsive-image option, source bytes, and manual stylesheet changes before writing again.

Use the fresh plan as the gate for another write. Do not copy an earlier proposal onto changed source: preflight requires the exact plan and rejects destination bytes changed after planning.
