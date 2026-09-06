---
path: /docs/compatibility/dynamic-bindings
title: Dynamic bindings
description: Understand why runtime expressions and ambiguous values remain source-visible for human review.
group: compatibility
order: 3
---

# Dynamic bindings

## Runtime values are not static evidence

An Angular property binding can produce values unavailable during a source transformation. Guessing one possible branch would turn a mechanical migration into a behavior change, so property, two-way, `bind-`, and interpolated Flex-Layout values remain unchanged even when an expression looks constant.

The `dynamic-binding` diagnostic identifies that boundary. It does not evaluate component fields, getters, pipes, signals, observables, or template expressions. A literal value is still subject to its directive grammar, semantic context, target capability, responsive precedence, and destination ownership checks.

## Bound class and style authority

A whole-value `[class]` binding may replace generated classes at runtime, so coupled conversion can remain unchanged with `bound-class`. Bound unsuffixed `ngClass` or `ngStyle` also preserves a complete responsive class/style family because its active base output is not statically known.

Named class bindings provide different evidence from a whole-value class binding, but a generated-looking name still cannot claim codemod ownership without a matching rule. Literal and bound display styles are authoritative for visibility restoration and can preserve visibility or layout families.

One dynamic member can close over dependent source on the same element. This is deliberate atomicity: converting a sibling while leaving its runtime context unresolved could change layout, display, or precedence.

## Resolve deliberately

Inspect the component data that feeds the binding and list every runtime value it can produce. A safe result may use conditional classes, component state, a stylesheet rule, or a source simplification. If the binding can become a verified literal without changing behavior, make that project change first and rerun the same plan scope.

When runtime behavior must remain dynamic, migrate the complete semantic family manually and verify every relevant state. Do not rerun unchanged input expecting a different result, and do not remove the original directive merely to silence a remaining-directive search.

Use the [diagnostic reference](/docs/diagnostics) for the exact registry meaning, safety rationale, resolution steps, preservation behavior, and rerun guidance.
