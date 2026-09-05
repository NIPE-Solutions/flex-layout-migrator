---
path: /docs/troubleshooting
title: Troubleshooting
description: Diagnose parse failures, preserved directives, unresolved status, and unexpected responsive output.
group: reference
order: 3
---

# Troubleshooting

## Start with the first boundary

For a parse error, repair the template and confirm the Angular compiler succeeds before rerunning. For an invalid directive value, compare the input with the supported source grammar. For preserved source, read the first relevant diagnostic and inspect related responsive aliases, destination classes, styles, parent context, and target support together.

If the process exits 2, the plan or application completed but strict policy found review, unsupported, or invalid results. If it exits 1, check configuration and path errors, parse results, project I/O, transaction recovery paths, and report writing before retrying. Parse errors stay at 1 even with the unresolved override.

If expected project files are absent, inspect `mode` and `application`: planning is the default, and write mode is skipped for any parse error. If project files changed but a report is absent, remember that report writing occurs after application and outside the project transaction.

## Reproduce a small case

Reduce unexpected output to one representative template while keeping the directive combination, responsive aliases, parent context, and existing classes or styles that affect the result. Compare the browser preview with a CLI plan, remembering that only the CLI performs discovery, path validation, preflight, coordinated writes, and reports.

For unexpected reruns, compare the package version and every behavior-affecting option. For native CSS, verify the same companion stylesheet path and keep manual rules outside the codemod-owned block. For a transaction error, stop and reconcile every listed recovery path before another write.

### FAQ, glossary, and known limitations

Plan means a validated proposal not applied to project artifacts. Applied means the write path completed, including a valid no-change plan. Preserved means original source remains. Review means human or project evidence is required. Unsupported means the selected target has no verified automatic conversion. Invalid means the directive value cannot be accepted safely. Parse error means Angular rejected source or proposed generated syntax.

Known limitations include dynamic application expressions, custom breakpoint definitions, unconfirmed optional orientation or print configuration, conflicting destination ownership, and target-specific unsupported families. The native CSS target intentionally supports fewer families than Tailwind and owns only one marked companion block. The project does not claim every Angular or Nx version.

### Migrating scripts from version 1 behavior

Current version 2 prereleases plan by default. Scripts that depended on implicit application must add `--write`; scripts using the removed `--dry-run` option must remove it. Schema-1 report consumers must require schema 2 and replace `dryRun` inference with `mode` plus `application`. Review release notes for the installed prerelease before changing automation.

When filing an issue, include the installed version, exact command, target, minimal non-sensitive source, actual and expected output, and relevant diagnostics or report excerpt.
