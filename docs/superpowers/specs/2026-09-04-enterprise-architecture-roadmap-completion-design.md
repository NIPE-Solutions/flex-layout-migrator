# Enterprise Architecture Roadmap Completion Design

## Purpose

Complete delivery slices 5 through 9 of the enterprise architecture rewrite in one coordinated branch and one pull request. The work replaces the remaining validation, application, orchestration, and presentation compatibility boundaries; removes superseded code and dependencies; and publishes the final structural and performance evidence.

This remains a behavior-preserving internal refactor. For identical inputs and options, discovered order, converted and preserved bytes, diagnostics, report schema and ordering, terminal output, exit status, plan/write behavior, transaction atomicity, recovery behavior, interruption behavior, and packaged CLI entry points remain unchanged.

The final production route is:

```text
CLI -> Discover -> Analyze -> Render -> Validate -> Apply -> Presentation
```

## Delivery Choice

Use one branch and one final pull request with former slices 5 through 9 retained as independently green commit series and review checkpoints. This removes short-lived compatibility APIs immediately after their last consumer disappears while preserving attributable red-green evidence and reviewable ownership transitions.

Rejected alternatives:

- Separate pull requests for every remaining slice would repeatedly edit the same pipeline composition, continuation, report, and transaction seams and require transitional APIs that have no final architectural value.
- A single unstructured rewrite would make failures difficult to attribute and weaken review. The combined delivery therefore keeps strict internal slice boundaries, focused gates, and commits.
- Pulling product changes into the rewrite would invalidate the compatibility oracle. Capability changes, diagnostic changes, and new CLI behavior remain out of scope.

## Scope and Sequencing

The branch completes five ordered phases:

1. Validation centralization.
2. Transaction decomposition and concrete Apply.
3. CLI pipeline and presentation composition.
4. Dependency and dead-code removal.
5. Final structural and performance evidence.

Each phase starts with failing behavioral and architectural contracts, reaches focused green, and is committed before the next phase. Later phases may remove compatibility types introduced or retained by an earlier phase, but may not bypass its tested public behavior.

No package version, release channel, or supported migration capability changes. A Changeset is unnecessary unless implementation discovers an unavoidable public change; such a discovery stops this program for a separate product decision.

## Final Stage Contracts

### Discover and Analyze

The Slice 3 contracts remain authoritative. Discover owns topology enumeration and normalized file identities. Analyze owns one original source read and one initial Angular parse per template. Later stages consume these immutable results and do not rediscover or reparse original input.

### Render

The Slice 4 contracts remain authoritative. Render owns shared semantic planning, target rendering, and one target-session finalization per invocation. Its final handoff contains immutable render proposals and finalized target artifacts, but not materialized template artifacts or validation decisions.

Render no longer applies source edits, reads destination templates, reparses generated templates, validates output topology, collects CSS references, or plans stylesheet updates. `CompatibilityEditValidator` and its default implementation are deleted once Validate owns those duties.

### Validate

Add a concrete `ValidateProjectStage` that consumes the complete `RenderedProject` and produces the only accepted `ValidatedProjectPlan`. It owns:

- render/analyzed file cardinality, order, and identity invariants;
- source-edit range and overlap validation;
- in-memory materialization of proposed template contents;
- exactly one Angular reparse for each changed proposed template;
- original destination state for distinct output paths without rereading in-place input;
- template artifact construction and equality decisions;
- input, output, stylesheet, report, and artifact topology/collision validation;
- finalized target-session congruence;
- complete-project native-CSS reference collection;
- owned stylesheet reading, ownership validation, merging, and artifact planning; and
- canonical construction of files, artifacts, and stylesheet metadata.

Stored original parse failures remain structured file results and do not undergo editing or reparsing. Generated-template parse failures remain the existing `generated-template-parse-error` results and prevent application without discarding other deterministic results.

Validation is independent of migration mode. Plan and write requests receive the same validated plan object for the same input and target. Validate performs reads and pure computation only; it cannot preflight, stage, commit, roll back, clean up, write reports, or present output.

`ValidatedProjectPlan` retains the rendered/analyzed provenance needed for reporting and invariants but exposes frozen canonical data. Construction fails closed on mismatched targets, paths, file identities, artifacts, stylesheet metadata, duplicate destinations, or incomplete render results.

### Apply

Add a concrete `ApplyProjectStage` that accepts only `ValidatedProjectPlan` plus the already validated migration mode. It owns the decision to skip or apply:

- plan mode preflights a parse-error-free plan and returns the existing plan-only application result;
- write mode with parse errors returns the existing parse-errors skip result without preflight or mutation;
- write mode without parse errors preflights once, applies only when artifacts exist, and returns the existing applied result.

Apply returns an immutable applied-project/result handoff containing the validated plan and application outcome. It does not build reports or format output. No other production stage, renderer, planner, migrator, CLI helper, or presenter may invoke project mutation.

## Transaction Decomposition

Replace the responsibility-heavy transaction implementation with a small coordinator and four focused units:

1. staging creates invocation-owned sibling staging files and records their identities;
2. commit replaces destinations in deterministic artifact order and records completed transitions;
3. rollback restores committed destinations in reverse order while retaining the initiating failure; and
4. cleanup removes invocation-owned staging and backup artifacts after success, failure, or cancellation.

The coordinator owns the state machine, legal transitions, cancellation checkpoints, recovery ordering, and aggregation of initiating, rollback, and cleanup failures. Units receive narrow filesystem ports and cannot decide cross-unit policy. Existing atomic write, mode preservation, symlink/path-type rejection, duplicate detection, signal behavior, fault injection, and error wording remain binding.

Preflight remains read-only and validates the complete canonical plan before mutation. Apply accepts only the exact plan that passed preflight; altered plan identity or contents fail closed. Cancellation prevents new staging or commit work, waits for active recovery, and reports interruption only after cleanup is confirmed or unresolved paths are attached to the existing failure model.

## CLI, Pipeline, and Presentation

Replace `CurrentMigrationPipeline` and the downstream `Migrator` continuation with direct composition of the generic production pipeline:

```text
DiscoverProjectStage.run
AnalyzeProjectStage.run
RenderProjectStage.run
ValidateProjectStage.run
ApplyProjectStage.run
```

Introduce or finalize the CLI-facing `MigrationRunner` as the narrow invocation boundary backed by this pipeline. The CLI validates arguments, constructs ports and stages once, invokes the runner once, maps typed failures through the existing path/error mapper, and resolves the existing exit policy.

Report construction occurs after Apply from immutable stage results. Presentation consumes the report and stage events as an observer. Interactive, plain, quiet, verbose, and JSON output retain exact current behavior. A presenter cannot influence discovery, planning, validation, application, timing decisions, or exit status. Presenter/report-file I/O remains separate from project mutation authority.

Timing uses the existing invocation start and injected clock semantics. Stage-event additions are internal unless they can be proven byte-neutral for every current presenter; public terminal and JSON snapshots remain the acceptance oracle.

## Failure Model

- Expected source limitations remain values, never exceptions.
- Original and generated parse failures retain their current codes, locations, ordering, and application skip behavior.
- Invalid edit ranges, stage identity mismatches, invalid transitions, corrupted finalized sessions, and altered validated plans are internal invariants.
- Configuration and path-topology failures retain their current public categories and wording.
- Stylesheet ownership and unsupported path types retain their current typed errors and paths.
- Apply retains the initiating failure and attaches rollback or cleanup failures without replacing it.
- Error-path remapping happens once at the CLI/pipeline boundary and does not leak into pure stages.

No compatibility fallback may rerun semantics, rendering, validation, or application after a stage failure.

## Dependency and Dead-Code Removal

After the production cutover, delete all unreachable compatibility code identified by resolved-symbol and route analysis, including:

- `CompatibilityEditValidator` and its default implementation;
- `CurrentMigrationPipeline` and compatibility-only continuation types;
- the legacy `Migrator` orchestration class once all responsibilities have moved;
- alias-only `FileMigrator` and the empty `FolderMigrator` tombstone;
- unreachable adapter/session aliases and deprecated target-planning facades; and
- test-only barrels that preserve removed production owner names.

Remove a runtime dependency only after characterization coverage proves the behavior it supplied. The known undeclared `ignore` runtime import must be resolved by either declaring it when production still needs it or replacing it with a covered built-in/local implementation. Record purpose, bundled contribution, license, maintenance state, and replacement rationale for every final runtime dependency.

No service locator, reflection framework, dependency-injection container, plugin system, or new runtime dependency is introduced.

## Architecture Enforcement

Resolved-symbol architecture contracts must prove:

- the concrete route contains each stage exactly once and in order;
- stage handoffs are immutable and accepted only by the next stage;
- Render cannot edit, read destinations, reparse, validate topology, or plan stylesheets;
- Validate cannot render, mutate project files, build reports, or present output;
- Apply accepts only `ValidatedProjectPlan` and is the sole project-mutation caller;
- transaction units expose one filesystem responsibility each and only the coordinator owns recovery policy;
- presenters and report writers cannot acquire planning, validation, transaction, or project-write authority;
- the CLI contains no directive, breakpoint, semantic, rendering, stylesheet, or recovery policy;
- compatibility façades and dead modules are unreachable or deleted as specified; and
- runtime dependencies exactly match declared production imports and documented owners.

Architecture inspection scenarios reuse one immutable TypeScript Program where input identity is equivalent. Negative controls cover aliases, barrels, default exports, dynamic imports, CommonJS imports, bound calls, reflected calls, unrelated same-named methods, and type-only references. Expensive whole-project checks use explicit CI-safe time budgets rather than weakening their assertions.

## Compatibility and Workload Contracts

The complete existing golden and packaged CLI matrices remain binding across Tailwind, native CSS, responsive images, custom breakpoints, plan/write modes, unchanged reruns, reports, parse failures, configuration failures, stylesheet ownership, collisions, transaction faults, and interruption.

Deterministic counters must prove:

- one discovery pass per invocation;
- one original source read and one initial parse per selected template;
- one semantic planning pass per parsed template;
- one target render per converted family;
- one render session and one finalization per invocation;
- one validation reparse only for each changed proposed template;
- no duplicate destination read for in-place templates;
- no stylesheet read or parse for Tailwind;
- one complete CSS reference-collection pass using proposed project state;
- one transaction preflight when required by existing mode/error behavior;
- no project writes in plan mode or parse-error write mode; and
- deterministic stage, artifact, commit, rollback, cleanup, result, and diagnostic order.

Plan and write parity tests compare validated migration decisions before application. Write-only differences are limited to the existing application result and filesystem effects.

## Internal Review Checkpoints

Although delivered in one pull request, each phase receives a focused review before the next phase proceeds:

1. Validate ownership, lifecycle, failure semantics, CSS planning, and parity.
2. Transaction unit boundaries, state machine, fault injection, and cancellation.
3. Production route, CLI composition, reporting, presentation, and exit behavior.
4. Deletion safety, dependency audit, public imports, and packaged artifacts.
5. Final whole-branch spec compliance, code quality, compatibility, and evidence honesty.

Review findings are fixed before the next checkpoint when they affect that phase's contract. The final whole-branch review receives one bounded fix wave followed by a scoped re-review; unresolved critical or important findings block pull-request handoff.

## Final Evidence

Update the enterprise architecture document to mark slices 5 through 8 implemented and add a final maintenance report for slice 9. The report records:

- final module and authority graph;
- production TypeScript file and internal edge counts;
- policy owners and side-effect owners;
- runtime dependency and license audit;
- read, parse, render, validate, preflight, stage, write, rollback, and cleanup counters;
- package contents and supported Node execution;
- exact public parity results;
- retained debt, if any, with explicit ownership; and
- benchmark results against the Slice 1 baseline.

Benchmark the unchanged corpus with one warm-up and at least five recorded samples on the same machine. Report median, range, and median absolute deviation for product scenarios and architecture tests. Timing is observational unless a repeatable improvement is demonstrated; neutral or negative results are published without an improvement claim. CI records benchmarks but does not enforce noisy wall-clock thresholds.

## Verification

Every phase follows strict red-green-refactor. Final acceptance requires:

- focused unit and integration gates for each new stage and transaction unit;
- all architecture, compatibility, workload, transaction fault, interruption, CLI, report, and package tests;
- clean `npm run clean && npm run verify`;
- explicit packaged CLI execution and package-content validation;
- final architecture inventory and dependency audit;
- the five-sample benchmark corpus;
- no unrelated generated or formatting changes;
- a clean tracked worktree; and
- an independent final review with no open critical or important findings.

## Acceptance Criteria

1. Every production invocation executes Discover, Analyze, Render, Validate, and Apply exactly once and in order.
2. Validate is the sole owner of edit materialization, changed-template reparse, topology/collision checks, CSS reference collection, stylesheet planning, and canonical validated-plan construction.
3. Apply accepts only a validated plan and is the sole caller of project mutation.
4. Transaction staging, commit, rollback, and cleanup have focused owners under one recovery coordinator while preserving all existing atomicity and interruption behavior.
5. CLI composition and presentation contain no migration or recovery policy, and presenters cannot alter decisions or application.
6. Compatibility façades, dead aliases, tombstones, and obsolete policy modules are removed after their final consumers disappear.
7. Runtime dependencies are declared, used, documented, licensed, and minimal without adding a new runtime dependency.
8. Public behavior and deterministic workload counters match the established compatibility contract.
9. Final structural and five-sample performance evidence is complete and makes no unsupported improvement claim.
10. Full verification, packaged execution, clean-tree checks, and independent final review pass.
