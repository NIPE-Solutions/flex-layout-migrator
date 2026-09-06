---
path: /docs/configuration
title: Target configuration
description: Declare the Tailwind v4 environment, source breakpoint semantics, and safe configuration precedence.
group: targets
order: 4
---

# Target configuration

## Migrate into your Tailwind setup

Point the codemod at your Tailwind v4 stylesheet or provide an explicit migration profile. Prefixes and responsive mappings are generated against the target environment instead of assumed defaults.

## Plan against a stylesheet

```bash
npx flex-layout-codemod ./src --target tailwind --tailwind-stylesheet ./src/styles.css --plan --report migration-report.json
```

Planning remains the default. `--plan` makes it explicit. Review the target environment, assumptions, diagnostics, and proposed changes before rerunning with `--write`. `--plan` and `--write` cannot be combined. Reports include the resolved profile and its deterministic fingerprint.

## Declarative configuration

The CLI reads `flex-layout-migrator.config.json` in the current working directory, or a JSON file selected with `--config`. It does not search parent directories or guess among project stylesheets. Run from the project root. An explicit stylesheet is preferred; multiple application entrypoints require you to select the relevant environment.

```json
{
  "target": "tailwind",
  "tailwind": {
    "version": 4,
    "stylesheet": "./src/styles.css",
    "prefix": "tw",
    "breakpoints": {
      "tablet": "48rem",
      "desktop": "960px"
    },
    "important": "normal"
  },
  "source": {
    "flexLayout": {
      "breakpoints": {
        "narrow": {
          "mediaQuery": "screen and (max-width: 599px)",
          "priority": 1100
        }
      }
    }
  }
}
```

Stylesheet paths inside the profile are relative to the JSON file. CLI stylesheet paths are relative to the working directory. Unknown JSON keys and invalid values are rejected. No executable configuration format is supported.

## Resolution precedence

CLI overrides take precedence over the migration profile, then statically analyzed CSS, then Tailwind v4 defaults. Use `--tailwind-prefix tw` to override a prefix, or `--tailwind-prefix ''` to explicitly select no prefix. A conflicting declaration remains visible as `tailwind-prefix-conflict` and requires review; fix the disagreement before writing an affected proposal.

Each setting records its value, origin, and confidence: explicit, detected, defaulted, or unknown. Configuration confidence is separate from the safety of each directive conversion. Profile diagnostics participate in the existing unresolved exit policy. `--allow-unresolved` changes the exit status; it does not make an unsafe directive eligible for conversion.

## Narrow CSS analysis

Supported imports include `tailwindcss`, `tailwindcss/theme.css`, and `tailwindcss/utilities.css`. The analyzer reads `prefix(...)`, utilities `important`, and top-level `@theme` breakpoint declarations. It does not evaluate colors, fonts, animation, arbitrary theme expressions, custom variants, or a general CSS cascade.

```css
@import 'tailwindcss' prefix(tw);
@import './theme.css';
@theme {
  --breakpoint-*: initial;
  --breakpoint-tablet: 48rem;
  --breakpoint-desktop: 960px;
  --breakpoint-2xl: initial;
}
```

Namespace reset (`--breakpoint-*: initial`) and global theme reset (`--*: initial`) remove inherited breakpoint defaults in declaration order; individual `initial` values remove a breakpoint. In JSON, `"*": null` resets the namespace and `null` removes an individual breakpoint. Values accept nonnegative finite `px`, `rem`, or `em` lengths. Mixed units produce a warning; the codemod never assumes a root font size to convert them.

Local relative CSS imports are visited in declaration order. They must resolve inside the current project root, including after symlink resolution. Cycles, missing files, conditional imports, remote URLs, package imports other than the recognized Tailwind layers, and excessive import depth produce unresolved diagnostics. Analysis is bounded to 16 import levels, 128 import visits, and 2 MB per file. The codemod never fetches remote CSS.

## Prefix syntax and existing classes

Tailwind v4 prefixes are leading variants. The supported compiler accepts lowercase letters for a prefix. `tw:flex`, `tw:hover:gap-[13px]!`, and `tw:[@media_print]:hidden` place the prefix first. Every generated utility is serialized through the same profile boundary, including grid, visibility, arbitrary values, and responsive classes.

Existing `tw:flex` and `tw:flex-row` remain intact. An existing `tw:flex-col` conflicts with `fxLayout="row"`; the directive is preserved for review. Utility identity is normalized for semantic comparison while original source tokens are retained.

## Responsive mapping

Alias names are not treated as semantic matches. Flex Layout `md` is screen width 960–1279.98px; Tailwind's default `md` starts at 48rem with no upper bound. The codemod preserves the exact source range:

```html
<div class="tw:[@media_screen_and_(min-width:_960px)_and_(max-width:_1279.98px)]:flex-col"></div>
```

For a target `desktop: 960px`, a source minimum of 960px can use `tw:[@media_screen]:desktop:flex-col`. The screen restriction is necessary because Tailwind's named variants alone apply to all media. Bounded source ranges are not rewritten as exclusive `max-*` variants: `<1280px` is not exactly `<=1279.98px`.

Named Tailwind variants are used only when their media semantics match. Otherwise the codemod keeps the exact range. Generated patterns are tested with the pinned Tailwind 4.3.3 compiler. The CLI does not invoke the target project's compiler; run your application build and visual checks after review.

## Custom source breakpoints

Source aliases require actual Flex Layout media semantics, not target breakpoint names. Explicit source profiles support `screen and` conditions combining pixel minimum, pixel maximum, and orientation, plus an integer Flex Layout priority. Copy the actual priority from the source application's breakpoint configuration. Do not invent one. Unknown aliases retain the existing `custom-breakpoint` diagnostic and their original directives.

The shared planner reasons about responsive families and preserves uncertain overlapping precedence. This is not a guarantee that every custom breakpoint combination can be migrated automatically. Native CSS uses the same declared source definitions for its supported directive families.

## Legacy JavaScript configuration and security

Tailwind v4 is CSS-first. Legacy `@config` and `@plugin` can refer to executable JavaScript, so the codemod detects them without loading them. It reports unresolved configuration and preserves affected directives by default. After independently reviewing those files, a profile can explicitly declare `prefix`, `important`, and `coreUtilities: "standard"` to assert that legacy code does not redefine core utility behavior. This declaration is recorded as an assumption, not compiler verification. Supplying a prefix alone is insufficient. Breakpoints from unresolved imports remain unknown unless explicitly supplied. Custom `@utility` and `@custom-variant` rules are not evaluated and require manual review. It never installs the legacy application's dependencies or builds its source Angular application to analyze templates.

Unresolved prefix or import configuration can prevent safe conversion. Custom application CSS is not globally analyzed. Source discovery directives are not interpreted as mappings; `source(none)` and explicit exclusions produce warnings so you can confirm the generated template classes are included in your build.

The supplied JSON and CSS files are read-only inputs. Content changes detected between configuration resolution and transaction application invalidate the write. The profile fingerprint excludes machine-specific absolute paths. JSON reports are evidence, not executable saved plans; rerun planning after any input or configuration change.

## Browser preview

The playground accepts a prefix, breakpoint pairs, and pasted target CSS. Pasted CSS stays in memory, with no upload or network import fetching. It extracts migration-relevant settings from that stylesheet, not an entire project. CLI-only local imports require explicit values in the browser.

Browser preview uses the same parser, analyzer, planner, renderer, and generated-template validation boundary as the CLI. Invalid generated Angular proposals are rejected and original source is displayed. Filesystem transactions, rollback, project-wide validation, and CI/report orchestration remain CLI-only.

## Enterprise review recipe

1. Identify custom source Flex Layout breakpoints and their priorities.
2. Select the target stylesheet and generate a plan with a JSON report.
3. Review resolved configuration, assumptions, and unresolved directives.
4. Compare proposed output and rerun with `--write` under your review policy.
5. Run application unit/component tests, screenshots or Storybook, E2E, and responsive visual review.
6. Remove the Flex Layout dependency only after all relevant usages are gone and application validation passes. This codemod does not remove it automatically.

## Target diagnostic codes

- `tailwind-prefix-conflict`: competing prefix declarations; resolve the disagreement.
- `tailwind-config-external` and `tailwind-plugin-external`: executable configuration was detected and not executed.
- `tailwind-breakpoint-unknown`: an unsupported breakpoint value was excluded from named variant selection.
- `tailwind-mixed-breakpoint-units`: responsive ordering cannot be assumed across mixed units.
- `tailwind-target-unknown`: missing utility generation, conditional CSS, or unsupported target semantics.
- `tailwind-import-unresolved`: a local, remote, conditional, cyclic, or unsafe import could not be resolved.
- `tailwind-source-excluded`: explicit source discovery settings need review.

Directive diagnostics retain the established `context-unverified` and `custom-breakpoint` codes. Target diagnostics live on the resolved profile, separately from directive results. The profile uses tested Tailwind 4.3.3 semantics; other v4 releases require their own application build verification. No Tailwind v3 upgrade is performed.

The implementation follows the official [Tailwind theme](https://tailwindcss.com/docs/theme) and [utility prefix documentation](https://tailwindcss.com/docs/styling-with-utility-classes). Compiler tests are the authority for emitted candidates.
