# Angular Flex-Layout Codemod

Version 2 remains a prerelease. This beta migrates supported Angular Flex-Layout template attributes to Tailwind CSS v4 utilities. It uses the Angular compiler and source-range edits, preserving unrelated template text, comments, interpolation, control flow, and line endings.

## Why this exists

Angular Flex-Layout is archived. Replacing it safely requires more than substituting class names: responsive aliases, display restoration, existing classes, inline styles, and runtime bindings can change the result. This codemod converts only cases it can represent exactly and leaves the rest in place with diagnostics for review.

## Compatibility at a glance

Tailwind CSS v4 remains the default target. A native CSS target is available with `--target css --stylesheet <path>` for exactly eight Flex semantic families at base and the 13 standard viewport aliases. Grid, visibility, responsive class/style, orientation, print, and custom aliases remain preserved for CSS. Conversion is deliberately limited: dynamic bindings, ambiguous responsive precedence, unsafe class or style ownership, and unsupported directives are preserved for review.

The complete directive-by-directive status, including grid, image, breakpoint, and class/style boundaries, is in [docs/compatibility.md](docs/compatibility.md). Treat that reference as the beta’s compatibility contract.

## Quick start

Evaluate the published beta without installing it. This safely previews the migration and does not write templates:

```bash
npx @nipe-solutions/flex-layout-codemod@beta ./src
```

Read the terminal summary and diagnostics before applying any migration. A clean Git worktree makes the resulting template diff easy to inspect.

## Install for a team or CI

Install the beta as an exact development dependency. `--save-exact` records the prerelease resolved from the `beta` tag, so the package manifest and lockfile keep the team on that reviewed version:

```bash
npm install --save-dev --save-exact @nipe-solutions/flex-layout-codemod@beta
```

Use `npm ci` in CI to install the committed lockfile. The package exposes the `flex-layout-codemod` executable through the local npm binary path; no global installation is required.

## Preview, review, and apply

Preview the local dependency and write a JSON report for review:

```bash
npx flex-layout-codemod ./src --report ./reports/flex-layout.json
```

The command plans and validates without changing project templates or stylesheets by default. `--report` is intentional reporting output: the report is an explicit side effect and is written atomically in both plan and write modes, even though a plan does not create template-output directories.

If any template has a parse error, project application is skipped for the whole invocation. Terminal output labels the remaining edits as planned, and a requested JSON report includes `application: { "status": "skipped", "reason": "parse-errors" }`; neither output presents the planned template or stylesheet actions as applied writes.

After reviewing the report and committing or branching your work, apply the migration in place:

```bash
npx flex-layout-codemod ./src --target tailwind --write
```

`--write` explicitly applies the validated plan. Without it, `--output` names only the proposed destination. With it, omitting `--output` applies changed templates in place; add `--output ./migrated-src` to apply them elsewhere. Review the Git diff before accepting the changes. If an in-place run is unwanted, inspect `git diff` before taking further action, then restore only the intended files deliberately through your normal Git workflow from a clean worktree or committed branch.

### Native CSS companion stylesheet

Use the native CSS target when the documented Flex-only surface is appropriate:

```bash
npx flex-layout-codemod ./src --target css --stylesheet ./src/flex-layout-migration.css --write
```

The migration updates templates and the one named companion stylesheet as a transaction. It owns only the marked `flex-layout-codemod` block, preserves handwritten CSS surrounding that block, retains unmatched owned rules because the stylesheet may serve templates outside the selected invocation, and keeps shared rules deduplicated across files. The current CLI has no complete-project pruning mode. On ordinary failures or handled interruption it rolls the changed templates and stylesheet back together.

The stylesheet path may use any filename accepted as a regular file. If it ends in `.html` and is inside a folder input, that exact selected path is excluded from template discovery so reruns remain byte-idempotent. Stylesheet, template, and JSON-report destinations must remain physically distinct; existing file identity and conservative case/Unicode-normalized aliases for missing paths are checked before application and again before report replacement.

No filesystem workflow can promise durable rollback after abrupt process termination, power loss, or a storage failure. If the command reports unconfirmed recovery, stop and inspect the listed paths, reconcile them with Git or a verified backup, then rerun only after the project is consistent.

## Examples

This converted example is the same static layout and gap case exercised by the migration fixtures:

```html
<!-- input -->
<div fxLayout="column" fxLayoutGap="4"></div>

<!-- output -->
<div class="flex flex-col box-border gap-[4px]"></div>
```

Literal Grid containers and children use compiler-verified arbitrary properties when no exact built-in utility exists:

```html
<!-- input -->
<section gdColumns="12rem 1fr" gdGap="1rem"><div gdColumn="2"></div></section>

<!-- output -->
<section class="grid [grid-template-columns:12rem_1fr] [grid-gap:1rem]"><div class="[grid-column:2]"></div></section>
```

Orientation and print conversion require explicit source-configuration evidence. These flags assert settings you have already verified in the Angular application's Flex-Layout configuration; the codemod does not discover them:

```bash
# Source uses addOrientationBps: true and printWithBreakpoints: ['md', 'handset']
npx flex-layout-codemod ./src --orientation-breakpoints --print-with-breakpoints md,handset --write

# Source explicitly uses printWithBreakpoints: []
npx flex-layout-codemod ./src --print-with-breakpoints none --write
```

With orientation enabled, all nine archived aliases are available: `handset`, `handset.portrait`, `handset.landscape`, `tablet`, `tablet.portrait`, `tablet.landscape`, `web`, `web.portrait`, and `web.landscape`. Print conversion reproduces configured responsive fallback values, while an explicit `.print` value takes precedence.

Responsive image migration is a separate opt-in because introducing `<picture>` changes the image's parent and may affect CSS or test selectors. After reviewing that risk, enable literal standard-breakpoint sources with `--responsive-images`:

```bash
npx flex-layout-codemod ./src --responsive-images --report ./reports/flex-layout.json --write
```

```html
<!-- input -->
<img src="hero.png" src.lt-sm="hero-mobile.png" alt="Hero" />

<!-- output -->
<picture
  ><source media="screen and (max-width: 599.98px)" srcset="hero-mobile.png" />
  <img src="hero.png" alt="Hero"
/></picture>
```

Only literal values using the 13 standard viewport aliases convert. Dynamic values, orientation, print, custom aliases, ambiguous URLs, structural directives on the image, and images already inside `<picture>` remain unchanged. Use the JSON report's file paths and source offsets to review every converted `imgSrc` occurrence and check selectors that assume the `<img>` has its former parent. Interactive file navigation is deferred to the CLI upgrade.

This fixture is intentionally preserved because the value is a runtime Angular expression. The report records a `dynamic-binding` review diagnostic and the source remains unchanged:

```html
<div [fxFlex]="basis"></div>
```

## Reports and exit codes

Reports use JSON schema version `2` and include required `mode` and `application` fields alongside per-file results, diagnostics, and a summary. `mode` records whether `plan` or `write` was requested. `application` records whether project changes were `applied` or were `skipped` because the run was plan-only or parsing failed. File `changed` values and stylesheet actions always describe proposed destination differences; consult `application` to determine whether those proposals reached the project.

Schema 2 removes the schema-1 `dryRun` field. Existing scripts that relied on implicit writes must add `--write`. Existing preview scripts must remove `--dry-run`, because planning is now the default and the obsolete option is rejected. Report consumers must replace `dryRun` checks with `mode` plus the required `application` state.

The default exit policy is strict:

| Code | Meaning                                                                                                    |
| ---: | ---------------------------------------------------------------------------------------------------------- |
|  `0` | Planning or application completed cleanly, or unresolved work was accepted with `--allow-unresolved`.      |
|  `1` | Configuration, parsing, project I/O, transaction, report writing, or an internal invariant failed.         |
|  `2` | Planning or application completed safely, but `review`, `unsupported`, or `invalid` results remain strict. |

For an informational CI report that accepts unresolved work while retaining every diagnostic, use:

```bash
npx flex-layout-codemod ./src --report ./reports/flex-layout.json --allow-unresolved
```

`--allow-unresolved` changes only the final exit code; it does not hide diagnostics or alter the migration output.

## Known boundaries

Tailwind CSS v4 remains the default target. A native CSS target is available with `--target css --stylesheet <path>` for exactly eight Flex semantic families at base and the 13 standard viewport aliases. Grid, visibility, responsive class/style, orientation, print, and custom aliases remain preserved for CSS. Responsive `imgSrc` remains an independent opt-in native `<picture>` migration. See [docs/compatibility.md](docs/compatibility.md) for exact supported forms and diagnostic codes before planning a large migration.

The CSS target does not inspect project styles, Tailwind configuration, Sass, or Less; it updates only its one owned companion block. Dynamic Angular bindings are not evaluated.

## Contributing and support

The repository requires Node.js 24 and npm 11.

```bash
npm ci
npm run verify
```

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Security reports belong in [GitHub private vulnerability reporting](https://github.com/NIPE-Solutions/flex-layout-migrator/security/advisories/new); other support routes are listed in [docs/SUPPORT.md](docs/SUPPORT.md). Maintainers should follow the reviewed [release process](docs/architecture/release-process.md).

## License

MIT
