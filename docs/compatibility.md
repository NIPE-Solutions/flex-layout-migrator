# Compatibility

Version 2 is prerelease software. Its current conversion coverage is deliberately narrow while the project replaces legacy best-effort behavior with a safety-first conversion pipeline.

The source contract and classification rules are documented in [Conversion safety model](architecture/conversion-safety.md).

## Current compatibility status

- **Limited**: available now for the literal, safety-proven cases described below. Standard responsive viewport aliases convert only when their complete semantic family is safe.
- **Preserved**: recognized input intentionally left unchanged and reported for review.
- **Planned**: recognized input for which that target has no conversion available now.
- **Not applicable**: the directive does not have a conversion in that target category.

The Tailwind CSS 4 column identifies the default target behavior. Native CSS is available for the limited Flex-only surface in this table: eight semantic families, at base and the 13 standard viewport aliases. The CLI defaults to `tailwind`; use `--target css --stylesheet <path>` to plan one owned companion stylesheet and add `--write` to apply it with the template changes. Responsive images remain independent of either layout target.

<!-- compatibility-inventory:start -->

| Directive        | Family      | Tailwind CSS 4 | Native CSS     | Responsive image |
| ---------------- | ----------- | -------------- | -------------- | ---------------- |
| `fxLayout`       | Flex        | Limited        | Limited        | Not applicable   |
| `fxLayoutAlign`  | Flex        | Limited        | Limited        | Not applicable   |
| `fxLayoutGap`    | Flex        | Limited        | Limited        | Not applicable   |
| `fxFlex`         | Flex        | Limited        | Limited        | Not applicable   |
| `fxGrow`         | Flex        | Limited        | Limited        | Not applicable   |
| `fxShrink`       | Flex        | Limited        | Limited        | Not applicable   |
| `fxFlexAlign`    | Flex        | Limited        | Limited        | Not applicable   |
| `fxFlexFill`     | Flex        | Limited        | Limited        | Not applicable   |
| `fxFill`         | Flex        | Limited        | Limited        | Not applicable   |
| `fxFlexOffset`   | Flex        | Limited        | Limited        | Not applicable   |
| `fxFlexOrder`    | Flex        | Limited        | Limited        | Not applicable   |
| `fxShow`         | Visibility  | Limited        | Preserved      | Not applicable   |
| `fxHide`         | Visibility  | Limited        | Preserved      | Not applicable   |
| `gdAlignColumns` | Grid        | Limited        | Preserved      | Not applicable   |
| `gdAlignRows`    | Grid        | Limited        | Preserved      | Not applicable   |
| `gdArea`         | Grid        | Limited        | Preserved      | Not applicable   |
| `gdAreas`        | Grid        | Limited        | Preserved      | Not applicable   |
| `gdAuto`         | Grid        | Limited        | Preserved      | Not applicable   |
| `gdColumn`       | Grid        | Limited        | Preserved      | Not applicable   |
| `gdColumns`      | Grid        | Limited        | Preserved      | Not applicable   |
| `gdGap`          | Grid        | Limited        | Preserved      | Not applicable   |
| `gdGridAlign`    | Grid        | Limited        | Preserved      | Not applicable   |
| `gdInline`       | Grid        | Limited        | Preserved      | Not applicable   |
| `gdRow`          | Grid        | Limited        | Preserved      | Not applicable   |
| `gdRows`         | Grid        | Limited        | Preserved      | Not applicable   |
| `class`          | Class/style | Preserved      | Preserved      | Not applicable   |
| `ngClass`        | Class/style | Limited        | Preserved      | Not applicable   |
| `style`          | Class/style | Preserved      | Preserved      | Not applicable   |
| `ngStyle`        | Class/style | Limited        | Preserved      | Not applicable   |
| `imgSrc`         | Image       | Not applicable | Not applicable | Limited          |

<!-- compatibility-inventory:end -->

## Current native CSS safety boundaries

The native CSS target is intentionally Limited. It converts exactly these eight Flex semantic families: layout (`fxLayout`), layout alignment (`fxLayoutAlign`), layout gap (`fxLayoutGap`), flex item sizing (`fxFlex` with its atomic `fxGrow` and `fxShrink` members), flex alignment (`fxFlexAlign`), flex fill (`fxFlexFill` and `fxFill`), flex offset (`fxFlexOffset`), and flex order (`fxFlexOrder`). Literal base inputs and the 13 standard viewport aliases are supported.

Grid, visibility, responsive `class`/`style` inputs, orientation, print, and custom aliases remain preserved for CSS with diagnostics. Responsive images remain an independent `--responsive-images` migration and do not become CSS-target behavior.

Use `--target css --stylesheet <path>` to plan template and companion-stylesheet changes, then add `--write` to apply them. The stylesheet keeps handwritten bytes outside the owned `flex-layout-codemod` block, deduplicates shared rules across every proposed template, and retains unmatched owned rules because a scoped invocation cannot prove that it includes every template served by the stylesheet. The current CLI exposes no complete-project pruning mode. The template and stylesheet writes use one recoverable transaction: ordinary failure or handled interruption rolls both outputs back together.

Every command plans and preflights the complete migration without changing project files by default. `--write` explicitly authorizes the existing template-and-stylesheet transaction. A power loss, forced process termination, or storage failure can leave recovery unconfirmed; when the command reports that condition, inspect the listed paths and reconcile them against Git or a verified backup before retrying. This is recovery guidance, not a claim of crash durability.

## Current Tailwind CSS 4 safety boundaries

### Available now: directive-specific boundaries

- `fxLayout`: Static directions plus wrap and inline modifiers; coupled unresolved gaps preserve the layout.
- `fxLayoutAlign`: Static main/cross axes with layout, content alignment, sizing, and border-box semantics.
- `fxLayoutGap`: Static nonnegative non-wrapping gaps; unitless values remain pixels. Grid, computed, negative, and wrapped gaps are review.
- `fxFlex`: Static basis, keyword, and three-part forms with parent-axis min/max sizing.
- `fxGrow` and `fxShrink`: Converted atomically with a static `fxFlex`; standalone use is invalid.
- `fxFlexAlign`: Static `align-self` keywords.
- `fxFlexFill`: Static full-size rule including its zero-margin behavior.
- `fxFill`: Non-responsive alias of `fxFlexFill`.
- `fxFlexOffset`: Static values with a statically known parent axis; unitless values remain percentages.
- `fxFlexOrder`: Static integer values emitted independently of the Tailwind theme.
- `fxShow`: Literal base and configured viewport, orientation, or print states convert when display restoration and the complete visibility family are safe.
- `fxHide`: Literal base and configured responsive states convert with `fxShow`; hiding emits exact base or responsive `hidden` utilities.
- `gdAlignColumns`, `gdAlignRows`, `gdArea`, `gdAreas`, `gdAuto`, `gdColumn`, `gdColumns`, `gdGap`, `gdGridAlign`, `gdInline`, `gdRow`, and `gdRows`: Literal values convert when compiler output, display composition, context, and ownership are exact.

All generated lengths that originate in the template use Tailwind arbitrary values. This prevents a project spacing scale from changing `fxLayoutGap="4"` from Angular Flex-Layout's `4px`, or `fxFlexOffset="4"` from its `4%` meaning.

The complete static semantic and diagnostic contract is documented in [Tailwind CSS v4 static conversion semantics](architecture/tailwind-v4-static-semantics.md).

If an existing recognized Tailwind utility conflicts with a generated class in an intersecting activation range, the directive remains unchanged with a `class-conflict` review result. Exact descriptors include all stable declarations emitted by pinned Tailwind, including arbitrary text inference, directional border style/width pairs, named shadow colors, and nested `@supports` assignments. A pinned built-in whose complete property set is not modeled is an unknown authority and conservatively conflicts instead of disappearing from the ownership check. Ordinary application classes without a recognized Tailwind root remain additive. This avoids relying on HTML class order, which does not determine Tailwind's cascade order. Visibility restoration sources and the compatible `hidden` cases described below are deliberate exceptions.

## Visibility semantics

`fxShow` and `fxHide` are currently converted together as one atomic visibility family per element. Literal values use Angular Flex-Layout's coercion and inversion rules. Additional visibility behavior that cannot meet these current safety conditions remains preserved for review:

| Input            | Resulting state |
| ---------------- | --------------- |
| `fxShow`         | shown           |
| `fxShow=""`      | shown           |
| `fxShow="false"` | hidden          |
| other literals   | shown           |
| `fxHide`         | hidden          |
| `fxHide=""`      | hidden          |
| `fxHide="false"` | shown           |
| other literals   | hidden          |

The literal string `"0"` is truthy. Property-bound zero remains dynamic because the codemod does not evaluate Angular expressions.

Literal semantics use the Angular compiler's decoded attribute value. HTML character references therefore behave exactly like their decoded spelling, while source edits retain the original raw spelling of existing class evidence.

Base and responsive hiding emits `hidden` under the exact activation range. An all-shown family is a safe no-op: the visibility attributes are removed without generating a class. Disjoint responsive states and identical overlapping states may convert together. Conflicting base states or conflicting overlapping responsive states preserve the whole family with `responsive-precedence-unverified`, independent of attribute order.

A shown override after base hiding converts only when its restoration display is proven by a safely converted `fxLayout` or one unambiguous, unmodified base Tailwind display utility. Otherwise the family is preserved with `display-restoration-unverified`. Literal or bound display styles always block conversion; literal declaration lists are parsed conservatively, including comments, CSS escapes, and decoded character references. Bound class inputs block generated visibility classes with `bound-class`, while an all-shown no-op may still be removed beside a bound class. An existing `hidden` utility is compatible only when every effective state is hidden; conflicting, multiple, important, or variant-prefixed display utilities do not provide safe restoration evidence.

When layout and visibility both control `display`, the planner composes them before editing. Visibility owns hidden ranges, covered `flex` or `inline-flex` layout utilities are suppressed, and non-display layout utilities remain. A responsive layout display that only partially overlaps hiding is preserved with the visibility family when generated CSS cannot prove safe ownership. Exact, disjoint, fully covered, and base-layout cases retain their proven conversions. If one family is needed to prove the other, unresolved state closes across both families. See [Exact visibility conversion semantics](architecture/visibility-semantics.md) for the complete composition and diagnostic contract.

## Grid directives

Grid container and child directives convert for literal base values, the 13 standard viewport aliases, and explicitly configured orientation and print aliases when their complete declaration, display, parent context, and existing ownership are safe. Container directives share one `grid` or `inline-grid` display state; `gdInline` is composed with that state. Bound values, unconfigured or custom breakpoints, unsafe parent context, and compiler-unverified values remain unchanged with diagnostics.

## Responsive class and style inputs

- literal `ngClass.<alias>`: Converts complete families whose class tokens are proven Tailwind CSS v4 candidates.
- literal `ngStyle.<alias>`: Converts complete, sanitizer-safe declaration lists with exact CSS ownership.
- deprecated `class.<alias>` and `style.<alias>`: Version-dependent replacement and merge behavior is not inferred.
- responsive `imgSrc`: Opt-in literal standard aliases convert to picture markup when URL, fallback, and structural context are safe.

## Responsive images

`--responsive-images` includes eligible literal `src.<alias>` inputs in the plan; `--responsive-images --write` applies ordered native `<picture>` sources. The opt-in acknowledges that wrapping an `<img>` can affect parent/child CSS and application test selectors. The original fallback `<img>` retains its literal `src`, bound `[src]`, accessibility, loading, sizing, event, reference, class, style, and other unrelated attributes.

Conversion is limited to the 13 standard viewport aliases and one descriptor-free literal URL per responsive source. Dynamic or interpolated values, empty values, orientation, print, custom aliases, conflicting source ownership, structural directives on the image, and existing `<picture>` ancestry remain unchanged with diagnostics. The complete generated template must reparse before any file is written.

JSON reports use schema version `2` and identify converted and preserved `imgSrc` occurrences by file and source offset. Review every converted image for selectors that assumed the `<img>` had its former parent. Interactive file navigation and a post-run checklist belong to the later CLI upgrade.

The always-supported aliases are `xs`, `sm`, `md`, `lg`, `xl`, `lt-sm`, `lt-md`, `lt-lg`, `lt-xl`, `gt-xs`, `gt-sm`, `gt-md`, and `gt-lg`. Each emitted class contains the exact Angular Flex-Layout media range rather than a project-defined Tailwind breakpoint. Explicit configuration additionally enables orientation and print as described below.

```html
<!-- input -->
<div ngClass.sm="flex items-center"></div>
<div ngStyle.lt-md="font-size.px: 14; color: #334155"></div>

<!-- output -->
<div
  class="[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:flex [@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:items-center"
></div>
<div
  class="[@media_screen_and_(max-width:_959.98px)]:[font-size:14px] [@media_screen_and_(max-width:_959.98px)]:[color:#334155]"
></div>
```

Responsive class strings use Angular 15 `NgClass` tokenization (`/\s+/`), including non-breaking and other ECMAScript whitespace. Values may contain utilities from the supported built-in Tailwind v4 surface, explicitly registered same-element variants, negative or important utilities, supported arbitrary values, and arbitrary properties. Every token must be proven without reading project configuration, must have a complete stable CSS-property descriptor, must retain the host element as its CSS target, and must survive raw HTML source emission byte-for-byte because Tailwind scans source before HTML entity decoding. Pseudo-element, group/peer, descendant, and arbitrary selector or at-rule variants remain unverified until selector ownership is modeled. Untyped arbitrary text sizes are limited to numeric CSS length or percentage forms; bare numbers, named colors, unknown units, and complex inferred forms remain unverified. Arbitrary border widths are limited to numeric or known-length forms, while only explicit, hash, color-function, or CSS-variable color forms are admitted. Bracketed arbitrary shadow values remain unverified; built-in shadow sizes and the CSS-variable shorthand remain supported. Non-integer fraction syntax, application classes, plugin utilities, custom-theme-dependent candidates, quotes, and ampersand sequences that could become HTML character references are also preserved. One unverified token preserves the atomic family with `tailwind-candidate-unverified` on the originating occurrence.

Responsive style raw strings follow Flex-Layout's final transform exactly: every semicolon splits an entry, the first colon separates its key, quote characters are removed, and a later duplicate exact key replaces its value without moving that key's first application position. Exact duplicate spelling remains representable. Any distinct exact ordinary keys that Angular applies to the same CSS property anywhere in one responsive family are preserved, however, because `NgStyle` differ removals can make their browser result depend on prior activation history. This includes casing differences and unit-suffix aliases such as `font-size` versus `font-size.px`; CSS custom properties remain case-sensitive. Ordinary and custom properties, transformed literal functions, CSS variables, and the exact unit suffixes `px`, `%`, `em`, `rem`, `vw`, `vh`, `vmin`, `vmax`, `deg`, `s`, and `ms` can otherwise be emitted as Tailwind arbitrary-property utilities. URL-bearing values, sanitizer-sensitive or Tailwind build-time functions, interpolation, ambiguous semicolon splits, unsupported renderer property spellings or units, shorthand/longhand overlap, exact-key aliases, raw-source-unsafe tokens, and declaration `!important` text are preserved with `style-value-unverified`.

The complete class or style family is planned atomically. Disjoint ranges and identical overlaps can convert; conflicting overlaps remain unchanged with `responsive-precedence-unverified`. Existing utilities and inline fallback styles are checked against every modeled CSS property emitted by a utility, including line height from text-size utilities, logical and physical border ownership, shadow color versus shadow geometry, internal custom properties from transforms, and multi-property accessibility utilities. Recognized but unmodeled pinned utilities provide unknown authority and therefore preserve rather than under-report. An intersecting class conflict or an inline fallback declaration for the same property preserves the family. A responsive `ngStyle` declaration retains inline-writer precedence over an overlapping normal `ngClass` utility only when it covers every property that would be removed.

Display-producing class and style values are composed with responsive layout and visibility before edits are created. Hidden visibility can own an exactly covered normal display candidate. Partial overlaps, important ownership, unresolved display authorities, and an implicit shown base that cannot be restored exactly preserve the related families.

The following inputs are always preserved:

- property, two-way, and `bind-` forms, even when an expression appears constant;
- interpolated values;
- unconfigured orientation or print aliases, custom aliases, and empty breakpoint suffixes;
- deprecated `class.<alias>` and `style.<alias>` selectors;
- project-specific classes, plugin utilities, and candidates whose meaning depends on custom Tailwind theme values;
- style values that cannot be encoded with equivalent sanitized CSS semantics;
- complete families with precedence, existing-class, inline-style, layout, or visibility ownership that cannot be proven safe.

Ordinary unsuffixed HTML and Angular `class`, `ngClass`, `style`, and `ngStyle` inputs are not reported as responsive source occurrences, but they are authoritative when responsive siblings exist. Static `class` remains additive and static `style` remains an inline fallback. Unsuffixed `ngClass` and `ngStyle` are replaceable base values: bound forms preserve the complete responsive family, as do non-empty literal values that cannot safely remain active. An empty literal fallback is compatible. An exactly identical literal `ngClass` fallback can make isolated redundant responsive attributes removable, but its retained base tokens still participate in class/style/layout/visibility ownership and preserve every coupled family when they cannot be suppressed safely. Non-empty raw-string `ngStyle` fallbacks remain unchanged because standalone conversion of that Flex-Layout extension is outside this mode.

The Tailwind target does not edit CSS, Sass, Less, or Tailwind configuration and does not generate a companion stylesheet. The native CSS target updates only its own marked block; a future project-aware mode may inspect application styles and emit companion styles for application classes.

## Bindings and breakpoints

Literal responsive values using the standard Angular Flex-Layout viewport aliases are converted with their exact media-query range: `xs`, `sm`, `md`, `lg`, `xl`, `lt-sm`, `lt-md`, `lt-lg`, `lt-xl`, `gt-xs`, `gt-sm`, `gt-md`, and `gt-lg`. Generated Tailwind CSS v4 tokens use self-contained arbitrary media variants; for example, `fxFlexAlign.sm="center"` becomes `[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:self-center`.

Base values and disjoint responsive values may convert together. Overlapping responsive values convert only when they emit the same utility. A conflicting overlap preserves the entire directive family with `responsive-precedence-unverified`; an existing utility that controls the same property in an intersecting range preserves the family with `class-conflict`. See [Exact responsive breakpoint conversion](architecture/responsive-breakpoints.md) for the exact ranges, conflict rules, and diagnostic contract.

### Project-aware orientation and print

Orientation and print conversion require explicit source-configuration evidence. `--orientation-breakpoints` confirms the source application uses the archived `addOrientationBps: true` definitions. It enables `handset`, `handset.portrait`, `handset.landscape`, `tablet`, `tablet.portrait`, `tablet.landscape`, `web`, `web.portrait`, and `web.landscape` with their exact width-and-orientation conditions. Composite aliases emit separate portrait and landscape media variants; conflicting overlaps remain atomic and preserved.

`--print-with-breakpoints <aliases>` confirms the source application's `printWithBreakpoints` value. Supply a comma-separated list such as `md,handset`, or use `none` to assert an empty list. The list accepts standard aliases and orientation aliases enabled in the same invocation. During print, configured responsive values become print fallbacks even though their screen queries do not match; an explicit `.print` value wins. Duplicate, unknown, `print`, empty, or disabled-orientation entries are configuration errors before migration.

Omitting either flag preserves the corresponding aliases with `breakpoint-unverified`. The flags are assertions, not discovery: verify the application's Flex-Layout provider configuration before using them. See [Tailwind orientation and print migration](architecture/tailwind-orientation-print-migration.md) for the exact definitions and planner contract.

The current safety gate preserves these cases for review:

- every Angular property binding, including bindings whose expression appears constant;
- orientation and print aliases without their corresponding explicit configuration;
- unknown aliases, because they may be registered as custom project breakpoints;
- visibility whose shown state needs a display value that cannot be proven from template and layout semantics;
- visibility on an element whose literal or bound style may control `display`;
- generated visibility output beside an unresolved responsive class or style authority;
- partially overlapping responsive layout and hidden ranges without proven display ownership;
- generated visibility output that cannot be merged safely with bound classes or existing display utilities;
- every directive not implemented by the selected target adapter.

This is intentional. Angular Flex-Layout's bounded and overlapping aliases are not equivalent to Tailwind's named mobile-first variants, so the codemod emits exact arbitrary media ranges rather than substituting `sm:`, `md:`, or another named Tailwind variant.

## Reporting API

`Migrator#migrate()` returns one immutable migration report for file and directory inputs. The report uses schema version `2`, contains path-sorted file results and a derived summary, and uses the statuses `converted`, `review`, `unsupported`, `invalid`, and `parse-error`. Every report includes `mode: "plan" | "write"` and a required `application` outcome: `applied`, `skipped: plan-only`, or `skipped: parse-errors`. The previous report contract used schema version `1`; schema 2 removes its `dryRun` field. File `changed` values and stylesheet actions always describe the validated proposal; consumers use `application` to determine whether it reached the project.

Every non-parse result represents one directive occurrence. To measure responsive class and style conversion, filter results whose `directive` is `ngClass`, `ngStyle`, `class`, or `style`, then count `converted` versus all preserved statuses. The extended compatibility fixture currently asserts 41 converted and 37 preserved report results, while also checking every standard alias, exact diagnostics, fallback replacement, raw-string transformation, ECMAScript-whitespace tokenization, raw-source Tailwind discovery, complete CSS ownership, byte-for-byte output, and a zero-edit second run. Every decoded class candidate in its expected output is compared with one raw Tailwind CSS v4 CLI scan of the exact emitted class bytes. A separate compatibility test checks source-order independence within multi-state class and style families. Empty breakpoint suffixes remain unchanged but are not responsive selectors and therefore do not create report results. These figures describe this test corpus only; repository measurements depend on the inputs scanned and do not establish project-level semantic coverage.

Report paths use forward slashes and are relative to the input root. A single-file input uses its basename. Reports do not expose absolute checkout paths or internal analyzer fields.

The CLI prints a concise deterministic summary and one line per unresolved result. Plan mode and write mode skipped by parse errors use prospective file and stylesheet wording; successful write mode uses completed wording. `--report <path>` atomically writes the same result as JSON in either mode and is the only intentional plan-mode filesystem side effect. A plan never writes templates or stylesheets and does not create missing template-output directories.

Unresolved results are strict in both modes. Exit code `0` means planning or application completed cleanly, or unresolved work was accepted with `--allow-unresolved`; code `1` means configuration, parsing, project I/O, transaction, report writing, or an internal invariant failed; code `2` means planning or application completed safely with unresolved `review`, `unsupported`, or `invalid` results in strict mode. `--allow-unresolved` changes only the final exit code and does not hide diagnostics or change migration output.

Existing scripts that relied on implicit writes must add `--write`. Existing preview scripts must remove `--dry-run`, because planning is now the default and the obsolete option is rejected. Schema-1 consumers must replace `dryRun` checks with the schema-2 `mode` and required `application` fields.
