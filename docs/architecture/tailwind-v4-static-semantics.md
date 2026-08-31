# Tailwind CSS v4 static conversion semantics

## Purpose

The Tailwind adapter converts a static Angular Flex-Layout directive only when Tailwind CSS v4 can represent the complete observable layout behavior. It must not treat similarly named utilities as proof of equivalence.

This contract is based on the archived Angular Flex-Layout [source](https://github.com/angular/flex-layout/tree/master/projects/libs/flex-layout/flex), its [API documentation](https://github.com/angular/flex-layout/wiki/API-Documentation), and the current Tailwind CSS [utility documentation](https://tailwindcss.com/docs/styling-with-utility-classes).

## Architectural boundaries

Conversion is split into four responsibilities:

1. Directive parsers turn literal attribute text into directive-specific value objects. They validate syntax and apply Angular Flex-Layout defaults, including implicit percentage units.
2. An element semantic planner combines directives whose behavior is coupled. In particular, `fxGrow` and `fxShrink` modify the `fxFlex` computation and cannot be planned independently.
3. Tailwind v4 emitters translate semantic values into deterministic utility classes. Emitters do not inspect Angular syntax or decide safety policy.
4. The adapter classifies the complete element plan as converted, review, unsupported, or invalid and supplies stable diagnostics. Mutation occurs only for inputs included in a complete safe plan.

The registry associates supported directive families with parsers and emitters. The registry replaces a central switch without introducing runtime dependency injection or a general plugin framework.

## Element-level atomicity

Interdependent attributes are converted as one semantic group. The flex-item group contains `fxFlex`, `fxGrow`, and `fxShrink`. Either every participating literal attribute is represented and removed, or the complete group is preserved.

Independent attributes on the same element may still convert when another group is unresolved. Existing property bindings and responsive suffixes remain preserved and cannot contribute values to a static group.

## Static directive contract

### `fxLayout`

The parser accepts the four upstream directions plus the optional `wrap`, `wrap-reverse`, `nowrap`, and `inline` modifiers in valid combinations. The emitter includes `flex` or `inline-flex`, direction, wrapping, and `box-border`. Empty input means a row, non-wrapping flex container.

Unknown, duplicate, or contradictory tokens are invalid and remain unchanged.

### `fxLayoutAlign`

The main-axis value maps to `justify-*`. The cross-axis value maps both `align-items` and, where Angular Flex-Layout sets it, `align-content`; `space-around` and `space-between` therefore cannot be reduced to an `items-*` class. Default values are `start stretch`.

Because the upstream directive also establishes flex display, direction, border-box sizing, and stretch-dependent maximum dimensions, the emitter derives those classes from the element's static `fxLayout` value or the upstream row default. If that context is dynamic or responsive, alignment is preserved for review.

### `fxLayoutGap`

Plain nonnegative gaps use Tailwind v4 `gap-*` only when the element is statically known not to wrap. Angular's non-grid implementation uses directional margins and differs from CSS `gap` across wrapped lines. A wrapping or dynamically directed container is preserved for review. Negative and computed values are also preserved because their non-negativity cannot be proven and CSS gap rejects negative results.

The `grid` suffix is not CSS Grid display. Upstream applies padding to children and compensating negative margins to the host. It is preserved for review until a multi-element edit model can reproduce that algorithm exactly.

Unitless upstream values use its default `px` unit, so `fxLayoutGap="4"` emits `gap-[4px]`; it must not emit Tailwind's theme-dependent `gap-4`.

### `fxFlex`, `fxGrow`, and `fxShrink`

These attributes form one group. The parser derives the upstream grow, shrink, and basis values, including keywords, unitless percentages, parent direction, and wrap-sensitive min/max constraints. The emitter uses Tailwind v4 flex, basis, min/max sizing, and `box-border` utilities or arbitrary properties where necessary.

`fxGrow` and `fxShrink` are converted only when attached to the same Angular directive instance as `fxFlex`. Standalone attributes are invalid because Angular does not instantiate the flex directive for them.

If parent direction or wrap behavior cannot be proven from a static `fxLayout`, the group is preserved for review whenever that context changes the emitted CSS.

### `fxFlexAlign`

The accepted values are `start`, `end`, `center`, `baseline`, `stretch`, and `auto`, with empty input defaulting to `stretch`. They emit the corresponding Tailwind v4 `self-*` utility. Other values are invalid.

### `fxFlexFill` and `fxFill`

Both aliases emit the full upstream rule: zero margin, full width and height, full minimum width and height. The aliases are non-responsive and semantically identical.

### `fxFlexOffset`

The emitter uses the parent layout to select block-start or inline-start margin. Unitless values are percentages under the upstream contract and therefore use arbitrary values rather than Tailwind's spacing scale. Missing or dynamic parent layout defaults to the upstream row behavior only when no responsive layout can override it; otherwise the input is preserved for review.

### `fxFlexOrder`

The parser reproduces the upstream `parseInt` contract and emits a deterministic arbitrary order value. Empty, zero, and non-numeric values emit no class because the upstream directive clears its inline order declaration.

## Tailwind v4 output rules

- Generated output targets Tailwind CSS v4 only.
- Theme-independent keywords use standard utilities.
- Source lengths and percentages use arbitrary utilities so a project theme cannot change their meaning.
- Spaces inside arbitrary values use underscores, as required by Tailwind v4.
- Arbitrary CSS properties are allowed when no named utility expresses an upstream rule exactly.
- Output class order is stable and defined by semantic category, not object or locale iteration.
- A recognized existing Tailwind utility for the same CSS property produces `class-conflict`; both the directive and existing class are preserved for review.

## Diagnostics

Syntax outside an upstream directive's value grammar produces `invalid-value`. A valid value that depends on unresolved element or parent context produces `context-unverified`. A recognized upstream behavior that Tailwind v4 cannot reproduce within the current edit model produces `semantic-unsupported`. An existing Tailwind utility that controls the same CSS property produces `class-conflict`.

Diagnostics explain the missing proof or behavior and leave every affected directive untouched.

## Verification

Each directive family has table-driven unit tests with hand-derived expected classes. Integration fixtures verify coupled attributes, existing classes, preserved unsafe inputs, structured diagnostics, source-order independence, idempotence, and mixed converted/unresolved elements.

The package verification suite, coverage thresholds, build, package smoke test, audit, and repository hygiene checks remain release gates.
