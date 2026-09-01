# Exact responsive breakpoint conversion

## Status

Approved design for the Tailwind CSS v4 responsive conversion increment.

## Purpose

Angular Flex-Layout breakpoint aliases are media-query contracts. They are not interchangeable with similarly named Tailwind breakpoints: the `xs` through `xl` aliases are bounded ranges, while the `lt-*` and `gt-*` aliases overlap those ranges. Responsive conversion must retain those exact activation conditions or preserve the original attribute for review.

This increment converts literal responsive Flex-Layout inputs to self-contained Tailwind CSS v4 arbitrary media variants. It does not edit application stylesheets or Tailwind configuration.

## Scope

The supported aliases are the standard viewport breakpoints shipped by Angular Flex-Layout:

| Alias   | Exact media query                                           | Priority |
| ------- | ----------------------------------------------------------- | -------: |
| `xs`    | `screen and (min-width: 0px) and (max-width: 599.98px)`     |     1000 |
| `sm`    | `screen and (min-width: 600px) and (max-width: 959.98px)`   |      900 |
| `md`    | `screen and (min-width: 960px) and (max-width: 1279.98px)`  |      800 |
| `lg`    | `screen and (min-width: 1280px) and (max-width: 1919.98px)` |      700 |
| `xl`    | `screen and (min-width: 1920px) and (max-width: 4999.98px)` |      600 |
| `lt-sm` | `screen and (max-width: 599.98px)`                          |      950 |
| `lt-md` | `screen and (max-width: 959.98px)`                          |      850 |
| `lt-lg` | `screen and (max-width: 1279.98px)`                         |      750 |
| `lt-xl` | `screen and (max-width: 1919.98px)`                         |      650 |
| `gt-xs` | `screen and (min-width: 600px)`                             |     -950 |
| `gt-sm` | `screen and (min-width: 960px)`                             |     -850 |
| `gt-md` | `screen and (min-width: 1280px)`                            |     -750 |
| `gt-lg` | `screen and (min-width: 1920px)`                            |     -650 |

The values and priorities are pinned to the archived upstream source at commit [`84ac0ed`](https://github.com/angular/flex-layout/blob/84ac0ed3fe49263e405f2a449323fb73a798ff84/projects/libs/flex-layout/core/breakpoints/data/break-points.ts).

Orientation aliases, print behavior, and unknown aliases remain unresolved. Orientation breakpoints were opt-in, print used additional runtime fallback behavior, and applications could register or replace breakpoints. Their presence alone is not sufficient evidence of the active project configuration.

Only literal responsive values are converted. Property bindings and interpolated values remain unchanged under the existing dynamic-binding policy.

## Architecture

### Breakpoint domain model

`BreakpointCatalog` is the target-independent source of verified viewport aliases. It returns an immutable `BreakpointDefinition` value containing:

- the alias;
- exact minimum and maximum widths;
- the upstream priority.

Bounds are numeric domain values rather than media-query strings. Overlapping-family relationships are derived from numeric range intersections rather than stored on each definition. This permits exact intersection tests without parsing emitted Tailwind syntax. Catalog lookup returns an exhaustive classification: verified viewport alias, optional alias, print alias, or custom alias.

The analyzer continues to discover and normalize suffixes. It does not decide whether a breakpoint is safe for a target.

### Tailwind responsive emitter

`ResponsiveVariantEmitter` is a Tailwind-specific strategy. It accepts a verified `BreakpointDefinition` and a semantic utility, then emits a self-contained Tailwind v4 arbitrary `@media` variant. Directive strategies remain responsible only for Flex-Layout value semantics; they do not construct breakpoint syntax.

The emitter owns escaping and canonical formatting. Its output is validated by compiling representative generated classes with Tailwind CSS v4 during the test suite. This keeps the published package independent of Tailwind while ensuring the codemod does not emit syntax based only on string snapshots.

The compiler-proven token form is a self-contained arbitrary media variant, for example `[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:flex-row` for the `sm` range. The underscores encode Tailwind's arbitrary-variant whitespace, so generated tokens retain the exact Angular Flex-Layout media conditions without relying on a project's named Tailwind breakpoint configuration.

Named `@custom-variant` declarations are intentionally deferred. They would require stylesheet discovery, mutation policy, duplicate handling, and a new CLI configuration surface.

### Element conversion context

The planner supplies each directive strategy with an immutable element conversion context containing:

- base and responsive inputs for the directive family;
- relevant sibling and parent layout semantics;
- verified breakpoint definitions; and
- existing static class tokens.

Base and responsive members of a directive family are planned atomically. Context-sensitive relationships already enforced for layout, gap, alignment, flex sizing, and offset also apply across responsive members. A responsive member cannot consume context that the plan leaves unresolved.

### Responsive conflict policy

The adapter extends its Tailwind conflict policy to compare CSS properties and media-range intersections, not class-token spelling alone. The rules are:

1. A base value and one or more verified responsive values may convert when their semantic plan is otherwise safe.
2. Responsive values with disjoint ranges may convert independently.
3. Overlapping responsive values may convert when their utilities are semantically identical.
4. Overlapping responsive values that control the same CSS property differently are preserved as one atomic directive family with `responsive-precedence-unverified`.
5. An existing Tailwind utility conflicts only when it controls the same property in an intersecting activation range. A conflicting family remains unchanged with `class-conflict`.
6. Output ordering is canonical and independent of Angular attribute order.

Angular Flex-Layout resolved simultaneously active aliases using breakpoint priorities. Tailwind's generated cascade must not be assumed to reproduce that runtime priority. Conservatively preserving conflicting overlaps prevents an apparently successful migration from changing layout behavior.

## Data flow

1. The Angular template parser discovers base and responsive inputs without evaluating bindings.
2. The breakpoint catalog classifies every suffix.
3. The planner groups semantically coupled inputs at element and directive-family boundaries.
4. Existing directive strategies produce target-neutral semantic utilities for literal values.
5. The responsive emitter decorates utilities associated with verified viewport aliases.
6. The conflict policy checks generated and existing utilities across intersecting activation ranges.
7. The planner emits source edits only when the complete group is safe; otherwise it returns structured unresolved results and preserves every member of the unsafe group.

## Diagnostics

The existing diagnostic contract remains stable. This increment adds:

- `responsive-precedence-unverified`: overlapping responsive values would rely on a cascade order that has not been proven equivalent to Angular Flex-Layout.

Existing classifications remain applicable:

- unknown aliases use `custom-breakpoint`;
- orientation and print aliases use `breakpoint-unverified` with a specific reason and action;
- property bindings and interpolation use `dynamic-binding`;
- existing utility collisions use `class-conflict`;
- invalid directive values use `invalid-value`; and
- unresolved semantic dependencies use `context-unverified`.

Diagnostics identify the complete preserved group and recommend either simplifying overlapping declarations or supplying a project-aware breakpoint migration in a later release.

## Testing strategy

Development follows test-driven delivery. Each behavior is represented by a failing test before implementation.

### Unit contracts

- Table-driven catalog tests cover every supported alias, exact bounds, priorities, intersection behavior, and exhaustive unsupported classifications.
- Variant-emitter tests cover min-only, max-only, bounded, escaping, and canonical output.
- Conflict-policy tests cover base, disjoint, identical overlap, conflicting overlap, existing responsive utilities, and nonintersecting utilities.
- Every responsive-capable directive strategy is tested with base-only, responsive-only, and base-plus-responsive inputs.

### Integration contracts

- Planner tests cover atomic directive families and cross-directive context dependencies.
- Compatibility fixtures cover all supported aliases, base-plus-responsive values, disjoint values, identical and conflicting overlaps, dynamic values, orientation, print, custom aliases, existing classes, coupled layout/flex cases, preservation, and idempotence.
- A Tailwind CSS v4 compilation smoke test proves that representative generated variants produce the expected media rules and utilities.
- CLI and JSON report tests prove stable diagnostics and strict unresolved exit behavior.

The full repository verification, coverage thresholds, package smoke test, audit, and package-content inspection remain release gates.

## Delivery boundary

This is one feature PR with a user-facing Changeset. It adds exact standard viewport support without adding runtime dependencies or changing the CLI surface.

Deferred work includes:

- project-aware custom breakpoint configuration;
- orientation and print conversion;
- generated named variants and stylesheet mutation;
- dynamic responsive expressions;
- responsive class, style, and image directives; and
- CSS Grid directives.
