# Plan-by-default CLI and explicit application

## Decision

The command becomes safe by default. An invocation without an application flag performs the complete migration planning and validation pipeline but does not change templates or the native CSS companion stylesheet. `--write` explicitly authorizes the existing transactional application path.

This is the first adaptive-CLI slice. It changes execution semantics and reporting, but deliberately retains the current deterministic plain-text presentation. Interactive progress, color controls, quiet and verbose modes, and machine-readable standard output remain a later slice.

## Goals

- Make planning the default for every migration target and optional responsive-image conversion.
- Require `--write` before changing templates or a companion stylesheet.
- Keep report writing an explicit side effect in plan and write modes.
- Represent requested execution mode and actual application outcome without inference.
- Preserve one planning, preflight, validation, diagnostic, and exit-policy path across both modes.
- Give users of the prerelease a direct migration error instead of silently accepting obsolete `--dry-run` syntax.
- Keep Tailwind, native CSS, responsive-image, rollback, and path-safety behavior unchanged once write mode is authorized.

## Non-goals

- Interactive terminal progress, spinners, cursor control, file navigation, or prompts.
- `--json` on standard output.
- `--quiet`, `--verbose`, `--no-color`, or new logging behavior.
- New directive, breakpoint, image, Tailwind, or native CSS conversion support.
- Changes to stylesheet ownership, transaction recovery, or conversion semantics.
- Compatibility with schema-1 report consumers without an explicit consumer update.

## Command contract

```text
flex-layout-codemod <input> [options]

Options:
  -o, --output <path>       planned output file or folder; single-file output must end in .html
  -t, --target <target>     conversion target: tailwind or css
      --stylesheet <path>   companion stylesheet; required for the css target
      --write               apply the validated migration plan
      --report <path>       atomically write a schema-2 JSON report
      --allow-unresolved    return success when unresolved inputs remain
      --orientation-breakpoints
      --print-with-breakpoints <aliases>
      --responsive-images
  -d, --debug               include stack information for unexpected failures
```

With no `--write`, the command runs in `plan` mode. It discovers and parses every selected template, computes proposed target output, validates source edits and destinations, reparses changed templates, plans the companion stylesheet when selected, and preflights the complete migration plan. It creates or modifies no project template, output directory, or stylesheet.

`--write` selects `write` mode. After the same planning and preflight path succeeds, the migration transaction applies changed templates and the companion stylesheet. Existing rollback and interruption guarantees remain unchanged.

`--report <path>` remains an explicit reporting side effect. A report is atomically written after the migration result is known in either mode. Report-path validation and collision protection remain active. Plan mode may therefore create the report and its parent directory while leaving project outputs untouched.

`--dry-run` is removed from the option set. Supplying it is a configuration error with a concise message: planning is now the default; use `--write` to apply changes. The command returns exit code `1` and performs no migration or report write. Commander must not fall through to its generic unknown-option wording when a more actionable migration message can be provided.

`--write` is a boolean flag and may appear at most once according to Commander’s normal option semantics. It does not bypass unresolved-result policy, parse-error handling, destination validation, preflight, or transaction safety.

## Execution model

The CLI translates command syntax into one explicit execution mode:

```ts
type MigrationMode = 'plan' | 'write';
```

`Migrator` receives the mode as part of its execution options. File and folder migration continue to produce immutable proposed output artifacts in memory regardless of mode. Adapters, semantic planners, renderers, and source editors do not receive or branch on CLI flags.

The coordinator follows one sequence:

1. Validate CLI configuration and all selected paths.
2. Discover and parse the complete input set.
3. Produce all template and optional stylesheet artifacts.
4. Build the immutable invocation-wide migration plan.
5. Preflight the complete plan in both modes.
6. In `plan` mode, return a skipped application outcome without calling transaction apply.
7. In `write` mode with no parse errors, apply the plan through the existing transaction.
8. In `write` mode with any parse error, skip application for the whole invocation.
9. Build and present the report, then atomically write a requested report file.

Planning and write mode must produce identical proposed file results, diagnostics, stylesheet actions, and exit-policy inputs for the same source bytes. Only the application outcome and resulting project filesystem may differ.

## Report schema 2

The JSON and in-memory report schema advances from version `1` to version `2`. The ambiguous `dryRun: boolean` field is removed and replaced with the requested execution mode:

```ts
interface MigrationReport {
  readonly schemaVersion: 2;
  readonly mode: 'plan' | 'write';
  readonly target: 'tailwind' | 'css';
  readonly application: MigrationApplication;
  // Existing input, output, duration, summary, files, and stylesheet fields remain.
}

type MigrationApplication =
  { readonly status: 'applied' } | { readonly status: 'skipped'; readonly reason: 'plan-only' | 'parse-errors' };
```

Application outcomes are exact:

| Requested mode | Parse errors | Application outcome                 |
| -------------- | ------------ | ----------------------------------- |
| `plan`         | none         | `skipped: plan-only`                |
| `plan`         | present      | `skipped: plan-only`                |
| `write`        | none         | `applied` after transaction success |
| `write`        | present      | `skipped: parse-errors`             |

An empty or unchanged valid plan in write mode is still `applied`: the requested application path completed successfully and required no project byte changes. A transaction or report-write failure does not produce a successful report object at the CLI boundary and returns exit code `1`, as today.

File `changed` values and stylesheet actions continue to describe the proposed destination-state differences. Consumers determine whether those proposals reached the project filesystem from `application`; they never infer application from `mode`, file counts, or stylesheet action alone.

Schema 2 is intentionally breaking during the version 2 prerelease. Documentation and package contracts must name the new version and fields. No duplicate deprecated `dryRun` field is retained.

## Terminal presentation

This slice preserves stable, non-interactive plain text for terminals, redirected output, and CI. The presenter consumes the report’s explicit mode and application outcome.

Plan mode uses prospective language:

```text
Plan: 4 files scanned, 3 would change
Converted 12 | Review 1 | Unsupported 0 | Invalid 0 | Parse errors 0
No project files were written. Run again with --write to apply this plan.
```

Successful write mode uses completed language:

```text
Applied: 4 files scanned, 3 changed
Converted 12 | Review 1 | Unsupported 0 | Invalid 0 | Parse errors 0
```

When write mode is skipped because of parse errors, proposed edits use prospective wording and the final line states that no project files were written because parsing failed. Native CSS stylesheet lines similarly distinguish `would create`, `would update`, or `would remain unchanged` from completed `created`, `updated`, or `unchanged` wording.

Unresolved diagnostic lines, relative paths, source offsets, and deterministic ordering remain unchanged. Plan mode is not described as an error. The later adaptive-presentation slice may render the same report through interactive, quiet, verbose, colored, or stdout-JSON presenters without changing migration decisions.

## Exit behavior

Existing exit meanings remain stable:

| Code | Meaning                                                                                                      |
| ---: | ------------------------------------------------------------------------------------------------------------ |
|  `0` | Planning or application completed and no unresolved results remain, or `--allow-unresolved` was supplied.    |
|  `1` | Configuration, parsing, project I/O, transaction, report writing, or internal invariant failure.             |
|  `2` | Planning or application completed safely, but review, unsupported, or invalid results remain in strict mode. |

Plan mode does not change the unresolved-result policy. A clean plan exits `0`; a plan with unresolved results exits `2` unless `--allow-unresolved` is supplied. Parse errors remain exit code `1` even though the report is complete and application is explicitly skipped.

## Compatibility and rollout

This is a deliberate prerelease command-contract change:

- Existing scripts that relied on implicit writes must add `--write`.
- Existing preview scripts should remove `--dry-run`.
- Schema-1 report consumers must accept schema 2 and replace `dryRun` checks with `mode` plus `application`.
- Tailwind remains the default target.
- Native CSS still requires exactly one explicit stylesheet path.
- Responsive-image conversion remains separately opt-in and follows the selected plan/write mode.
- `--output` identifies a proposed destination in plan mode and an applied destination only in write mode.

README quick-start examples omit `--dry-run`; application examples include `--write`. Compatibility documentation, help text, packaged-command checks, and one minor Changeset must describe the same behavior. The Changeset must call out the prerelease breaking semantics despite using the repository’s minor release classification for new version-2 capability.

## Architecture boundaries

- Commander owns syntax and maps flags to `MigrationMode`; it owns no conversion or filesystem policy.
- `Migrator` owns orchestration of planning, preflight, optional application, and report construction.
- File and folder migrators remain pure planners and cannot inspect execution mode or write project files.
- The transaction remains the only coordinated template and stylesheet mutation authority.
- Report presenters render explicit state and cannot infer or trigger application.
- JSON report writing remains outside the project transaction and occurs only after the migration outcome is known.
- Adapters receive semantic/configuration inputs only; `--write`, report paths, and presentation choices do not cross the adapter boundary.

Architecture tests must enforce these dependencies and prevent a future presenter, adapter, file migrator, or folder migrator from acquiring project-write authority.

## Error handling

- Obsolete `--dry-run` fails before input discovery with migration guidance.
- Invalid flag combinations and paths fail before planning and produce no report.
- Plan preflight failures return code `1` without project writes.
- Parse errors yield a complete schema-2 report; project application is skipped even when `--write` was requested.
- Transaction failure retains the existing rollback and recovery reporting behavior and produces no successful report write.
- Report-write failure returns code `1`; any already-applied project transaction remains applied, matching the existing independent-report contract.
- Debug mode may add a stack trace for unexpected failures but does not change mode, report fields, or exit policy.

## Testing strategy

Behavior changes follow red-green-refactor development. Tests must include:

- CLI tests proving the default invocation leaves in-place and alternate-output templates untouched.
- Native CSS tests proving default mode creates neither template destinations nor stylesheet output.
- Tailwind, native CSS, and responsive-image tests proving `--write` applies the existing planned changes.
- Plan/write parity tests for proposed files, results, diagnostics, stylesheet actions, and exit codes.
- Parse-error tests for both modes, including exact `application` outcomes and no project artifacts.
- Report tests proving plan mode may atomically write schema-2 JSON while project outputs stay untouched.
- Help and error tests for `--write` and actionable rejection of `--dry-run`.
- Terminal golden tests for prospective, applied, unchanged, stylesheet, unresolved, and parse-error wording.
- JSON contract tests proving `schemaVersion: 2`, `mode`, and exhaustive application reasons, with no `dryRun` field.
- Architecture tests keeping execution flags out of adapters and pure file/folder planners.
- Packaged CLI tests for default plan-only behavior and explicit write behavior.
- Existing transaction failure, rollback, Tailwind compatibility, native CSS idempotence, and package-surface suites unchanged and green.

The final verification begins from an absent `dist` directory and runs formatting, linting, type checking, coverage, build, package verification, audit, diff checks, and the public CLI fixtures.

## Completion criteria

The slice is complete when every command plans without changing project artifacts by default; `--write` is the only normal authorization for template and stylesheet application; obsolete `--dry-run` fails with actionable guidance; plan and write share identical validated proposals; schema-2 reports state requested mode and actual application outcome unambiguously; terminal output never describes unapplied proposals as completed writes; current conversions, transaction safety, exit policy, and report-file behavior remain intact; documentation and packaged help teach the new workflow; and all repository and CI verification gates pass from a clean build state.

The following adaptive-CLI slice may add typed progress events, interactive and deterministic presenters, stdout JSON, quiet/verbose controls, and optional color on top of this explicit execution contract.
