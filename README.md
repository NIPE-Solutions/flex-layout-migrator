# Angular Flex-Layout Codemod

Angular Flex-Layout Codemod is a review-first CLI for migrating supported Angular Flex-Layout template directives to Tailwind CSS v4 or native CSS. Version 2 remains a prerelease.

> Plan first. Review unresolved cases. Write only when you are ready.

The codemod changes only cases for which it can produce a supported equivalent. When it cannot prove that boundary, it leaves the source in place and reports a diagnostic instead of guessing.

Read the [detailed documentation](https://angular-flex-layout-codemod.nipesolutions.com/docs), or try a single template in the separate [browser playground](https://angular-flex-layout-codemod.nipesolutions.com/#playground).

## Requirements and installation

The CLI requires Node.js 24 or newer. Install the current beta as an exact development dependency so your package manifest and lockfile retain the reviewed version:

```bash
npm install --save-dev --save-exact @nipe-solutions/flex-layout-codemod@beta
```

See [Installation and requirements](https://angular-flex-layout-codemod.nipesolutions.com/docs/installation) for the project-baseline checklist.

## Plan, review, write

Create a plan and an optional JSON report without changing project templates or stylesheets:

```bash
npx flex-layout-codemod ./src --report ./reports/flex-layout.json
```

Review the proposed output and every unresolved diagnostic. The report is the command's intentional filesystem output in plan mode.

Apply the reviewed Tailwind CSS plan explicitly:

```bash
npx flex-layout-codemod ./src --target tailwind --write
```

For native CSS output, target limits, output paths, and recovery behavior, follow the [migration workflow](https://angular-flex-layout-codemod.nipesolutions.com/docs/workflow). Keep the migration on a clean branch and review the resulting diff and application tests.

## Documentation

- [Migration guide](https://angular-flex-layout-codemod.nipesolutions.com/docs)
- [Compatibility by target and directive](https://angular-flex-layout-codemod.nipesolutions.com/docs/compatibility)
- [Diagnostics and remediation](https://angular-flex-layout-codemod.nipesolutions.com/docs/diagnostics)
- [Complete CLI reference](https://angular-flex-layout-codemod.nipesolutions.com/docs/cli)
- [JSON reports and CI](https://angular-flex-layout-codemod.nipesolutions.com/docs/reports)
- [Safety, transactions, and recovery](https://angular-flex-layout-codemod.nipesolutions.com/docs/safety)

## Contributing and support

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Use [GitHub Issues](https://github.com/NIPE-Solutions/flex-layout-migrator/issues) for reproducible, redacted migration cases. Report vulnerabilities only through [GitHub private vulnerability reporting](https://github.com/NIPE-Solutions/flex-layout-migrator/security/advisories/new); see [SECURITY.md](SECURITY.md) and [support guidance](docs/SUPPORT.md).

Maintainers should follow the reviewed [release process](docs/architecture/release-process.md).

## License

[MIT](LICENSE)
