# Angular Flex-Layout Codemod

Version 2 remains a prerelease. This beta migrates supported Angular Flex-Layout template attributes to Tailwind CSS v4 utilities. It uses the Angular compiler and source-range edits, preserving unrelated template text, comments, interpolation, control flow, and line endings.

## Why this exists

Angular Flex-Layout is archived. Replacing it safely requires more than substituting class names: responsive aliases, display restoration, existing classes, inline styles, and runtime bindings can change the result. This codemod converts only cases it can represent exactly and leaves the rest in place with diagnostics for review.

## Compatibility at a glance

The current target is Tailwind CSS v4. It converts supported static Flex-Layout inputs and literal responsive inputs using the standard viewport aliases. Conversion is deliberately limited: dynamic bindings, ambiguous responsive precedence, unsafe class or style ownership, and unsupported directives are preserved for review.

The complete directive-by-directive status, including grid, image, breakpoint, and class/style boundaries, is in [docs/compatibility.md](docs/compatibility.md). Treat that reference as the beta’s compatibility contract.

## Quick start

Evaluate the published beta without installing it. This safely previews the migration and does not write templates:

```bash
npx @nipe-solutions/flex-layout-codemod@beta ./src --dry-run
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
npx flex-layout-codemod ./src --dry-run --report ./reports/flex-layout.json
```

`--dry-run` validates the planned edits in memory and does not write template output. `--report` is intentional reporting output and is written even during a dry run.

After reviewing the report and committing or branching your work, apply the migration in place:

```bash
npx flex-layout-codemod ./src --target tailwind
```

The current beta writes changed templates in place when neither `--dry-run` nor `--output` is supplied. To write migrated templates to a different location, add `--output ./migrated-src`. Review the Git diff before accepting the changes.

## Examples

This converted example is the same static layout and gap case exercised by the migration fixtures:

```html
<!-- input -->
<div fxLayout="column" fxLayoutGap="4"></div>

<!-- output -->
<div class="flex flex-col box-border gap-[4px]"></div>
```

This fixture is intentionally preserved because the value is a runtime Angular expression. The report records a `dynamic-binding` review diagnostic and the source remains unchanged:

```html
<div [fxFlex]="basis"></div>
```

## Reports and exit codes

Reports use JSON schema version `1` and include per-file results, diagnostics, and a summary. Use them to review preserved cases and to track the migration over multiple branches.

The default exit policy is strict:

| Code | Meaning                                                                               |
| ---: | ------------------------------------------------------------------------------------- |
|  `0` | Migration completed without unresolved results.                                       |
|  `1` | Configuration, parsing, template I/O, report writing, or an internal error failed.    |
|  `2` | Migration completed safely, but `review`, `unsupported`, or `invalid` results remain. |

For an informational CI report that accepts unresolved work while retaining every diagnostic, use:

```bash
npx flex-layout-codemod ./src --dry-run --report ./reports/flex-layout.json --allow-unresolved
```

`--allow-unresolved` changes only the final exit code; it does not hide diagnostics or alter the migration output.

## Known boundaries

This beta has a Tailwind CSS v4 target only; a native CSS target is not implemented. Grid directives and responsive `imgSrc` are recognized and reported but remain unchanged. Orientation, print, and custom breakpoint aliases are preserved. See [docs/compatibility.md](docs/compatibility.md) for exact supported forms and diagnostic codes before planning a large migration.

The codemod does not inspect project styles, Tailwind configuration, Sass, Less, or CSS, and it does not generate a companion stylesheet. Dynamic Angular bindings are not evaluated.

## Contributing and support

The repository requires Node.js 24 and npm 11.

```bash
npm ci
npm run verify
```

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Security reports belong in [GitHub private vulnerability reporting](https://github.com/NIPE-Solutions/flex-layout-migrator/security/advisories/new); other support routes are listed in [docs/SUPPORT.md](docs/SUPPORT.md). Maintainers should follow the reviewed [release process](docs/architecture/release-process.md).

## License

MIT
