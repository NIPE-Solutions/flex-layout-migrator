# Enterprise architecture rewrite

## Purpose

This program restructures the version 2 migration engine around explicit project stages after the Tailwind, native CSS, responsive-image, transaction, and CLI boundaries have been proven in production code. The rewrite improves maintainability and measurable throughput without changing supported migrations or public behavior.

The target pipeline is:

```text
Discover -> Analyze -> Render -> Validate -> Apply
```

Each stage has one owner, consumes an immutable result from the preceding stage, and returns data rather than mutating another stage. The CLI composes the pipeline and presents its events. It does not own conversion policy. Apply remains the only project-file mutation authority.

The work is delivered as a sequence of small, independently mergeable pull requests. No pull request may leave two competing production pipelines, weaken conservative migration behavior, or require a flag day across all stages.

## Compatibility contract

The rewrite preserves the following observable behavior for identical inputs and options:

- discovered template order;
- converted and preserved source bytes;
- generated Tailwind classes and native CSS;
- diagnostic codes, reasons, suggestions, locations, and ordering;
- plan and write behavior;
- terminal output, JSON schema, progress semantics, and exit codes;
- stylesheet ownership, transaction ordering, rollback, and cleanup behavior;
- interruption behavior; and
- packaged CLI entry points and supported Node.js version.

Existing public golden and compatibility fixtures are the primary parity oracle. A slice that intentionally changes any item above is a product change outside this rewrite and requires a separate design, Changeset, and pull request.

Internal types may change. Temporary compatibility facades are allowed only when they enable an independently mergeable slice, have a named removal task, and do not duplicate policy.

## Architectural principles

### Immutable stage handoffs

Every stage result is a readonly data model. A stage may allocate private working state while it runs, but it does not expose mutable collections or retain authority over a completed result. File contents and normalized paths travel with stable file identities so later stages do not rediscover or reinterpret them.

### One owner per policy

Breakpoint classification, responsive precedence, semantic dependency closure, target capability, artifact identity, diagnostic construction, and transaction recovery each have one production owner. Tailwind and CSS renderers share target-neutral semantic planning but retain their own output syntax and limitations.

Shared code is extracted only when both real targets use the same rule. Similar-looking target behavior with different safety constraints remains separate.

### Ports at side-effect boundaries

Filesystem discovery, source reads, clock access, signal registration, hashing, and writes sit behind narrow interfaces owned by the stage that needs them. Constructors receive concrete ports, not a service locator or general dependency-injection container. Pure semantic and rendering modules do not import filesystem APIs.

### Fail closed

Unknown states, invalid stage transitions, incomplete target results, and unvalidated artifacts are internal invariants. Unsupported or ambiguous source remains unchanged with the existing structured diagnostic. Internal errors never silently fall back to a partial migration.

## Stage design

### Discover

Discover accepts the normalized invocation paths and returns a deterministic `ProjectManifest`. The manifest contains ordered input/output file pairs, optional stylesheet paths, and identities needed for collision validation. It performs path and topology validation once.

Discover may inspect the filesystem but never reads template contents and never writes. Single-file and folder inputs use the same manifest contract.

### Analyze

Analyze reads every manifest template once, parses it once with the Angular compiler, and produces an ordered `AnalyzedProject`. Each analyzed template contains its original contents, parsed element model, located Flex-Layout inputs, and parse diagnostics.

Analysis is target-neutral. It does not create Tailwind classes, CSS declarations, source edits, reports, or files. Parse failures remain attached to their file identity and do not permit a later stage to reinterpret raw source.

### Render

Render consumes `AnalyzedProject` through one invocation-scoped target session. Shared semantic planners resolve supported literal directives, responsive activation, dependencies, and preservation decisions. Target renderers then produce immutable template edit proposals and optional stylesheet artifacts.

Tailwind rendering owns Tailwind candidate syntax, compiler-backed property ownership, and Tailwind-specific conflict rules. Native CSS rendering owns declaration serialization, artifact identity, stylesheet ownership, and CSS-specific limitations. Responsive images remain a separately enabled renderer because they change HTML structure rather than layout styling.

The render result is a complete `RenderedProject`; renderers cannot write files or publish reports.

### Validate

Validate consumes the complete rendered project and returns either a `ValidatedProjectPlan` or structured failures. It validates source-edit ranges, output topology, generated artifact collisions, stylesheet ownership, and target-session finalization. It materializes proposed template contents in memory and reparses each changed template exactly once.

Only a `ValidatedProjectPlan` can be passed to Apply. Plan-only mode returns the same validated plan data used by write mode, ensuring the modes cannot diverge in migration decisions.

### Apply

Apply consumes a validated plan and coordinates four focused transaction units:

1. staging writes invocation-owned sibling files;
2. commit replaces destinations in deterministic order;
3. rollback restores already committed destinations in reverse order; and
4. cleanup removes invocation-owned staging and backup artifacts.

A small transaction coordinator owns state transitions and recovery decisions. Each unit owns one filesystem responsibility and exposes enough evidence for the coordinator to report unconfirmed recovery paths. No renderer, planner, migrator, presenter, or CLI command may invoke project mutation directly.

### Presentation

Pipeline events describe real stage starts, completions, counts, warnings, and final results. Interactive, plain-text, quiet, verbose, and JSON presenters observe these events independently. Presenter failure or formatting cannot alter the plan or application decision.

The CLI validates arguments, constructs ports and stages, invokes the pipeline once, and maps its typed result to the existing exit policy. It contains no directive, breakpoint, rendering, or recovery rules.

## Error model

Stage errors retain the existing public categories: configuration, parse, semantic conflict, target limitation, I/O, and internal invariant. Internal errors additionally carry their stage for debugging, but stage metadata is not added to public JSON during this behavior-preserving program.

Expected source limitations are values in stage results, not thrown exceptions. I/O failures and internal invariants throw typed errors at their owning boundary. Apply retains the initiating failure and attaches rollback or cleanup failures without hiding either. Cancellation prevents new work, waits for active recovery, and produces the existing interrupted outcome only after cleanup is confirmed or unresolved paths are reported.

## Performance contract

The baseline source of truth is `docs/maintenance/2026-09-03-enterprise-architecture-baseline.md`.

The first pull request establishes a checked-in representative benchmark corpus and runner before optimization. It measures at least:

- single-file Tailwind plan;
- multi-file Tailwind plan;
- multi-file native CSS plan with an existing owned stylesheet;
- write mode with no changes;
- Angular parse count per template;
- peak resident memory for the largest corpus; and
- architecture-test runtime separately from product runtime.

Timing measurements use warm-up runs followed by multiple recorded samples and report the median and spread. CI records benchmark results but does not fail on noisy wall-clock thresholds. Deterministic structural counters, including reads, parses, renders, reparses, and writes, are hard test assertions.

Each optimization pull request compares the same corpus before and after. It must not regress any deterministic counter. A claimed timing improvement requires a repeatable median improvement across at least five measured runs on the same machine. The final program report publishes baseline and final measurements, including neutral or negative results.

The intended structural performance properties are:

- one discovery pass per invocation;
- one source read and one initial Angular parse per template;
- one additional Angular parse only for each changed proposed template;
- one target session per invocation;
- no stylesheet parse when the target cannot produce a stylesheet;
- no project writes in plan mode; and
- no repeated TypeScript project construction inside one architecture-test scenario when an equivalent inspection can be shared safely.

## Dependency policy

Every runtime dependency must correspond to a documented production boundary and be imported by production code. The audit records package purpose, bundled contribution, license, maintenance status, and whether a Node.js built-in can replace it without reducing clarity or correctness.

A dependency is removed only with characterization coverage for the behavior it supplied. No new runtime dependency, plugin system, reflection framework, or dependency-injection container is introduced by the rewrite. Development dependencies remain pinned where reproducible compiler or packaging behavior requires it.

## Delivery slices

### 1. Baseline and characterization

Add the benchmark corpus, structural counters, output snapshots, architectural dependency map, and a written baseline. This slice changes no production behavior and establishes the evidence used to accept later work.

### 2. Project plan and pipeline shell

Introduce immutable manifest, analyzed-project, rendered-project, and validated-plan contracts plus the pipeline coordinator. Adapt the existing migrator behind these contracts without duplicating migration policy.

`CurrentMigrationPipeline` is the single temporary compatibility façade over `Migrator`. Slices 3–6 replace its delegated responsibilities with concrete stages; Slice 7 removes the façade after the CLI-facing `MigrationRunner` is backed by `MigrationPipeline`.

### 3. Discovery and analysis

Move file topology, reads, Angular parsing, and input analysis into their dedicated stages. Remove repeated construction and parsing while retaining deterministic ordering and current diagnostics.

Implemented on the production route. `CurrentMigrationPipeline` now composes `DiscoverProjectStage`, then `AnalyzeProjectStage`, then the existing `Migrator` continuation. Discover is authoritative for input topology, ignore loading, deterministic ordering, exclusions, and input/output mapping. Analyze is authoritative for each original template read, initial Angular parse, and Flex-Layout input analysis.

Render through Apply remain on the compatibility continuation. `AnalyzedFileMigrator` owns rendering and its named changed-template validation parse; `Migrator` retains session finalization, native-CSS reference collection, stylesheet planning, report construction, and transaction coordination. The alias-only `FileMigrator` compatibility module and the empty `FolderMigrator` tombstone are unreachable from the production route and are scheduled for deletion in Slice 8.

### 4. Shared semantics and target rendering

Move target-neutral responsive and dependency policy out of the adapters, then reduce Tailwind and CSS adapters to target rendering and capability decisions. Preserve distinct target constraints and add cross-target semantic parity contracts.

### 5. Validation

Centralize edit, topology, collision, target-finalization, and Angular reparse validation. Make the validated plan the sole Apply input and prove plan/write decision parity.

### 6. Transaction decomposition

Extract staging, commit, rollback, and cleanup from the current transaction class into focused units. Preserve atomicity, recovery evidence, signal behavior, fault-injection coverage, and the single-mutation-authority architecture boundary.

### 7. CLI and presentation composition

Reduce CLI and migrator orchestration to pipeline composition. Ensure presenters remain observers and remove compatibility facades made obsolete by the preceding slices.

### 8. Dependency and dead-code removal

Remove superseded modules, duplicated policies, unused dependencies, and temporary facades. Update architecture contracts to enforce the final dependency direction.

### 9. Final structural and performance report

Run full verification, package checks, dependency and license audits, the complete benchmark corpus, and output parity comparison. Document before/after module responsibilities, file sizes, dependency changes, parse/read/write counters, timing distributions, and any deliberately retained debt.

## Testing and review

Every implementation slice follows test-driven development and receives an independent spec-compliance and code-quality review before merge. Required evidence includes:

- focused unit tests for each new stage and port;
- characterization and golden parity tests across both targets, plan/write modes, responsive images, reports, errors, and interruption;
- architecture tests enforcing dependency direction and the sole mutation authority;
- fault injection at every transaction boundary;
- deterministic structural performance assertions;
- benchmark results where performance is claimed;
- complete `npm run verify` from a clean build state;
- packaged CLI execution; and
- clean diff and worktree checks.

Refactors use move-and-delegate transitions where practical: add a tested owner, redirect existing callers, then delete the former owner in the same slice or its explicitly named removal slice. Reviewers reject speculative abstractions, policy duplication, unmeasured performance claims, and broad compatibility shims.

## Documentation and release impact

Intermediate slices are internal refactors and do not receive Changesets unless they change documented user behavior, which this program forbids. The architecture documents are updated as ownership moves. The final report becomes evidence for the subsequent stable-release readiness milestone.

The program does not publish a package, change the beta version, add migration capabilities, relax conservative boundaries, redesign terminal presentation, or resolve compatibility gaps reserved for the stable-release audit.

## Completion criteria

The rewrite is complete when all invocations use the explicit five-stage pipeline; each template is read and initially parsed once; target-neutral policy has one owner; renderers and presenters are free of filesystem mutation authority; Apply accepts only validated plans and delegates to focused recovery units; obsolete paths and dependencies are removed; public output parity passes; complete verification and packaged execution pass; and the final evidence report records the structural and measured performance outcome.
