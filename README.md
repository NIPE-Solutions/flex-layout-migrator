# Angular Flex-Layout Codemod

A safety-first codemod for migrating projects away from the archived Angular Flex-Layout library.

Version 2 is under active development and is not published to npm yet. It does not claim production-ready conversion coverage. See the [compatibility reference](docs/compatibility.md) for the current directive-by-directive status and safety limitations.

## Current scope

The v2 engine parses templates with the Angular compiler and applies validated source-range edits. It preserves comments, control-flow syntax, interpolation, line endings, and all unrelated source text instead of serializing the template as generic HTML.

The current prerelease converts a documented set of static Flex-Layout inputs to Tailwind CSS. Dynamic bindings, responsive inputs, custom breakpoints, bound class values, and unsupported directives remain unchanged and receive structured review results. Ambiguous behavior is never approximated silently.

Run it for one Angular template or a directory:

```bash
flex-layout-codemod ./src --target tailwind --output ./migrated-src
```

Only changed `.html` files are written. Use version control and review the generated diff before replacing application templates. Native CSS output, dry-run mode, JSON reports, strict exit codes, and a richer CLI summary remain planned.

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
