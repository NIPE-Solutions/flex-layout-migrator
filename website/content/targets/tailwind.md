---
path: /docs/tailwind
title: Tailwind CSS
description: Understand the default utility output, responsive variants, and conservative conflict boundary.
group: targets
order: 1
---

# Tailwind CSS

## Tailwind CSS v4 is the default target

The Tailwind target converts only semantics it can express exactly with Tailwind CSS v4. Keyword behavior uses stable utilities. Source lengths and percentages use arbitrary values, so `fxLayoutGap="4"` keeps its `4px` meaning and `fxFlexOffset="4"` keeps its `4%` meaning instead of depending on a project's spacing scale.

The output is self-contained template syntax. This target does not edit CSS, Sass, Less, a Tailwind configuration file, or a companion stylesheet. It statically reads migration-relevant target settings when you supply a stylesheet or declarative profile. Plugins are never executed. See [Target configuration](/docs/configuration).

```text
npx flex-layout-codemod ./src --target tailwind
```

## Exact responsive ranges

The 13 standard viewport aliases use the archived Angular Flex-Layout media ranges. Generated classes carry self-contained arbitrary media variants rather than substituting project-defined `sm:`, `md:`, or similar mobile-first variants. Bounded, less-than, and greater-than aliases can overlap, so the planner converts one complete directive family only when overlapping values agree or their activation ranges are disjoint.

A differing overlap remains unchanged with `responsive-precedence-unverified`. A custom alias remains unchanged because the project may have registered its own media definition.

Orientation and print require source-project evidence. `--orientation-breakpoints` asserts that the archived orientation definitions were enabled. `--print-with-breakpoints <aliases>` asserts the application's `printWithBreakpoints` list; `none` explicitly represents an empty list. These flags do not discover or change application configuration. Without the matching assertion, the related inputs remain unchanged with `breakpoint-unverified`.

## Class ownership and conflicts

An existing recognized Tailwind utility is checked by the CSS properties it owns and by its activation range. If that ownership intersects proposed output, the complete affected family remains unchanged with `class-conflict`. HTML class order is not used as proof of Tailwind cascade order.

Bound whole-class values remain runtime authorities and can produce `bound-class`. Ordinary application classes without a recognized Tailwind root remain additive, but project utilities, plugin output, custom-theme candidates, selector-changing variants, and candidates with incomplete property descriptors are not guessed.

Responsive `ngClass` conversion requires every token in the complete family to be a proven Tailwind CSS v4 candidate that remains attached to the host element. Responsive `ngStyle` requires sanitizer-safe declarations whose exact CSS property ownership can be represented. One unverified member preserves its atomic family.

## Visibility, Grid, and review

Visibility conversion plans `fxShow` and `fxHide` together. Hiding emits `hidden`; a later shown state converts only when its display restoration is proven by converted layout semantics or one unambiguous base display utility. Literal or bound display styles, conflicting display utilities, and unresolved responsive class/style ownership preserve the family.

Grid container and child directives convert literal values only when generated declarations, display composition, parent context, and existing ownership are all exact. The [compatibility explorer](/docs/compatibility) gives the registry status for every recognized directive, while [verified examples](/docs/examples) publish exact input, output, statuses, and codes.

Run the plan first, review every preserved family, and verify base and responsive states in the application before adding `--write`.
