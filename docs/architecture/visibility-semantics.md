# Exact visibility conversion semantics

## Status

Approved design for the Tailwind CSS v4 `fxShow` and `fxHide` conversion increment.

## Purpose

Angular Flex-Layout visibility directives update the host element's inline `display` style. They normalize `fxShow` and `fxHide` into a shared show state, select responsive values using the library's breakpoint machinery, hide with `display: none`, and restore the element's original computed display value when shown.

A direct `fxShow` to `block` or `fxHide` to `hidden` mapping is not generally exact. The original display may be `inline`, `table`, a layout-derived flex value, or a value supplied by application CSS. This increment converts only visibility families whose complete display behavior is statically provable.

The source contract is pinned to the archived upstream [`ShowHideDirective`](https://github.com/angular/flex-layout/blob/84ac0ed3fe49263e405f2a449323fb73a798ff84/projects/libs/flex-layout/extended/show-hide/show-hide.ts) and its show/hide tests at commit `84ac0ed`.

## Scope

This increment supports literal `fxShow` and `fxHide` inputs at base and at the 13 standard viewport aliases already defined by the exact breakpoint catalog.

It does not add support for:

- Angular property bindings or interpolation;
- orientation, print, or custom breakpoint aliases;
- responsive `class`, `ngClass`, `style`, `ngStyle`, or `imgSrc` inputs;
- stylesheet discovery or mutation; or
- a native CSS target.

Unsupported inputs remain unchanged with structured diagnostics. No CLI option or runtime dependency is added.

## Upstream value semantics

Visibility values normalize to the upstream show state:

| Input            | Normalized show state |
| ---------------- | --------------------- |
| `fxShow`         | shown                 |
| `fxShow=""`      | shown                 |
| `fxShow="false"` | hidden                |
| other literals   | shown                 |
| `fxHide`         | hidden                |
| `fxHide=""`      | hidden                |
| `fxHide="false"` | shown                 |
| other literals   | hidden                |

The literal string `0` is truthy under the upstream coercion path. Bound numeric zero is false upstream, but every property binding remains dynamic because the codemod does not evaluate Angular expressions.

`VisibilityValueParser` owns this coercion and `fxHide` inversion. It returns an explicit result type rather than booleans with directive-specific interpretation elsewhere.

## Visibility state model

`VisibilityStatePlanner` groups all `fxShow` and `fxHide` inputs on one element into one atomic visibility family. Each literal member becomes a `VisibilityState` containing:

- shown or hidden intent;
- base or verified media activation range;
- original input identity; and
- upstream breakpoint priority for diagnostics and conservative overlap analysis.

The family uses these rules:

1. A family containing a dynamic, optional, print, or custom member is preserved atomically.
2. More than one base member is safe only when every base member normalizes to the same state.
3. Members in disjoint ranges may convert together.
4. Intersecting responsive members are safe only when they normalize to the same state.
5. Conflicting same-range or overlapping states remain unchanged with `responsive-precedence-unverified`.
6. A family whose effective state is always shown is a safe no-op: its attributes are removed and no class is generated.
7. A shown state that must override an effective hidden state requires a proven restoration display.

The planner never relies on HTML attribute order or Tailwind stylesheet order to choose between contradictory visibility inputs.

## Display restoration

`VisibleDisplayResolver` proves the display used by each effective shown state. Resolution is conservative and ordered:

1. A safely converted `fxLayout` supplies `flex` or `inline-flex` for the matching activation range.
2. One unambiguous, unmodified base Tailwind display utility may supply the original display for every range where it remains active.
3. If no directive state needs to restore visibility after an effective hidden state, no restoration class is required.
4. Otherwise the display is unverified and the complete visibility family is preserved with `display-restoration-unverified`.

Recognized restoration utilities are Tailwind v4's standard display values except `hidden`, including block, inline, flex, grid, table, flow-root, contents, and list-item families. Important, variant-prefixed, contradictory, or multiple base display utilities do not provide an unambiguous restoration value.

A literal or bound style that controls `display` always blocks conversion. Flex-Layout overwrote and later restored an inline display declaration; a normal Tailwind utility cannot reproduce that behavior without editing the style attribute. Bound class inputs continue to block generated classes under the existing safety contract.

An existing `hidden` utility is compatible only when every effective visibility state is hidden. Any shown state would require overriding that class and therefore remains unresolved.

## Layout and visibility composition

`fxLayout` and visibility both control `display`, so their strategies cannot be finalized independently. The adapter adds an element-level `DisplayCompositionPlanner` after semantic family planning and before existing-class conflict validation.

The composition planner consumes:

- converted layout plans and their base/responsive display utilities;
- the complete visibility state plan;
- the resolved original display; and
- activation ranges from the breakpoint catalog.

It produces one canonical element display plan:

- hidden ranges emit `hidden`;
- shown ranges that follow an effective hidden state emit the proven restoration utility;
- layout display utilities that are fully covered by a hidden range are suppressed for that range;
- non-display layout utilities such as direction, wrapping, alignment, and box sizing remain intact; and
- layout and visibility results are either both safe or preserved according to their dependency relationship.

This is a composition stage, not another directive strategy. It prevents same-range `flex` and `hidden` utilities from competing through Tailwind's cascade and keeps the responsibility for final display ownership in one place.

If unresolved visibility needs a converted layout to restore display, dependency closure preserves the layout family. If an unresolved layout makes restoration uncertain, dependency closure preserves the visibility family. Parent layout-gap behavior remains safe because native CSS gap ignores elements whose final display is none; unresolved legacy gap families retain their existing layout-context preservation rules.

## Tailwind emission and conflicts

`VisibilityEmitter` converts a finalized display plan into Tailwind CSS v4 tokens. It uses `hidden` for base hiding and the existing exact arbitrary media variant emitter for responsive states. Restoration utilities are emitted only from a proven display value.

Representative hidden and restoration tokens are compiled with Tailwind CSS v4 for base, bounded, min-only, and max-only activation ranges. Compiler output must prove the intended media query and final display declaration.

The final compiler-proven token examples are:

| Activation | Emitted token                                                             | Compiled result                                                  |
| ---------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| base       | `hidden`                                                                  | `display: none`                                                  |
| `sm`       | `[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:hidden` | bounded `600px`–`959.98px` media rule containing `display: none` |
| `gt-xs`    | `[@media_screen_and_(min-width:_600px)]:flex`                             | min-only `600px` media rule containing `display: flex`           |
| `lt-sm`    | `[@media_screen_and_(max-width:_599.98px)]:inline-flex`                   | max-only `599.98px` media rule containing `display: inline-flex` |

Composition assigns those tokens only after resolving display ownership. For example:

```html
<!-- input -->
<div fxLayout="column" fxShow="false" fxShow.sm></div>

<!-- output -->
<div
  class="flex flex-col box-border hidden [@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:flex"
></div>
```

When responsive layout and hiding share the `sm` range, the competing responsive `flex` token is omitted while direction and box sizing remain:

```html
<!-- input -->
<div fxLayout.sm="column" fxHide.sm></div>

<!-- output -->
<div
  class="[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:flex-col [@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:box-border [@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:hidden"
></div>
```

The existing Tailwind conflict policy remains the final external-class gate. It is extended only where needed to distinguish:

- a base display utility deliberately consumed as the restoration source;
- a compatible existing `hidden` state; and
- a competing display utility that makes the final state ambiguous.

Post-conflict dependency closure runs before source edits, so preserving one display owner cannot leave a coupled layout or visibility family partially removed.

## Diagnostics

This increment adds:

- `display-restoration-unverified`: a shown state must restore a display value that cannot be proven from the template and planned layout semantics.

Existing diagnostics remain applicable:

- `dynamic-binding` for property bindings and interpolation;
- `breakpoint-unverified` for orientation and print aliases;
- `custom-breakpoint` for unknown aliases;
- `responsive-precedence-unverified` for conflicting intersecting states;
- `class-conflict` for incompatible existing display utilities;
- `bound-class` for generated output blocked by a class binding; and
- `context-unverified` for an unresolved layout/visibility dependency.

Intrinsic binding and breakpoint diagnostics take precedence over contextual diagnostics. Every unresolved member retains its most actionable reason even when dependency closure preserves related inputs.

## Data flow

1. The Angular parser and analyzer discover all visibility and layout inputs without evaluating bindings.
2. `VisibilityValueParser` normalizes literal show/hide values.
3. `VisibilityStatePlanner` validates the complete visibility family and activation-range overlaps.
4. Existing layout strategies produce semantic layout plans.
5. `VisibleDisplayResolver` proves restoration values from safe layout context or one static display utility.
6. `DisplayCompositionPlanner` produces the final element display plan and dependency relationships.
7. `VisibilityEmitter` decorates finalized display utilities with exact Tailwind v4 media variants.
8. Existing-class conflict validation and post-conflict dependency closure run across the complete element plan.
9. Source edits are emitted only when every removed input has a safe converted result.

## Testing strategy

Development follows test-driven delivery. Every behavior is represented by a failing test before implementation.

### Unit contracts

- Table-driven parser tests cover empty, `false`, arbitrary truthy literals, literal `0`, directive inversion, and dynamic input rejection.
- State-planner tests cover base-only, responsive-only, base plus responsive, disjoint ranges, identical overlaps, conflicting overlaps, duplicate bases, and mixed show/hide declarations.
- Display-resolution tests cover layout-derived flex and inline-flex, every recognized static display family, hidden, important and variant-prefixed classes, contradictory classes, inline display styles, and bound class/style values.
- Composition tests cover same-range layout and hiding, hidden-to-visible restoration, suppression of competing layout display utilities, non-display layout preservation, and dependency closure.
- Tailwind compiler tests cover hidden and restoration output in every media-range shape.

### Integration contracts

- Planner tests prove visibility/layout atomicity before and after class conflicts.
- Compatibility fixtures cover every standard alias, exact output, all preserved alias/binding families, diagnostic precedence, existing class/style interactions, source-order independence, and idempotence.
- CLI and JSON report tests prove the new diagnostic and strict unresolved behavior.
- Mutation checks demonstrate that overlap, ordering, and composition tests fail when their safety gates are removed.

The complete repository verification, coverage thresholds, build, package smoke test, audit, package-content inspection, tracked-file hygiene scan, and independent whole-branch review remain release gates.

## Delivery boundary

This is one feature PR with a minor Changeset. It adds exact visibility conversion without changing the CLI or published runtime dependencies.

Deferred work includes responsive class/style/image inputs, project-aware display discovery, stylesheet mutation, print and orientation visibility, dynamic expressions, CSS Grid directives, and a native CSS adapter.
