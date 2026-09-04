# Enterprise Discovery and Analysis Design

## Purpose

Slice 3 makes Discover and Analyze the production owners of file topology, template reads, initial Angular parsing, and Flex-Layout input analysis. It replaces the corresponding work currently performed inside `Migrator`, `FolderMigrator`, and `FileMigrator` without changing supported migrations, diagnostics, output bytes, ordering, reports, modes, or exit behavior.

This slice advances the approved pipeline:

```text
Discover -> Analyze -> compatibility rendering/validation/application
```

Render, Validate, Apply, reporting, and transaction decomposition remain owned by their current production implementations until later delivery slices. There must never be an observational Discover/Analyze prepass followed by duplicate legacy discovery or parsing.

## Design choice

Use a move-and-delegate transition. Introduce production `DiscoverStage` and `AnalyzeStage` implementations, route `CurrentMigrationPipeline` through them, and adapt the existing migration continuation to consume the completed `AnalyzedProject`. Remove discovery, source-read, initial-parse, and input-analysis responsibility from the continuation in the same pull request.

Rejected alternatives:

- An observational prepass would create two policy owners and violate the one-read/one-parse performance contract.
- A complete five-stage cutover would combine Slices 3 through 7, expand risk, and prevent independent review of stage ownership.
- Leaving folder ordering or file validation in the legacy continuation would make the new manifest advisory rather than authoritative.

## Discover ownership

Discover accepts a `MigrationInvocation` and returns the immutable `ProjectManifest` contract introduced in Slice 2. It owns:

- validating whether the input is a supported HTML file or directory;
- validating single-file output extension and input/output topology;
- loading the applicable `.gitignore` rules once per invocation;
- recursively finding eligible `.html` templates for folder input;
- excluding ignored paths and invocation-owned non-template destinations such as a selected stylesheet;
- ordering discovered templates by UTF-16 code units, independent of host locale;
- mapping each input to its deterministic output path;
- retaining the invocation's raw paths for public compatibility and its existing canonical paths for stable identity;
- returning ordered canonical input/output pairs and optional configured artifact identities needed by later collision validation.

Discover may call filesystem metadata and directory-enumeration ports. It must not read template contents, parse Angular templates, create conversion sessions, render edits, write files, or publish reports.

Filesystem access is injected through narrow, concrete ports. Production adapters may use Node filesystem APIs and the existing ignore implementation. Tests use complete in-memory or temporary-directory behavior at the port boundary rather than mocking Discover's decisions.

Expected public errors remain byte-compatible. Unsupported input kinds and invalid extensions retain their existing categories and messages. I/O errors propagate from the Discover boundary and are wrapped internally with stage metadata only; that metadata does not enter terminal or JSON output.

## Analyze ownership

Analyze accepts one authoritative `ProjectManifest` and returns the immutable `AnalyzedProject` contract introduced in Slice 2. For each manifest template, in manifest order, it:

1. reads the source contents exactly once;
2. parses the original source exactly once with `AngularTemplateParser`;
3. runs `TemplateAnalyzer` exactly once when parsing succeeds;
4. records the canonical file identity, original contents, parsed element model, located Flex-Layout inputs, and parse diagnostics;
5. preserves parse failures as data for the existing conservative migration outcome.

Analyze is target-neutral. It does not receive a conversion adapter or target session and does not create Tailwind candidates, CSS declarations, edits, artifacts, reports, or writes. A parse-error file remains in the ordered result and cannot be reparsed by the compatibility continuation as an attempt to recover.

Concurrency may be used only if result order remains exactly the manifest order and the same fail/settlement behavior is preserved. The initial implementation should prefer straightforward ordered execution unless benchmark evidence proves bounded concurrency useful.

The completed handoff owns defensive copies of project records and exposes frozen arrays and records according to the Slice 2 contracts. Opaque Angular compiler values may retain identity only where the established handoff contract explicitly allows it.

## Compatibility continuation

`CurrentMigrationPipeline` becomes the sole production composition point for this slice:

```text
MigrationInvocation
  -> DiscoverStage.run
  -> AnalyzeStage.run
  -> existing migration continuation
  -> MigrationReport
```

The continuation receives the authoritative `AnalyzedProject`, the invocation-scoped conversion session, and the unchanged migration options. It may own rendering, session finalization, stylesheet planning, validation, transaction application, and report construction. It must not stat or rediscover the invocation, load `.gitignore`, reread original templates, initially parse original source, or rerun `TemplateAnalyzer`.

The continuation may reparse each changed proposed template where existing validation requires it. That validation reparse is distinct from the initial Analyze parse and remains until Slice 5. Native CSS reference collection may read a distinct existing destination or inspect proposed contents as today, but it must reuse already available original contents for in-place unchanged templates instead of rereading the manifest input.

`FileMigrator` may temporarily remain as the compatibility renderer, but its production entry must accept one analyzed-template value and must not own original source I/O, initial parsing, or analysis. `FolderMigrator` must no longer own production discovery; if retained for compatibility tests, it cannot be reachable from the production authority graph and receives a named removal owner in Slice 8.

The adapter session remains exactly one invocation-scoped session. No new adapter instance or session may be created per template.

## Data and failure flow

- Discover failure prevents Analyze and all later work.
- A template read failure is an Analyze-stage I/O failure and prevents rendering or application.
- An Angular parse failure is represented in the analyzed file result, preserving current structured diagnostics and preventing project application according to existing behavior.
- Analyzer limitations remain structured results, not thrown exceptions.
- Rendering and downstream failures retain their current public mapping through the compatibility façade.
- Plan and write modes consume the same discovered and analyzed handoffs. Mode cannot influence discovery, reads, parsing, or semantic input location.
- Cancellation behavior remains unchanged; this slice introduces no new signal owner.

## Architecture enforcement

Semantic architecture tests must prove:

- the CLI invokes only `CurrentMigrationPipeline.run`;
- `CurrentMigrationPipeline` invokes the concrete Discover and Analyze stages before the compatibility continuation;
- only Discover imports filesystem topology/discovery and ignore-loading authorities;
- only Analyze imports original-template read, `AngularTemplateParser`, and `TemplateAnalyzer` authorities within the new pipeline path;
- Analyze has no adapter, renderer, transaction, report-writer, or filesystem-write dependency;
- the production continuation cannot invoke `stat`, directory discovery, `.gitignore` loading, initial parser, or analyzer authorities;
- the exact project-write authority graph remains CLI to pipeline façade to migrator/continuation to `MigrationTransaction.apply` until later slices;
- renderers and presenters remain free of filesystem mutation authority.

Tests must inspect semantic provenance and call authority, not source substrings alone. Legitimate test fixtures and unrelated same-named methods must remain negative controls.

## Compatibility and performance acceptance

The existing compatibility contract is binding. Acceptance requires unchanged results for:

- single-file and nested-folder migration;
- UTF-16 discovery order;
- `.gitignore`, output, stylesheet, and report exclusions;
- Tailwind and native CSS targets;
- plan and write modes;
- responsive-image opt-in behavior;
- parse errors, unsupported inputs, I/O errors, and interruption;
- terminal output, JSON reports, exit codes, and packaged CLI entry points;
- stylesheet ownership, reference retention, and byte-idempotent reruns.

Deterministic counters must prove, per invocation:

- one discovery pass;
- one original source read per discovered template;
- one initial Angular parse per discovered template;
- one input-analysis call per successfully parsed template and none for parse-error templates;
- one validation reparse per changed proposed template and none for unchanged templates;
- one target session;
- no project writes in plan mode.

The checked-in benchmark corpus must be run before and after the slice. Wall-clock results are observational and do not gate on noisy thresholds. Any performance claim requires at least five measured samples on the same machine; otherwise the slice reports only the deterministic counter improvement.

## Scope boundaries

This slice does not:

- extract shared semantic policy from adapters;
- replace target rendering;
- centralize final plan validation;
- decompose transaction staging, commit, rollback, or cleanup;
- redesign presentation or public errors;
- remove the full compatibility façade;
- add dependencies, a service locator, a DI framework, a Changeset, or new migration behavior.

The Slice 2 `PipelineStageError` public mapping remains deferred until Slice 7 production-wires the complete staged coordinator. Temporary compatibility APIs introduced here must name Slice 4 or Slice 8 as their removal point.

## Verification and delivery

Implementation follows strict red-green-refactor cycles. Each independently reviewable task receives spec-compliance and code-quality review. The final branch requires:

- focused stage, handoff, continuation, architecture, and workload-counter tests;
- all existing public compatibility and golden tests;
- packaged CLI execution;
- fresh architecture inventory and benchmark evidence using existing schemas;
- `npm run clean && npm run verify`;
- clean dependency, lockfile, Changeset, diff, and worktree checks;
- an independent whole-branch review before PR creation.

The pull request is internal architecture work and receives no Changeset unless review identifies an observable behavior change, in which case that change is removed from this slice rather than released here.
