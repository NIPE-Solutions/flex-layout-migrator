# Conversion safety model

The codemod must preserve layout behavior or clearly explain why it cannot. It must never remove an Angular Flex-Layout directive after making an approximate or incomplete conversion.

This document defines the contract shared by the analyzer, target adapters, CLI, and compatibility tests.

## Source contract

The compatibility inventory is based on the archived [Angular Flex-Layout source](https://github.com/angular/flex-layout) and its [API documentation](https://github.com/angular/flex-layout/wiki/API-Documentation). It covers:

- Flex directives: `fxLayout`, `fxLayoutAlign`, `fxLayoutGap`, `fxFlex`, `fxGrow`, `fxShrink`, `fxFlexAlign`, `fxFlexFill`/`fxFill`, `fxFlexOffset`, and `fxFlexOrder`.
- Visibility directives: `fxShow` and `fxHide`.
- Grid directives: `gdAlignColumns`, `gdAlignRows`, `gdArea`, `gdAreas`, `gdAuto`, `gdColumn`, `gdColumns`, `gdGap`, `gdGridAlign`, `gdRow`, and `gdRows`.
- Extended responsive inputs: `class`, `ngClass`, `style`, `ngStyle`, and `imgSrc`.
- Default aliases: `xs`, `sm`, `md`, `lg`, `xl`, `lt-sm`, `lt-md`, `lt-lg`, `lt-xl`, `gt-xs`, `gt-sm`, `gt-md`, and `gt-lg`.
- Optional orientation aliases, the `print` alias, and custom breakpoint registrations.

## Conversion outcomes

Every recognized input receives one outcome before a file is changed.

| Outcome       | Meaning                                                                                                    | Mutation allowed |
| ------------- | ---------------------------------------------------------------------------------------------------------- | ---------------- |
| `converted`   | The target representation is semantically equivalent.                                                      | Yes              |
| `review`      | Conversion depends on runtime data, configuration, or surrounding layout that cannot be proven statically. | No               |
| `unsupported` | The selected target has no equivalent implemented by this version.                                         | No               |
| `invalid`     | The directive or value does not match the upstream input contract.                                         | No               |
| `parse-error` | Angular rejected the template and no edit plan could be created.                                           | No               |

An attribute is removed only when its outcome is `converted`. A file may contain converted and unresolved inputs; unresolved inputs and every byte outside explicit edit ranges remain unchanged.

Each unresolved result includes a stable diagnostic code, file location, directive, reason, and suggested next action. Stable codes allow CI systems to distinguish known migration debt from new findings.

## Static and bound values

Literal values can be converted when the adapter supports their complete semantics. Angular property bindings are not literals merely because their source text resembles one. For example, `[fxFlex]="basis"` is a runtime expression and requires review, while `[fxFlex]="'25%'"` may be reduced to a literal after Angular-expression parsing proves it is constant.

Interpolation, pipes, method calls, object or array expressions, and template variables require review unless a later analyzer explicitly proves them constant. The codemod does not evaluate application code.

## Responsive behavior

Angular Flex-Layout aliases are media-query contracts, not names that can be substituted with similarly named framework breakpoints. The default aliases include bounded ranges and overlapping `lt-*` and `gt-*` ranges. Tailwind's default responsive variants are mobile-first minimum-width queries, so `fxLayout.sm` is not generally equivalent to `sm:flex-row`.

Adapters must use the exact upstream media query, a verified project configuration with identical semantics, or return `review`. Orientation, print, and custom aliases require the same proof. The analyzer records the alias separately from the directive so breakpoint policy remains target-independent.

## Target adapters

The analyzer produces a normalized directive, parsed value, binding kind, breakpoint, source location, and relevant element context. It does not generate CSS classes.

The initial `tailwind` adapter emits utilities only when current Tailwind syntax represents the supported static source behavior. Arbitrary values are used when they are deterministic and valid for content scanning. A future native CSS adapter is outside the current implementation.

## Processing pipeline

1. Parse the Angular template without interpreting expressions as HTML attributes.
2. Discover all Flex-Layout inputs, including bracketed bindings and responsive suffixes.
3. Normalize aliases and parse directive values according to the upstream contract.
4. Ask the selected adapter to classify each input and propose edits.
5. Validate that edits do not conflict and that every removed input has a `converted` result.
6. Apply edits from the end of the source toward the beginning and atomically write only changed files.
7. Re-analyze the output in tests to prove that a second run produces no additional edits.

Analysis and mutation are separate operations. Dry-run and machine-readable reporting are planned CLI features.

## Planned CLI contract

The planned default summary reports files scanned, files changed, converted inputs, review items, unsupported inputs, and invalid inputs. Normal output will be concise; `--report <path>` will write a machine-readable JSON report.

The planned exit codes are:

| Code | Meaning                                                                                   |
| ---- | ----------------------------------------------------------------------------------------- |
| `0`  | The command completed and no unresolved inputs remain.                                    |
| `1`  | The command failed because of configuration, parsing, I/O, or an internal error.          |
| `2`  | The migration completed but review, unsupported, or invalid inputs remain in strict mode. |

Strict mode will be enabled by default. `--allow-unresolved` will permit exit code `0` while still reporting and preserving unresolved inputs.

## Compatibility verification

The test corpus is organized by directive rather than implementation class. Every directive family includes, where applicable:

- default and explicit literal values;
- all supported value keywords and CSS units;
- bracketed constants and dynamic bindings;
- each default breakpoint category;
- optional and unknown breakpoint aliases;
- interaction with existing `class`, bound class, and style attributes;
- parent-direction or sibling-dependent behavior;
- malformed values and empty attributes;
- repeated execution and mixed converted/unresolved inputs.

Fixtures assert both the generated output and the structured result. Snapshot-only tests are insufficient: important classes, retained attributes, diagnostics, and exit behavior receive explicit assertions.

## Delivery sequence

The conversion engine is delivered in reviewable increments:

1. Compatibility inventory, analyzer result types, discovery, and preservation guarantees.
2. Exact breakpoint model and reporting.
3. Flex directive support for the CSS adapter.
4. Flex directive support for the Tailwind adapter.
5. Visibility and extended responsive inputs.
6. Grid directives.
7. CLI strict mode, dry-run, JSON reports, and upgrade documentation.

Each increment adds failing compatibility tests before implementation and leaves the repository in a releasable state.
