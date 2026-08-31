# CLI reporting and execution contract

## Decision

The CLI treats migration as a result-producing operation. Migration services return a complete, immutable report; terminal and JSON presenters render that report without participating in parsing, conversion, or file mutation.

This replaces observer-derived statistics and phase-oriented spinner output. The command remains concise for interactive use, deterministic in CI, and explicit about unresolved work.

## Goals

- Support real and dry-run migration through the same planning path.
- Provide stable exit codes for automation.
- Summarize converted, review, unsupported, invalid, and parse-error outcomes.
- Write a versioned, portable JSON report when requested.
- Keep reporting independent of conversion adapters and filesystem traversal.
- Avoid interactive output when stdout is redirected or the process runs in CI.

## Non-goals

- Add new directive conversions.
- Add native CSS output.
- Evaluate Angular expressions.
- Introduce interactive prompts.
- Guarantee compatibility for unreleased JSON schema versions other than the documented version field.

## Command contract

```text
flex-layout-codemod <input> [options]

Options:
  -o, --output <path>       output file or directory; defaults to input
  -t, --target <target>     conversion target; currently tailwind
      --dry-run             analyze and plan without writing templates
      --report <path>       atomically write a JSON report
      --allow-unresolved    return success when unresolved inputs remain
  -d, --debug               enable debug logging
```

An output path does not need to exist. Its parent directory is created only when a changed template is written. In dry-run mode, neither the template output nor missing output directories are created. A requested JSON report is still written during dry-run because it is an explicit reporting side effect.

Strict unresolved handling is the default. `--allow-unresolved` changes only the final exit code; it does not hide diagnostics or change which templates are written.

## Exit codes

| Code | Meaning                                                                                                                |
| ---: | ---------------------------------------------------------------------------------------------------------------------- |
|  `0` | Migration completed and either no unresolved results remain or `--allow-unresolved` was supplied.                      |
|  `1` | Configuration, parsing, report writing, template I/O, or an internal invariant failed.                                 |
|  `2` | Migration completed, templates were safely handled, and review, unsupported, or invalid results remain in strict mode. |

Angular parse diagnostics are structured results and return code `1`; a malformed file is never written. When folder migration finishes, the CLI renders the completed report and writes it to `--report <path>` when requested. If folder traversal or file migration instead throws, templates written earlier in the sequential run are not rolled back. `Migrator#migrate()` returns no report in that case, and because `runCli` writes the JSON report only after migration resolves, it produces no new report for the failed run and leaves any existing report path untouched. In normal mode, the CLI writes one concise error to stderr; with `--debug`, it additionally writes available stack information. Both modes return code `1`.

## Migration report

The application layer returns one report for both file and directory inputs:

```ts
interface MigrationReport {
  readonly schemaVersion: 1;
  readonly target: 'tailwind';
  readonly dryRun: boolean;
  readonly input: string;
  readonly output: string;
  readonly durationMs: number;
  readonly summary: MigrationSummary;
  readonly files: readonly FileReport[];
}

interface MigrationSummary {
  readonly filesScanned: number;
  readonly filesChanged: number;
  readonly converted: number;
  readonly review: number;
  readonly unsupported: number;
  readonly invalid: number;
  readonly parseErrors: number;
}

interface FileReport {
  readonly path: string;
  readonly changed: boolean;
  readonly results: readonly ReportResult[];
}

type ReportResult =
  | {
      readonly status: 'converted';
      readonly directive: string;
      readonly sourceName: string;
      readonly offset: number;
    }
  | {
      readonly status: 'review' | 'unsupported' | 'invalid';
      readonly directive: string;
      readonly sourceName: string;
      readonly offset: number;
      readonly code: string;
      readonly reason: string;
      readonly suggestion: string;
    }
  | {
      readonly status: 'parse-error';
      readonly offset: number;
      readonly code: 'template-parse-error';
      readonly reason: string;
    };
```

Paths in JSON and application reports use forward slashes and are relative to the input root. A single-file input uses its basename. Paths must not depend on the caller's current working directory or expose an absolute checkout location.

Report results intentionally copy the stable public fields needed by users instead of serializing internal analyzer objects. This prevents absolute `fileName` values, element identifiers, and edit ranges from leaking into the JSON contract.

Files are sorted by normalized path. Results within each file retain source order. Summary values are derived from file reports rather than maintained through mutable counters.

`durationMs` is an integer elapsed duration supplied by an injected clock in tests. It is informational and is excluded from deterministic fixture comparisons where appropriate.

## Execution architecture

### Migration application service

`Migrator` coordinates input discovery and returns `MigrationReport`. It receives execution options rather than constructing reporters. It does not print or set process state.

`FileMigrator` returns a `FileMigrationResult` containing the existing structured conversion results plus `changed`. It receives a write policy:

- real migration applies validated edits and atomically writes changed output;
- dry-run applies edits in memory to prove the plan is valid but performs no template write.

Both modes use the same Angular parser, analyzer, adapter, planner, and source editor. Dry-run is not a separate approximation.

### Exit policy

A pure function maps a completed report and `allowUnresolved` to `0` or `2`. Parse errors and thrown execution failures map to `1` at the CLI boundary. This policy is independently unit tested.

### Terminal presenter

The terminal presenter receives a report and writes through an injected text stream. It prints:

- one outcome line with scanned and changed file counts;
- outcome totals for converted, review, unsupported, invalid, and parse errors;
- one concise line per unresolved result with relative path, source offset, diagnostic code, and reason;
- a dry-run label when no template writes occurred.

Normal output contains no emoji, thank-you text, color, or multi-phase implementation details. TTY, CI, and redirected output use the same stable plain text. Debug logging remains separate from the report.

### JSON presenter

The JSON presenter serializes the report with two-space indentation and a trailing newline. It writes through `AtomicFileWriter`, so an existing report survives serialization or rename failure. The JSON document contains no ANSI escape sequences, logger metadata, stack traces, or absolute paths.

## Error handling

- Commander validation errors use code `1` and stderr.
- Missing input, unsupported input type, unsupported file extension, and invalid target are configuration failures.
- Parse errors are structured results and execution failures; no affected template is written.
- Report-write failure uses code `1`, even if template migration completed.
- Unexpected errors are rendered once with a concise message; debug mode may add a stack trace.
- The command action must not swallow errors and accidentally leave `process.exitCode` as success.

## Testing strategy

The implementation is covered by red-green-refactor tests.

- Report aggregation tests cover file and folder inputs, portable paths, source ordering, changed counts, mixed outcomes, and duration.
- File migration tests prove dry-run and real runs produce identical results while only the real run writes templates.
- Exit-policy tables cover clean, unresolved, allowed-unresolved, and parse-error reports.
- Terminal presenter tests use injected streams and verify stable plain output plus dry-run labeling.
- JSON presenter tests parse the emitted document, assert schema version `1`, reject absolute paths, and verify atomic replacement behavior.
- CLI integration tests execute the built binary for exit codes `0`, `1`, and `2`, missing output paths, dry-run, and JSON reporting.
- Package smoke tests continue to install the tarball and execute its binary.

## Implementation

The reporting workflow was implemented in reviewable increments:

1. Added immutable migration report aggregation and portable path handling.
2. Added dry-run write policy and changed-file accounting.
3. Added exit policy and terminal presenter.
4. Added atomic JSON reporting.
5. Rebuilt the Commander boundary and removed observer statistics/spinner dependencies.
6. Updated CLI documentation and verified the packaged command through help, version, and dry-run execution.
