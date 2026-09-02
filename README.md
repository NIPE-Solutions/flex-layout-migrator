# Angular Flex-Layout Codemod

A safety-first codemod for migrating projects away from the archived Angular Flex-Layout library.

Version 2 remains a prerelease under active development. It does not claim production-ready conversion coverage. See the [compatibility reference](docs/compatibility.md) for the current directive-by-directive status and safety limitations.

Install a published v2 beta as a development dependency with `npm install --save-dev @nipe-solutions/flex-layout-codemod@beta`. Maintainers should follow the reviewed [release process](docs/architecture/release-process.md); merging a version pull request does not publish the package.

## Current scope

The v2 engine parses templates with the Angular compiler and applies validated source-range edits. It preserves comments, control-flow syntax, interpolation, line endings, and all unrelated source text instead of serializing the template as generic HTML.

The current prerelease converts documented static inputs and literal responsive inputs using the standard Angular Flex-Layout viewport aliases (`xs` through `xl`, `lt-*`, and `gt-*`) to exact Tailwind CSS v4 arbitrary media variants. For example, `fxLayout.sm="row"` becomes `[@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:flex-row` alongside the other layout utilities. Dynamic bindings, orientation, print, and custom breakpoints, unsupported directives, and responsive families with conflicting overlapping values remain unchanged with structured review results. Ambiguous behavior is never approximated silently.

Literal responsive `ngClass.<alias>` and `ngStyle.<alias>` values use the same 13-alias boundary. Class values are split with Angular `NgClass`'s ECMAScript-whitespace rule and convert only when every token is in the compiler-proven built-in Tailwind CSS v4 surface, retains the host element as its CSS target, and can be emitted byte-for-byte for Tailwind's raw template scanner. Style declarations convert to arbitrary-property utilities only when Flex-Layout's quote removal, semicolon splitting, exact-key application order, Angular unit handling, CSS priority, fallback ownership, and responsive precedence can be represented exactly. Distinct exact ordinary keys that apply to the same CSS property, including `font-size` and `font-size.px`, are preserved because their result can depend on `NgStyle` activation history. Unsuffixed `ngClass` and `ngStyle` siblings are treated as replaceable fallback authorities rather than silently left as always-active values.

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

Application classes, project plugin utilities, custom-theme-dependent candidates such as `bg-brand-500`, unsafe style values, bindings, interpolation, and deprecated `class.<alias>` or `style.<alias>` selectors remain in place with review diagnostics. The current mode does not inspect project styles or Tailwind configuration and does not generate a companion stylesheet.

Existing literal classes use a broader conservative ownership check than generated-candidate admission. Compiler-modeled Tailwind utilities contribute every stable declaration they emit, including inferred arbitrary text sizes, directional border style/width pairs, and shadow color custom properties. A recognized pinned Tailwind utility whose complete property set is not modeled is treated as an unknown CSS authority and blocks an intersecting conversion instead of being silently ignored; ordinary application classes such as `card` remain additive.

Literal `fxShow` and `fxHide` inputs are converted when the element's complete display behavior is provable. The conversion follows Angular Flex-Layout coercion: `fxShow="false"` hides, `fxHide="false"` shows, and other literal strings, including `"0"`, are truthy before `fxHide` inversion. Literal values use Angular-decoded text, so an entity-spelled value such as `fals&#101;` has the same semantics as `false`. Hiding uses `hidden`; a responsive shown state after base hiding restores only a display value proven by a converted `fxLayout` or one unambiguous base Tailwind display utility.

```html
<!-- input -->
<div fxLayout="column" fxShow="false" fxShow.sm></div>

<!-- output -->
<div
  class="flex flex-col box-border hidden [@media_screen_and_(min-width:_600px)_and_(max-width:_959.98px)]:flex"
></div>
```

The complete visibility family is preserved when it contains a binding or interpolation, an orientation, print, or custom alias, conflicting overlapping states, an unverified restoration display, a partially overlapping responsive layout display without safe ownership, or an unsafe class/style interaction. A literal or bound style that can control `display` always blocks conversion. An unresolved responsive class or style authority also preserves related visibility output when it may control `display`. A bound class blocks a family that needs generated classes, but does not block an all-shown no-op whose attributes can simply be removed. See the [compatibility reference](docs/compatibility.md) and [visibility architecture](docs/architecture/visibility-semantics.md) for the exact boundary.

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

Each non-parse report result represents one source directive occurrence. Measure responsive class and style adoption by counting `ngClass`, `ngStyle`, `class`, and `style` results by status in a representative migration report. This occurrence ratio is an inventory of the scanned templates, not a claim that the same percentage of an application or its runtime behavior was converted.

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
