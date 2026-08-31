# Compatibility

Version 2 is prerelease software. Its current conversion coverage is deliberately narrow while the project replaces legacy best-effort behavior with a safety-first conversion pipeline.

The source contract and classification rules are documented in [Conversion safety model](architecture/conversion-safety.md).

## Status definitions

- **Limited**: unbound, non-responsive literal values are converted for the cases described below and covered by the compatibility corpus.
- **Planned**: the analyzer recognizes the input, but no target adapter converts it yet.
- **Preserved**: the input is intentionally left unchanged and reported for review.

No native CSS conversions are available yet. The CLI currently accepts only the `tailwind` target.

## Flex directives

| Directive       | Tailwind | Notes                                                                         |
| --------------- | -------- | ----------------------------------------------------------------------------- |
| `fxLayout`      | Limited  | Static row/column direction and wrap keywords without a breakpoint.           |
| `fxLayoutAlign` | Limited  | Static main-axis and cross-axis keywords without a breakpoint.                |
| `fxLayoutGap`   | Limited  | Static values without a breakpoint only.                                      |
| `fxFlex`        | Limited  | Static one-to-three-part values; unknown shorthands use an arbitrary utility. |
| `fxGrow`        | Planned  | Recognized and preserved.                                                     |
| `fxShrink`      | Planned  | Recognized and preserved.                                                     |
| `fxFlexAlign`   | Planned  | Recognized and preserved.                                                     |
| `fxFlexFill`    | Limited  | Static use without a breakpoint only.                                         |
| `fxFill`        | Planned  | Alias recognized and preserved.                                               |
| `fxFlexOffset`  | Limited  | Static values without a breakpoint only; parent direction affects semantics.  |
| `fxFlexOrder`   | Limited  | Static values without a breakpoint only.                                      |
| `fxShow`        | Planned  | Recognized and preserved.                                                     |
| `fxHide`        | Planned  | Recognized and preserved.                                                     |

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

The current safety gate preserves these cases for review:

- every Angular property binding, including bindings whose expression appears constant;
- every built-in responsive alias;
- orientation and print aliases;
- unknown aliases, because they may be registered as custom project breakpoints;
- every directive not implemented by the selected target adapter.

This is intentional. Angular Flex-Layout's `sm`, `md`, and other bounded aliases are not generally equivalent to Tailwind's mobile-first variants. Exact media-query support will be added before responsive attributes are converted.

## Reporting API

`FileMigrator#migrate()` and `FileMigrator#getResults()` return one structured result per recognized input processed in a file. Results use the statuses `converted`, `review`, `unsupported`, `invalid`, and `parse-error`. Review and unsupported results include a stable diagnostic code, reason, and suggested action.

The public CLI summary, strict exit codes, and JSON report described in the architecture document are planned and are not implemented in this increment.
