# Angular Flex-Layout Codemod

A safety-first codemod for migrating projects away from the archived Angular Flex-Layout library.

Version 2 is under active development and is not published to npm yet. It does not claim production-ready conversion coverage. See the [compatibility reference](docs/compatibility.md) for the current directive-by-directive status and safety limitations.

## Direction

The v2 CLI will analyze Angular templates before changing them and classify each directive as converted, requiring manual review, or unsupported. Native CSS will be the primary target, with Tailwind CSS provided by a separate adapter. Ambiguous responsive and dynamic behavior will not be approximated silently.

The current prerelease preserves dynamic bindings, responsive inputs, custom breakpoints, and unsupported directives for review instead of removing them. The CLI reporting interface described below is still being implemented.

Planned commands:

```text
flex-layout-codemod analyze ./src
flex-layout-codemod migrate ./src --target css
flex-layout-codemod migrate ./src --target tailwind
```

These commands describe the v2 interface and are not all implemented yet.

## Development

The repository requires Node.js 24 and npm 11.

```bash
npm ci
npm run verify
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Security reports belong in [GitHub private vulnerability reporting](https://github.com/NIPE-Solutions/flex-layout-migrator/security/advisories/new); other support routes are documented in [docs/SUPPORT.md](docs/SUPPORT.md).

## License

MIT
