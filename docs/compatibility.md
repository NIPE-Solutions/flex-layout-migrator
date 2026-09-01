# Compatibility

Version 2 is prerelease software. Its current conversion coverage is deliberately narrow while the project replaces legacy best-effort behavior with a safety-first conversion pipeline.

The source contract and classification rules are documented in [Conversion safety model](architecture/conversion-safety.md).

## Status definitions

- **Limited**: unbound literal values are converted for the cases described below and covered by the compatibility corpus. Standard responsive viewport aliases are supported when their complete semantic family is safe.
- **Planned**: the analyzer recognizes the input, but no target adapter converts it yet.
- **Preserved**: the input is intentionally left unchanged and reported for review.

No native CSS conversions are available yet. The CLI currently accepts only the `tailwind` target, and generated classes target Tailwind CSS v4.

## Flex directives

| Directive       | Tailwind | Notes                                                                                                                       |
| --------------- | -------- | --------------------------------------------------------------------------------------------------------------------------- |
| `fxLayout`      | Limited  | Static directions plus wrap and inline modifiers; coupled unresolved gaps preserve the layout.                              |
| `fxLayoutAlign` | Limited  | Static main/cross axes with layout, content alignment, sizing, and border-box semantics.                                    |
| `fxLayoutGap`   | Limited  | Static nonnegative non-wrapping gaps; unitless values remain pixels. Grid, computed, negative, and wrapped gaps are review. |
| `fxFlex`        | Limited  | Static basis, keyword, and three-part forms with parent-axis min/max sizing.                                                |
| `fxGrow`        | Limited  | Converted atomically with a static `fxFlex`; standalone use is invalid.                                                     |
| `fxShrink`      | Limited  | Converted atomically with a static `fxFlex`; standalone use is invalid.                                                     |
| `fxFlexAlign`   | Limited  | Static `align-self` keywords.                                                                                               |
| `fxFlexFill`    | Limited  | Static full-size rule including its zero-margin behavior.                                                                   |
| `fxFill`        | Limited  | Non-responsive alias of `fxFlexFill`.                                                                                       |
| `fxFlexOffset`  | Limited  | Static values with a statically known parent axis; unitless values remain percentages.                                      |
| `fxFlexOrder`   | Limited  | Static integer values emitted independently of the Tailwind theme.                                                          |
| `fxShow`        | Planned  | Recognized and preserved.                                                                                                   |
| `fxHide`        | Planned  | Recognized and preserved.                                                                                                   |

All generated lengths that originate in the template use Tailwind arbitrary values. This prevents a project spacing scale from changing `fxLayoutGap="4"` from Angular Flex-Layout's `4px`, or `fxFlexOffset="4"` from its `4%` meaning.

The complete static semantic and diagnostic contract is documented in [Tailwind CSS v4 static conversion semantics](architecture/tailwind-v4-static-semantics.md).

If an existing recognized Tailwind utility controls the same CSS property as a generated class, the directive remains unchanged with a `class-conflict` review result. This avoids relying on HTML class order, which does not determine Tailwind's cascade order.

## Grid directives

All grid directives are recognized and preserved. Target conversion has not been implemented.

| Directive        | Tailwind |
| ---------------- | -------- |
| `gdAlignColumns` | Planned  |
| `gdAlignRows`    | Planned  |
| `gdArea`         | Planned  |
| `gdAreas`        | Planned  |
| `gdAuto`         | Planned  |
| `gdColumn`       | Planned  |
| `gdColumns`      | Planned  |
| `gdGap`          | Planned  |
| `gdGridAlign`    | Planned  |
| `gdRow`          | Planned  |
| `gdRows`         | Planned  |

## Extended responsive inputs

Responsive `class`, `ngClass`, `style`, `ngStyle`, and `imgSrc` inputs are recognized and preserved. Ordinary unsuffixed HTML and Angular `class` and `style` attributes are not treated as Flex-Layout inputs.

## Bindings and breakpoints

Literal responsive values using the standard Angular Flex-Layout viewport aliases are converted with their exact media-query range: `xs`, `sm`, `md`, `lg`, `xl`, `lt-sm`, `lt-md`, `lt-lg`, `lt-xl`, `gt-xs`, `gt-sm`, `gt-md`, and `gt-lg`. Generated Tailwind CSS v4 tokens use self-contained arbitrary media variants; for example, `fxFlexAlign.sm="center"` becomes `[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:self-center`.

Base values and disjoint responsive values may convert together. Overlapping responsive values convert only when they emit the same utility. A conflicting overlap preserves the entire directive family with `responsive-precedence-unverified`; an existing utility that controls the same property in an intersecting range preserves the family with `class-conflict`. See [Exact responsive breakpoint conversion](architecture/responsive-breakpoints.md) for the exact ranges, conflict rules, and diagnostic contract.

The current safety gate preserves these cases for review:

- every Angular property binding, including bindings whose expression appears constant;
- orientation and print aliases;
- unknown aliases, because they may be registered as custom project breakpoints;
- every directive not implemented by the selected target adapter.

This is intentional. Angular Flex-Layout's bounded and overlapping aliases are not equivalent to Tailwind's named mobile-first variants, so the codemod emits exact arbitrary media ranges rather than substituting `sm:`, `md:`, or another named Tailwind variant.

## Reporting API

`Migrator#migrate()` returns one immutable migration report for file and directory inputs. The report uses schema version `1`, contains path-sorted file results and a derived summary, and uses the statuses `converted`, `review`, `unsupported`, `invalid`, and `parse-error`. Unresolved results include a stable diagnostic code, reason, and suggested action.

Report paths use forward slashes and are relative to the input root. A single-file input uses its basename. Reports do not expose absolute checkout paths or internal analyzer fields.

The CLI prints a concise deterministic summary and one line per unresolved result. `--report <path>` atomically writes the same result as JSON, including during `--dry-run`; dry-run validates the complete edit plan in memory without writing templates or creating missing template-output directories.

Unresolved results are strict by default. Exit code `0` means the migration completed cleanly or unresolved work was accepted with `--allow-unresolved`; code `1` means configuration, parsing, template I/O, report writing, or an internal invariant failed; code `2` means the migration completed safely with unresolved `review`, `unsupported`, or `invalid` results in strict mode. `--allow-unresolved` changes only the final exit code and does not hide diagnostics or change migration output.
