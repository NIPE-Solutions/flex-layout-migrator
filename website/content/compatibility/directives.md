---
path: /docs/compatibility/directives
title: Directive behavior
description: Review layout, visibility, grid, class, style, breakpoint, orientation, and print families by semantics.
group: compatibility
order: 2
---

# Directive behavior

## Flex families are planned atomically

Base and responsive members of one semantic family are decided together. Layout establishes direction, wrapping, display, and border-box behavior. Layout alignment carries main-axis and cross-axis behavior plus required layout context. Gap converts only when nonnegative, non-wrapping behavior is proven; unitless gaps are pixels, while the source `grid` gap algorithm remains unsupported by the current edit model.

Flex-item sizing combines `fxFlex`, `fxGrow`, and `fxShrink`. Grow and shrink do not convert alone because they are not independent Flex-Layout directive instances. Fill aliases include zero margin and full width, height, minimum width, and minimum height. Offset depends on the parent axis and treats unitless values as percentages. Order uses the source integer contract rather than a Tailwind theme value.

If a required parent or sibling value is dynamic, responsive, invalid, or otherwise unresolved, the dependent group remains unchanged with its diagnostic. Independent groups on the same element may still convert when their property and edit ownership do not overlap.

## Visibility and display restoration

`fxShow` and `fxHide` form one atomic visibility family. Literal values follow Angular Flex-Layout coercion: the literal string `"0"` is truthy, while a property-bound zero remains dynamic. An all-shown family can be removed without generating a class. Hiding generates exact base or responsive `hidden` output.

A shown override after hiding needs one proven restoration display. A safely converted layout or one unambiguous unmodified base display utility can supply it. Literal or bound display styles, multiple or variant-prefixed display utilities, important ownership, conflicting overlaps, or unresolved responsive class/style output preserve the related family.

When layout and visibility both own `display`, the planner composes them before creating edits. Hidden ranges suppress covered layout display output while retaining non-display layout semantics. Partial overlaps that cannot preserve exact ownership remain unchanged.

## Grid composition

The Tailwind target handles literal Grid container and child semantics only when the full declaration, display composition, parent context, compiler output, and existing ownership are exact. Grid container members share one `grid` or `inline-grid` display state, including `gdInline`. Bound values, unsafe parent context, compiler-unverified values, or unresolved ownership preserve the family.

Native CSS does not implement the Grid family. The [compatibility explorer](/docs/compatibility) is the authority for each directive and target, and the Grid fixture on [verified examples](/docs/examples) shows converted standard input beside preserved dynamic and unconfigured print input.

## Responsive class and style

Literal responsive `ngClass` families convert only when every token is a proven Tailwind CSS v4 candidate with complete property and host-selector ownership. Project classes, plugin utilities, custom-theme-dependent candidates, selector-changing variants, unsafe raw-source spelling, and one unverified token preserve the whole family.

Literal responsive `ngStyle` families convert only when the declaration parser and sanitizer semantics can be represented exactly as Tailwind arbitrary properties. URL-bearing or sanitizer-sensitive values, unsupported units or spellings, interpolation, ambiguous splitting, shorthand/longhand overlap, raw-source-unsafe tokens, and declaration `!important` remain unchanged.

Deprecated responsive `class.<alias>` and `style.<alias>` replacement behavior is not inferred. Unsuffixed class and style inputs are not reported as responsive source occurrences, but they remain ownership evidence and can prevent conversion of responsive siblings.

## Breakpoints, orientation, and print

The 13 standard aliases use exact archived media ranges and priorities. Disjoint responsive values and identical overlaps can convert. Differing overlaps preserve the complete family with `responsive-precedence-unverified`; source attribute order is not used as cascade proof.

Orientation and print conversion is available only for Tailwind output and only with matching source-configuration assertions. `--orientation-breakpoints` enables the archived handset, tablet, and web orientation definitions. `--print-with-breakpoints <aliases>` supplies the archived print fallback list, and an explicit `.print` member wins over configured responsive fallbacks. Invalid lists are configuration errors before migration.

Custom aliases remain project-owned. The codemod does not discover provider configuration or replace a project's breakpoint definitions.
