---
path: /docs/native-css
title: Native CSS
description: Generate deterministic template classes and a bounded, tool-owned stylesheet for supported Flex semantics.
group: targets
order: 2
---

# Native CSS

## Exactly eight Flex semantic families

Native CSS is deliberately narrower than the Tailwind CSS target. It converts eight Flex semantic families: layout, layout alignment, layout gap, flex-item sizing with its grow and shrink members, self alignment, fill, offset, and order. The directive aliases and target statuses are published once in the [compatibility explorer](/docs/compatibility).

The target accepts verified literal base inputs and the 13 standard viewport aliases. Grid, visibility, responsive class/style, orientation, print, custom aliases, and responsive images remain outside this target boundary. Responsive images are a separate opt-in structural migration, not CSS-target behavior.

```text
npx flex-layout-codemod ./src --target css --stylesheet ./src/flex-layout-migration.css
```

`--target css` requires exactly one `--stylesheet` path. Planning proposes template classes and companion stylesheet content. Only `--write` authorizes the coordinated project update.

## Deterministic classes and owned rules

Equivalent semantics share a deterministic `flm-` class and one generated rule. Base rules precede responsive rules; media conditions come from the shared breakpoint catalog rather than a second alias table.

Generated CSS lives inside one exact schema-1 ownership region:

```css
/* flex-layout-codemod:start schema=1 */
/* flex-layout-codemod:rule id=<64 lowercase hex characters> */
.flm-<same identifier > {
  display: flex;
}
/* flex-layout-codemod:end */
```

Handwritten bytes outside the start and end markers are retained exactly. Invalid, duplicate, nested, unknown, or mismatched ownership markers fail closed instead of being repaired. Keep the stylesheet path stable across a migration batch so every plan sees the same owned region.

## Retained unmatched rules

New rules are merged additively with valid owned rules already present. An invocation retains unmatched owned rules even when every selected destination was scanned, because a scoped input cannot prove that no template outside the invocation still references them. The current CLI has no complete-project pruning mode.

Generated-looking class references must match either an incoming rule or a valid owned rule. A handwritten `flm-`-looking name beside the ownership boundary cannot claim generated ownership.

## Transaction and rerun boundary

After successful parsing, the CLI preflights the complete template-and-stylesheet transaction. Plan mode does not write either project output. A parse-error run still validates CLI configuration and path collisions and produces its complete report, but applies nothing and skips transaction preflight; unrelated late filesystem access failures may therefore remain hidden until parsing is repaired.

In write mode, eligible templates and the stylesheet are one recoverable transaction. Ordinary handled failures and handled interruption attempt to restore both together. Power loss, forced termination, and storage failure remain outside a crash-durability guarantee; reconcile uncertain paths against Git or a verified backup before retrying.

Repeating the same successful scope is byte-idempotent. Review retained rules as well as incoming rules, because a stable rerun intentionally does not prune another scope's ownership.
