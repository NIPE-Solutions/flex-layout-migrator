---
path: /docs/safety
title: Safety model
description: Understand the proof, preservation, and explicit-write rules that keep review ahead of mutation.
group: safety
order: 1
---

# Safety model

## Proof before replacement

The engine converts a directive only when the selected target can represent its parsed semantics without an unresolved conflict. Otherwise it preserves the original source and emits a diagnostic that identifies the review boundary.

Preservation is part of the public behavior, not an incomplete edit. It keeps runtime ambiguity and unsupported forms visible instead of converting only the convenient half of a related behavior.

## Planning and writing are separate

The default project workflow analyzes and plans. Template and stylesheet mutation requires an explicit write decision after review. A requested report is an intentional plan-mode filesystem output, so plan mode should not be described as producing zero files in every invocation.

Use version control as the durable checkpoint around any applied migration and inspect the actual diff before accepting it.
