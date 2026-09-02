# Target-Neutral Flex Semantic Core

## Purpose

This slice extracts the statically provable Flex-Layout behavior already supported by the Tailwind target into a target-neutral semantic core. It is the first implementation step toward native CSS output. The extraction must preserve every current Tailwind class, diagnostic, source edit, report result, and compatibility boundary.

The slice is architectural cleanup, not a new migration capability. It removes value interpretation from the Tailwind adapter so a later native CSS renderer can consume the same verified semantics without duplicating Angular Flex-Layout rules.

## Scope

The semantic core covers the currently supported static behavior of:

- `fxLayout`;
- `fxLayoutAlign`;
- `fxLayoutGap`;
- `fxFlex` together with `fxGrow` and `fxShrink`;
- `fxFlexAlign`;
- `fxFlexFill` and `fxFill`;
- `fxFlexOffset`; and
- `fxFlexOrder`.

Base values and the 13 standard viewport aliases use the same semantic parsing. Existing orientation and print configuration continues to use the shared breakpoint catalog and the current responsive-family orchestration.

Grid, visibility, responsive class/style, responsive images, project CSS inspection, native stylesheet output, and multi-file transactions are outside this slice. They retain their existing implementations and contracts.

## Design constraints

The extraction follows these constraints:

1. Semantic modules cannot import from `adapter/tailwind`, emit Tailwind class names, or contain Tailwind arbitrary-value syntax.
2. Tailwind renderers cannot reinterpret raw directive strings. They consume successful semantic values and only decide how those values are encoded as classes.
3. Context-sensitive behavior remains explicit. Parent layout direction and wrapping are semantic inputs to child sizing, offset, gap, and alignment planning.
4. The shared breakpoint catalog remains the only authority for media definitions and priority. Semantic values may carry a verified `BreakpointDefinition`, but never a Tailwind media variant string.
5. Existing public diagnostics retain their status, code, reason, and suggestion. Moving a validation rule must not rename or collapse its diagnostic.
6. Existing conflict and ownership analysis continues to evaluate the Tailwind classes produced by the renderer. This slice does not generalize target-specific ownership.

## Components

### Shared value parsing

Target-neutral CSS value parsing moves out of the Tailwind adapter. It parses and normalizes only syntax whose meaning is independent of the output target, including nonnegative factors and CSS lengths with directive-specific fallback units.

The parser returns branded semantic values or a typed invalid result. Tailwind encoding helpers such as underscore escaping and arbitrary-class construction remain under `adapter/tailwind`.

### Flex semantic planners

Focused planners under `src/flex/` produce immutable domain values:

- layout direction, wrapping, inline display, and border-box behavior;
- main-axis, cross-axis, and content alignment plus stretch sizing;
- gap length and the conditions that make margin-gap behavior unrepresentable;
- grow, shrink, basis, effective basis, and axis-dependent min/max sizing;
- self alignment;
- fill dimensions and zero-margin behavior;
- axis-dependent offset margin; and
- integer order behavior.

The planners receive decoded literal values and the minimum verified context they need. They return either a semantic value or the same structured unresolved/invalid information currently produced by Tailwind strategies.

No single universal declaration bag is introduced in this slice. Typed family values preserve intent and avoid turning the semantic layer into a weak string map. A later native CSS renderer can translate those values to declarations while Tailwind renderers translate them to utilities.

### Tailwind renderers

The existing directive strategy modules become thin target renderers. Each calls a semantic planner, forwards any diagnostic unchanged, and maps a successful domain value to the exact current Tailwind class sequence.

Renderer helpers may emit built-in utilities or arbitrary properties, but they do not parse directive grammar or decide Flex-Layout semantics. Responsive variant emission remains a later Tailwind adapter step over the rendered classes.

### Compatibility bridge

During extraction, existing exported strategy functions remain available so the adapter and focused tests can migrate incrementally. Internal compatibility wrappers are removed once all scoped directives consume the semantic core. No deprecated public API is created because these modules are package-internal.

## Data flow

For each scoped input, the resulting flow is:

```text
decoded Angular literal + verified element/parent context
                         |
                         v
               Flex semantic planner
                  /             \
       semantic family value   existing diagnostic
                  |
                  v
             Tailwind renderer
                  |
                  v
      responsive variant + ownership checks
                  |
                  v
             source edit plan
```

The Tailwind adapter remains responsible for grouping responsive families, closing element and parent dependencies, resolving class conflicts, and returning `PlannedConversion` objects. The semantic core does not depend on template ranges, reports, terminal output, or file writes.

## Migration sequence

Extraction proceeds family by family behind characterization tests:

1. establish target-neutral result, CSS length, and layout models;
2. move layout, alignment, and gap semantics;
3. move flex-item sizing and parent-axis semantics;
4. move align, fill, offset, and order semantics;
5. reduce Tailwind directive modules to render-only mappings; and
6. enforce dependency-direction and target-string boundaries with architecture tests.

At each step, existing Tailwind unit and compatibility fixtures must remain byte-for-byte identical. Superseded parsers and duplicate models are deleted as soon as their consumers move.

## Diagnostics and safety

Semantic planners preserve the current conservative decisions:

- malformed literal values remain `invalid-value`;
- missing or dynamic parent context remains `context-unverified`;
- negative, computed-possibly-negative, grid-mode, or wrapped gap behavior retains its current diagnostic;
- unsupported Flex-Layout behavior remains `semantic-unsupported`; and
- bound inputs remain handled by the existing adapter before semantic literal planning.

The shared result type carries complete diagnostic text rather than requiring renderers to recreate it. A renderer must pass failures through unchanged.

If extraction reveals that a current Tailwind output depends on target-specific interpretation rather than verified Flex semantics, that case remains in the Tailwind layer and is documented as an explicit exception. The extraction does not broaden conversion to make the abstraction appear complete.

## Testing

Verification includes:

- unit tests for each semantic family without importing Tailwind modules;
- renderer tests showing each semantic value maps to the exact existing class order;
- base and all-standard-alias characterization through the real adapter;
- parent row/column, reverse, wrap, and missing-context cases;
- exact diagnostic status, code, reason, and suggestion parity;
- architecture tests rejecting `adapter/tailwind` imports and Tailwind class/variant syntax inside `src/flex`;
- byte-for-byte compatibility fixtures and idempotence; and
- the complete repository verification command, including coverage, build, and package checks.

Because this slice intentionally has no user-visible behavior change, it does not add a Changeset or alter the compatibility inventory.

## Completion criteria

The slice is complete when every scoped directive delegates value interpretation to `src/flex`, Tailwind-specific code only renders successful semantic values, superseded semantic parsing is removed from the adapter, architectural dependency tests pass, and all existing public outputs remain unchanged.

Native CSS rendering starts only after this parity-preserving extraction is merged.
