---
path: /docs/compatibility/dynamic-bindings
title: Dynamic bindings
description: Understand why runtime expressions and ambiguous values remain source-visible for human review.
group: compatibility
order: 3
---

# Dynamic bindings

## Runtime values are not static evidence

An Angular binding can produce values that are unavailable during a source transformation. Guessing one possible runtime branch would turn a mechanical migration into a behavior change, so dynamic values are preserved when equivalence cannot be established.

The same principle applies when a literal is syntactically present but ambiguous for the selected target or overlaps output already owned by the application.

## Resolve deliberately

Read the diagnostic and inspect the component data that feeds the binding. A safe manual result may use conditional classes, component state, a stylesheet rule, or a source simplification before rerunning the codemod.

Keep the original directive until the replacement is reviewed. Removing it merely to silence a remaining-directive search loses the behavioral clue the diagnostic was designed to preserve.
