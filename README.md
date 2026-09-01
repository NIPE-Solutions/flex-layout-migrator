# Angular Flex-Layout Codemod

A safety-first codemod for migrating projects away from the archived Angular Flex-Layout library.

Version 2 is under active development and is not published to npm yet. It does not claim production-ready conversion coverage. See the [compatibility reference](docs/compatibility.md) for the current directive-by-directive status and safety limitations.

## Current scope

The v2 engine parses templates with the Angular compiler and applies validated source-range edits. It preserves comments, control-flow syntax, interpolation, line endings, and all unrelated source text instead of serializing the template as generic HTML.

The current prerelease converts documented static inputs and literal responsive inputs using the standard Angular Flex-Layout viewport aliases (`xs` through `xl`, `lt-*`, and `gt-*`) to exact Tailwind CSS v4 arbitrary media variants. For example, `fxLayout.sm="row"` becomes `[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:flex-row` alongside the other layout utilities. Dynamic bindings, orientation, print, and custom breakpoints, bound class values, unsupported directives, and responsive families with conflicting overlapping values remain unchanged with structured review results. Ambiguous behavior is never approximated silently.

## CLI workflow

Run the codemod for one Angular template or a directory:

```bash
flex-layout-codemod ./src --target tailwind --output ./migrated-src
```

Preview the same migration plan without writing templates, while also creating a JSON report:

```bash
flex-layout-codemod ./src --target tailwind --output ./migrated-src --dry-run --report ./reports/flex-layout.json
```

Only changed `.html` files are written during a real migration. For a single-file input, the planned output path must end in `.html` (case-insensitive); omitting `--output` keeps the default in-place behavior. For a folder input, `--output` remains a directory and each derived template output retains its `.html` path. `--dry-run` applies and validates edits in memory but does not write template output or create its missing parent directories. A requested `--report <path>` is an explicit reporting side effect and is still written atomically during a dry-run. The report path must be nonblank and end in `.json` (case-insensitive). Migratable inputs and planned template outputs exclusively use `.html`, so this structural rule prevents report collisions while allowing reports anywhere, including inside input or output trees. Invalid output and report paths are rejected before migration without creating output or report directories.

Unresolved `review`, `unsupported`, or `invalid` results are strict by default. To preserve the same diagnostics and migration output while accepting unresolved work in automation, use:

```bash
flex-layout-codemod ./src --dry-run --allow-unresolved
```

The CLI uses these exit codes:

| Code | Meaning                                                                                |
| ---: | -------------------------------------------------------------------------------------- |
|  `0` | Migration completed with no unresolved results, or `--allow-unresolved` accepted them. |
|  `1` | Configuration, parsing, template I/O, report writing, or an internal invariant failed. |
|  `2` | Migration completed safely, but unresolved results remain in strict mode.              |

JSON reports use schema version `1`. Report paths use forward slashes and are relative to the input root; a single-file input is represented by its basename, never an absolute checkout path. Files are path-sorted, results retain source order, and the summary is derived from those file results.

Use version control and review the generated diff before replacing application templates. Native CSS output remains outside the current scope.

The TypeScript extension API changed in v2: mutable Cheerio converters were replaced by immutable `ConversionAdapter` plans and structured `ConversionResult` values. These prerelease APIs may continue to evolve before v2 is stable.

## Development

The repository requires Node.js 24 and npm 11.

```bash
npm ci
npm run verify
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Security reports belong in [GitHub private vulnerability reporting](https://github.com/NIPE-Solutions/flex-layout-migrator/security/advisories/new); other support routes are documented in [docs/SUPPORT.md](docs/SUPPORT.md).

## License

MIT
