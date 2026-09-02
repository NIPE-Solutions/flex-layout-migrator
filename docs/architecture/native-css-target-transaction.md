# Native CSS Target and Transactional Application

## Purpose

This slice exposes the existing native CSS Flex renderer and owned-stylesheet merger through the command line. It treats changed templates and one explicitly selected companion stylesheet as one invocation-wide change set: every output is planned and validated before any project file changes, and an apply failure restores the original project.

The slice retains the current opt-in write model. `--dry-run` plans without writing; the later adaptive CLI milestone will make planning the default and introduce `--write`.

## User contract

The new target is selected explicitly:

```bash
flex-layout-codemod ./src --target css \
  --stylesheet ./src/flex-layout-migration.css
```

`--target css` requires exactly one nonempty `--stylesheet <path>`. Supplying `--stylesheet` with another target is a usage error. The path is resolved from the process working directory, must identify a file rather than a directory, and must not overlap an input template, an output template, the JSON report path, or an invocation-owned temporary or backup path.

The stylesheet may be outside the input or output tree. If it is inside the input tree, HTML discovery still ignores it because discovery accepts only `.html` files. Symlinked output destinations are rejected during preflight; the transaction does not follow a destination symlink when replacing project files.

The stylesheet lifecycle is:

- a missing stylesheet is proposed only when at least one owned rule exists;
- an existing stylesheet is always read and ownership-validated;
- an existing owned block is updated when the generated rules change;
- a stale owned block is removed when no generated rules remain;
- a missing stylesheet with no generated rules remains absent; and
- handwritten bytes outside a valid owned block remain exact.

`--dry-run` performs the same reads, planning, collision checks, ownership validation, template reparse, and transaction preflight as a write run. It creates no output directories, templates, stylesheets, backups, or temporary files. JSON reports remain an explicitly requested atomic output written after the migration result is known, outside the project change transaction.

## Conversion scope

The CSS target initially converts the target-neutral semantic families already implemented by the native renderer:

- `fxLayout`;
- `fxLayoutAlign`;
- `fxLayoutGap`;
- `fxFlex`, including verified `fxGrow` and `fxShrink` composition;
- `fxFlexAlign`;
- `fxFlexFill` and `fxFill`;
- `fxFlexOffset`; and
- `fxFlexOrder`.

Base inputs and the 13 standard viewport aliases are supported. The adapter consumes the same semantic planners and breakpoint catalog as Tailwind; it cannot reinterpret raw values or maintain a second breakpoint table.

Grid, visibility, responsive class/style, orientation, print, and custom breakpoint CSS rendering remain outside this slice. Those source inputs remain unchanged with the existing `target-unsupported` diagnostic and an action that identifies the currently supported target or required follow-up. Responsive-image migration remains target-independent and may be explicitly enabled with either target.

The compatibility inventory and documentation describe this Limited CSS support precisely. Exposing a partial target does not imply parity for directive families without a native renderer.

## Architecture

The application pipeline becomes plan-first for both targets:

```text
CLI configuration
       |
       v
deterministic discovery -> template parse and analysis
       |                            |
       |                            v
       |                 target adapter session
       |                    /             \
       |          template class edits   CSS rules
       |                    \             /
       v                     v           v
invocation plan <- changed template validation + stylesheet merge
       |
       +------ dry-run ------> report
       |
       v
transaction preflight -> stage -> backup -> replace -> cleanup
                                  |
                                  +-- failure --> rollback
       |
       v
     report
```

Conversion adapters decide conversion behavior. Planning components describe proposed outputs. The transaction layer is the only authority that mutates multiple project output files. Presenters and report writers do not participate in conversion or transaction decisions.

## Plan model

`src/migrator/migration-plan.ts` defines immutable invocation artifacts:

```ts
type PlannedArtifactKind = 'template' | 'stylesheet';

interface PlannedOutputArtifact {
  readonly kind: PlannedArtifactKind;
  readonly path: string;
  readonly original: { readonly status: 'absent' } | { readonly status: 'present'; readonly contents: string };
  readonly proposed: { readonly status: 'absent' } | { readonly status: 'present'; readonly contents: string };
}

interface MigrationPlan {
  readonly target: 'css' | 'tailwind';
  readonly files: readonly FileMigrationResult[];
  readonly artifacts: readonly PlannedOutputArtifact[];
}
```

Construction freezes the arrays and nested records. An artifact is included only when its original and proposed states differ. Template artifact proposals are always present; a stylesheet proposal may be present or absent, allowing creation and removal without sentinel strings.

Every artifact path is absolute and lexically normalized before entering the plan. The plan permits a template's intentional in-place input/output pair, but rejects a destination shared by separate templates, a stylesheet path shared with any template, ancestor-directory targets, destination symlinks, and a path used by both a project artifact and the JSON report. Paths are ordered with the repository's code-unit comparator over normalized absolute strings. Ordering never depends on directory enumeration, locale, or adapter encounter order.

`FileMigrationResult` continues to describe one scanned template and its conversion results. It gains no file contents. Template bytes live only in the artifact list so reporting cannot become a mutation API.

## Pure template planning

`FileMigrator` is changed from read-plan-write behavior to read-plan-return behavior. It reads and parses one input, analyzes directives, asks the adapter session for conversions, applies source edits in memory, and reparses changed output. It returns its `FileMigrationResult` plus an optional `PlannedOutputArtifact`; it never constructs an `AtomicFileWriter`.

`FolderMigrator` retains deterministic discovery but collects file plans without writing between files. A parse error is a structured file result. As today, it prevents writing that invalid generated template, but all other planning continues so the report remains complete. Any parse error makes the invocation plan non-applicable and therefore prevents every project artifact from being committed.

Input and output may be the same path. In that case the artifact records the input bytes as its original state. For a distinct output, the planner reads the output when it exists so rollback and no-op detection compare against the actual destination, not the input. A present distinct output remains an explicitly selected destination and may be replaced, matching current CLI behavior; its exact planned bytes are protected by the concurrent-modification preflight and transaction backup.

## Adapter sessions

`ConversionAdapter` remains the per-input conversion interface. Invocation-wide state is provided by a narrow session contract rather than global mutable state:

```ts
interface ConversionAdapterSession {
  readonly adapter: ConversionAdapter;
  finalize(): AdapterSessionResult;
}

type AdapterSessionResult =
  { readonly target: 'tailwind' } | { readonly target: 'css'; readonly rules: readonly OwnedCssRule[] };
```

The Tailwind session wraps the existing adapter and finalizes without artifacts. The CSS session owns one `CssArtifactRegistry` for the invocation. Its adapter delegates literal interpretation to `src/flex`, invokes the focused CSS family renderers, registers declarations with base or catalog-derived media context, and returns the generated `className` through the existing `PlannedConversion` contract. Equivalent semantics across files therefore share one class and one rule.

The CSS session's `finalize()` may be called once after all template plans finish. It returns the registry's already sorted, frozen rules. Planning after finalization or finalizing twice is an internal invariant error. No CSS renderer imports template, CLI, report, or filesystem modules.

The session factory accepts the target plus validated breakpoint configuration. It never receives the stylesheet path: output location is an application concern, not conversion behavior.

## Stylesheet planning

`StylesheetPlanner` accepts the normalized stylesheet path and finalized rules. It reads the destination when present, rejects directories and symlinks, and passes existing bytes plus rules to `mergeOwnedStylesheet`.

Its result follows the lifecycle contract:

- absent plus empty output: no artifact;
- absent plus nonempty output: create artifact;
- present plus identical output: no artifact;
- present plus different nonempty output: replace artifact; and
- present plus empty output: remove artifact.

`CssStylesheetError` receives application path context at this boundary. Ownership corruption is a configuration failure and prevents application. Artifact-validation or renderer invariant failures are internal failures. Neither becomes a per-directive conversion result because no individual input can safely repair an ambiguous shared stylesheet.

## Transactional application

`src/transaction/migration-transaction.ts` is the sole multi-file mutation authority. It receives a validated `MigrationPlan` and filesystem operations through an injectable interface.

Application has four phases:

1. **Preflight.** Recheck path uniqueness, destination types, symlinks, parent accessibility, and unchanged originals. If any destination no longer matches the bytes or absence recorded by the plan, abort before staging with a concurrent-modification error.
2. **Stage.** Create required parent directories, then write every proposed present artifact to an exclusive temporary sibling, flush its bytes, close it, and validate staged template bytes with the Angular parser. Proposed removals need no staged content. A staging failure deletes every invocation-owned temporary and leaves destinations untouched.
3. **Commit.** In deterministic artifact order, rename each existing destination to an exclusive backup sibling and rename the staged file into place, or retain only the backup for a proposed removal. Newly created destinations have no backup. A backup name is never reused or overwritten.
4. **Finalize.** After all replacements succeed, remove backups and remaining temporary files. Cleanup failure is reported explicitly; it does not claim that committed project content was rolled back.

If commit fails, rollback runs in reverse committed order. It removes newly created destinations and restores backups to their exact original paths. It then removes all remaining invocation-owned temporary and backup files. The thrown transaction error retains the original failure and lists any paths whose restoration or cleanup could not be confirmed. A rollback error never hides the initiating error.

The transaction registers interruption cleanup only while invocation-owned filesystem artifacts exist. `SIGINT` and `SIGTERM` stop new commits, complete rollback or staging cleanup, restore prior signal handlers, and then surface an interrupted transaction to the CLI. The process is not reported successful while cleanup is pending. Signal behavior is isolated behind an injectable registrar so tests do not mutate global handlers.

The existing `AtomicFileWriter` remains appropriate for the independent JSON report. Template and stylesheet project outputs no longer use it individually.

## CLI and reporting

Commander accepts `tailwind` and `css`. Help text states that CSS requires `--stylesheet`. Configuration validation completes before template discovery and uses concise relative user input in messages rather than leaking internal temporary names.

`MigrationReport.target` becomes `'tailwind' | 'css'`. Schema version remains `1` because the existing shape already identifies a target and the change broadens an enumerated value. An optional stylesheet result is included for CSS runs:

```ts
interface StylesheetReport {
  readonly path: string;
  readonly change: 'created' | 'updated' | 'removed' | 'unchanged';
}
```

The path follows the report's existing path-display policy and contains no temporary or backup path. The terminal presenter adds one deterministic stylesheet line for CSS runs. It uses conditional language during `--dry-run` and completed language after application. Template counts retain their current meaning and do not count the stylesheet as a scanned template.

Expected configuration, stylesheet, concurrent-modification, transaction, and interruption errors return exit code `1`. Completed plans with unresolved directive results retain the existing `0` or `2` policy. A JSON report is written only for a completed plan or completed application; thrown application failures leave an existing report path untouched.

## Error model

Application errors use stable categories:

- `configuration`: invalid target-option combinations, paths, types, aliases, or ownership;
- `parse`: source or generated Angular template failures represented in the report;
- `concurrent-modification`: a destination changed after planning;
- `io`: staging, replacement, sync, or cleanup failure;
- `interrupted`: signal received during application; and
- `internal-invariant`: impossible adapter, artifact, edit, or transaction state.

Typed errors carry a stable code, concise reason, and affected public path where applicable. Absolute paths may be used when necessary to disambiguate filesystem recovery, but temporary and backup filenames are never presented as user actions. Normal mode prints the concise error once; debug mode may additionally print its causal stack.

## Verification

Behavior changes follow test-driven development. Verification includes:

- CSS adapter tests for every scoped Flex family, base state, and all 13 standard aliases;
- one invocation registry shared across multiple templates, deterministic class identity, deduplication, collision failure, and finalization invariants;
- Tailwind session characterization proving unchanged template output;
- pure file and folder planning, including distinct-output originals, parse errors, reparse failures, and no filesystem writes;
- stylesheet creation, update, removal, unchanged, ownership failure, handwritten-byte preservation, LF/CRLF preservation, and idempotence;
- path collision, directory, symlink, report overlap, and concurrent-modification preflight tests;
- injected failures for every staging, backup, replacement, removal, final cleanup, rollback, and rollback-cleanup boundary;
- interruption during staging and commit with restored bytes and no invocation-owned residue;
- single-file and folder CLI fixtures for CSS normal mode and `--dry-run`;
- exact terminal and JSON results for created, updated, removed, and unchanged stylesheets;
- unresolved-input strict exits and configuration failures before discovery;
- packaged CLI execution using both targets;
- byte-for-byte unchanged Tailwind and responsive-image compatibility fixtures;
- architecture tests making the transaction the sole multi-file project mutation authority and keeping conversion layers free of filesystem imports; and
- full repository verification, audit, package inspection, clean-install CLI smoke, whitespace checks, clean status, and forbidden-control-file scans.

The public compatibility fixture includes every supported CSS Flex family at base and standard responsive aliases, repeated semantics across files, class identity collisions through injection, handwritten stylesheet content, stale-rule removal, and a zero-change second run.

## Delivery and compatibility

This is one user-visible feature pull request with a minor Changeset. It adds no runtime dependency and does not publish a package. Documentation updates include the README quick start, CLI option reference, compatibility matrix, target limitations, stylesheet ownership behavior, dry-run review workflow, rollback guarantees, and recovery guidance for the exceptional case where rollback cannot be confirmed.

The CLI continues to default to `tailwind`, continues to write unless `--dry-run` is supplied, and retains current output and exit behavior for Tailwind invocations. The adaptive CLI milestone will separately introduce plan-only default behavior, `--write`, interactive progress, quiet/verbose/color controls, and stdout-reserved JSON mode.

## Implementation sequence

1. Introduce immutable invocation-plan and artifact contracts, then make file and folder migration pure planners.
2. Add invocation-scoped adapter sessions and complete CSS orchestration for the eight supported Flex families.
3. Add stylesheet and path planning with exact lifecycle and ownership error mapping.
4. Implement transaction preflight, staging, deterministic commit, rollback, cleanup, and interruption handling.
5. Wire CSS target configuration, reporting, and the existing Tailwind path through plan/apply orchestration.
6. Add public compatibility fixtures, package smoke coverage, documentation, and the minor Changeset.
7. Harden architecture boundaries and every injected transaction failure, then run the complete release-grade verification set.

Each step is independently reviewable and must leave the Tailwind target green.

## Completion criteria

The slice is complete when `--target css --stylesheet <path>` plans and applies supported Flex conversions across one file or folder; templates and the stylesheet form one validated transaction; dry-run creates nothing; a repeated invocation is byte-idempotent; ownership ambiguity and concurrent modification fail before mutation; every injected mid-commit failure either restores the exact original project or reports the precise unconfirmed recovery paths; current Tailwind and responsive-image behavior remains byte-identical; compatibility documentation describes the Limited CSS surface honestly; and all repository and packaged-command verification gates pass.
