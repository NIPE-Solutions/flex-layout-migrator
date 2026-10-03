# Angular Flex-Layout Codemod

Plan the move from Angular Flex-Layout directives to Tailwind CSS v4 or native CSS. The CLI converts supported cases and preserves unresolved source attributes with diagnostics explaining what needs attention. Use it to pilot a migration on external HTML templates, inventory manual work, or apply reviewed batches.

Version 2.0.1 is stable; conversion remains limited to supported, safety-proven cases.

> Plan first. Review unresolved cases. Write only when you are ready.

[Documentation](https://angular-flex-layout-codemod.nipesolutions.com/docs) · [Verified examples](https://angular-flex-layout-codemod.nipesolutions.com/docs/examples) · [Browser playground](https://angular-flex-layout-codemod.nipesolutions.com/#playground) · [npm](https://www.npmjs.com/package/@nipe-solutions/flex-layout-codemod)

## Choose a target

- Tailwind CSS v4 converts supported literal Flex, Grid, visibility, and responsive class/style cases. Responsive ranges and destination classes can affect whether an entire directive family is safe to convert.
- Native CSS covers eight Flex semantic families at base and the 13 standard viewport aliases. Grid, visibility, responsive class/style, orientation, print, and custom aliases remain preserved.

Check the [compatibility matrix](https://angular-flex-layout-codemod.nipesolutions.com/docs/compatibility) against representative templates first. Use manual migration when runtime bindings or application CSS require behavior the tool cannot establish. The CLI accepts HTML files and directories; it does not rewrite inline TypeScript templates or remove Flex-Layout imports and dependencies.

## Requirements and installation

Node.js 22.12 or newer is required (tested on Node 22 and 24). This can differ from your legacy Angular build runtime: the CLI reads source without loading application dependencies. Install an exact development dependency to retain the reviewed version in your manifest and lockfile:

```bash
npm install --save-dev --save-exact @nipe-solutions/flex-layout-codemod
```

See [installation and requirements](https://angular-flex-layout-codemod.nipesolutions.com/docs/installation) for the project-baseline checklist.

## Plan, review, write

Start from a clean branch and choose a representative directory. This example scans HTML under `src` and assumes a Tailwind CSS v4 stylesheet at `src/styles.css`. Plan without changing templates or stylesheets:

```bash
npx flex-layout-codemod ./src --target tailwind --tailwind-stylesheet ./src/styles.css --plan --report ./reports/flex-layout.json
```

The Tailwind stylesheet is optional; supplying it lets the CLI respect a project-specific v4 prefix and breakpoint configuration. See [target configuration](https://angular-flex-layout-codemod.nipesolutions.com/docs/configuration) and [responsive mapping](https://angular-flex-layout-codemod.nipesolutions.com/docs/configuration#responsive-mapping). The JSON report is intentional filesystem output in plan mode and may create its parent directory; keep it outside the migration input.

Review proposed output and every unresolved diagnostic. A supported literal input such as:

```html
<div fxLayout="row"></div>
```

becomes:

```html
<div class="flex flex-row box-border"></div>
```

Dynamic values, class conflicts, and uncertain breakpoint precedence may preserve the directive family instead. Summary counts describe the proposal; they do not establish that your application's layout is correct.

Apply after review, keeping a separate write report:

```bash
npx flex-layout-codemod ./src --target tailwind --tailwind-stylesheet ./src/styles.css --write --report ./reports/flex-layout-write.json
```

The write command recomputes and validates the proposal against current source; the report is a review record, not an executable saved plan. Inspect the diff, run the Angular build and application tests, and check responsive layouts. Re-run the plan on the same scope and account for remaining directives before removing Flex-Layout.

For native CSS, plan a companion stylesheet explicitly:

```bash
npx flex-layout-codemod ./src/app --target css --stylesheet ./src/flex-layout.css --plan
```

The CSS plan creates no stylesheet. After review, replace `--plan` with `--write` to apply templates and the owned stylesheet block together, preserving handwritten bytes outside that block. Include `src/flex-layout.css` in your application's global styles, for example by adding `@import './flex-layout.css';` to `src/styles.css`; the CLI does not update Angular build configuration. See the [migration workflow](https://angular-flex-layout-codemod.nipesolutions.com/docs/workflow) for output paths and verification.

## Unresolved cases and write safety

Unresolved `review`, `unsupported`, and `invalid` results remain in source and produce exit code 2 by default. `--allow-unresolved` changes that exit policy; it does not add conversion support or remove diagnostics. Parse errors prevent application for the whole invocation and remain failures.

The Tailwind target changes templates without editing your stylesheet or configuration. Native CSS template and stylesheet writes share a recoverable transaction: ordinary failures or handled interruptions roll back together. Forced termination, power loss, or storage failure can leave recovery unconfirmed. Inspect reported paths against Git or a verified backup before retrying; read the [safety model](https://angular-flex-layout-codemod.nipesolutions.com/docs/safety).

The browser playground previews one template. It does not establish project-wide selector or configuration safety; use CLI reports and application tests for repository migration.

## Documentation

- [Compatibility by target and directive](https://angular-flex-layout-codemod.nipesolutions.com/docs/compatibility)
- [Diagnostics and remediation](https://angular-flex-layout-codemod.nipesolutions.com/docs/diagnostics)
- [Complete CLI reference](https://angular-flex-layout-codemod.nipesolutions.com/docs/cli)
- [JSON reports and CI](https://angular-flex-layout-codemod.nipesolutions.com/docs/reports)
- [Safety, transactions, and recovery](https://angular-flex-layout-codemod.nipesolutions.com/docs/safety)

## Contributing and support

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Use [GitHub Issues](https://github.com/NIPE-Solutions/flex-layout-migrator/issues) for reproducible, redacted migration cases. Report vulnerabilities through [GitHub private vulnerability reporting](https://github.com/NIPE-Solutions/flex-layout-migrator/security/advisories/new); see [SECURITY.md](SECURITY.md) and [support guidance](docs/SUPPORT.md).

Maintainers should follow the reviewed [release process](docs/architecture/release-process.md).

## License

[MIT](LICENSE)
