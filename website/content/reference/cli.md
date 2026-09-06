---
path: /docs/cli
title: CLI reference
description: Use the installed command's verified options for target selection, planning, reporting, and explicit writes.
group: reference
order: 1
---

# CLI reference

## Command shape

The CLI accepts one required HTML file or directory scope and plans a migration by default.

```sh
npx flex-layout-codemod <input>
```

`--output <path>` or `-o <path>` selects the proposed HTML file or output directory and defaults to the input. A single-file output must end in `.html`; a folder output preserves input-relative template paths.

`--target <target>` or `-t <target>` selects `tailwind` or `css` and defaults to `tailwind`. The `css` target requires exactly one `--stylesheet <path>` companion stylesheet. The stylesheet option is not valid as a substitute for selecting the native CSS target.

`--write` applies the validated migration plan and defaults to false. Without it, no project template or companion stylesheet is written. `--report <path>` atomically writes a `.json` report after a completed plan or application and remains a filesystem effect in either mode.

`--allow-unresolved` changes only the final exit code for review, unsupported, or invalid results. It does not change diagnostics, proposed output, application, or parse-error handling.

`--orientation-breakpoints` asserts that the source enabled the archived orientation breakpoints. `--print-with-breakpoints <aliases>` asserts a comma-separated source `printWithBreakpoints` list or the literal `none`; it is configuration supplied by the operator, not provider discovery. `--responsive-images` independently opts into eligible `picture` wrapping and acknowledges selector and layout risk.

`--debug` or `-d` enables debug logging. `--version` or `-V` prints the installed package version.

For exact current spelling, defaults, choices, and interactions, use the installed help and immutable CLI registry verified against the production Commander definition.

```sh
npx flex-layout-codemod --version
```

## Configuration boundary

Current migration configuration is command-driven. There is no separate codemod configuration file. Record the full invocation with a batch so target, output, reporting, breakpoint, image, unresolved, and write decisions remain visible to reviewers and reproducible in automation.

The CLI validates option combinations and path collisions before discovery where possible. Output, stylesheet, report, and input identities cannot overlap in ways that would make one artifact overwrite or rediscover another. Report paths must be nonblank and end in `.json`, case-insensitively.

Run from the intended workspace context and inspect help for the installed version. Examples written for another prerelease must not override the locally verified interface. The obsolete `--dry-run` form is rejected because planning is now the default.
