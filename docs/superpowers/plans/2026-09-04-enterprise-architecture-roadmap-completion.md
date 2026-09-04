# Enterprise Architecture Roadmap Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete enterprise architecture rewrite slices 5–9 so every invocation uses explicit Discover, Analyze, Render, Validate, and Apply stages, with obsolete compatibility code removed and final evidence published.

**Architecture:** Introduce canonical Validate and Apply handoffs, then move transaction mechanics into focused units under one coordinator. Cut the CLI over to the generic pipeline, remove the compatibility migrator/facades and unused dependencies, and finish with executable architecture, parity, package, dependency, and performance evidence.

**Tech Stack:** TypeScript 7, Node.js 24, Angular compiler, Vitest 4 with V8 coverage, tsup, ESLint, Prettier, npm package checks, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-04-enterprise-architecture-roadmap-completion-design.md`

## Global Constraints

- Preserve exact public template bytes, stylesheet bytes, diagnostics, report JSON, terminal output, ordering, exit status, plan/write decisions, rollback behavior, interruption behavior, and packaged CLI entry points.
- Keep one discovery pass, one original source read and initial parse per template, one semantic planning pass per parsed template, one target render per converted family, one render session/finalization per invocation, and one validation reparse only per changed proposed template.
- Plan mode and parse-error write mode perform no project writes.
- Add no runtime dependency, service locator, reflection framework, dependency-injection container, plugin system, package version change, or Changeset.
- Expected source limitations remain values; corrupt stage state and illegal transitions fail closed through existing typed errors.
- Every task follows RED → verify RED → minimal GREEN → focused verification → review → commit.
- Preserve unrelated user files and existing untracked `.DS_Store` files outside this isolated worktree.

---

### Task 1: Concrete Validate Stage and Canonical Plan

**Files:**
- Create: `src/pipeline/validate/validate-project.stage.ts`
- Create: `src/pipeline/validate/validate-project.stage.spec.ts`
- Create: `src/pipeline/validate/template-proposal.validator.ts`
- Create: `src/pipeline/validate/template-proposal.validator.spec.ts`
- Create: `src/pipeline/validate/css-reference.collector.ts`
- Create: `src/pipeline/validate/css-reference.collector.spec.ts`
- Modify: `src/pipeline/migration-pipeline.ts`
- Modify: `src/pipeline/validated-project-plan.ts`
- Modify: `src/pipeline/validated-project-plan.spec.ts`
- Modify: `src/pipeline/render/render-project.stage.ts`
- Modify: `src/pipeline/render/render-project.stage.spec.ts`
- Delete: `src/pipeline/render/compatibility-edit.validator.ts`
- Delete: `src/pipeline/render/compatibility-edit.validator.spec.ts`
- Modify: `src/migrator/stylesheet.planner.ts`
- Modify: `src/migrator/stylesheet.planner.spec.ts`
- Modify: `src/migrator/migrator.ts`
- Modify: `src/migrator/migrator.spec.ts`
- Modify: `src/pipeline/current-migration.pipeline.ts`
- Modify: `src/pipeline/current-migration.pipeline.spec.ts`
- Modify: `test/architecture/enterprise-pipeline-boundary.test.ts`
- Modify: `test/architecture/enterprise-pipeline-shell-boundary.test.ts`
- Modify: `test/architecture/migration-transaction-boundary.test.ts`
- Modify: `test/performance/migration-workload-counter.test.ts`

**Interfaces:**
- Consumes: `RenderedProject`, `SourceEditor`, `TemplateParser`, `DestinationTemplateSource`, `StylesheetPlanner`, `validateMigrationPaths`.
- Produces: `ValidateStage.run(rendered: RenderedProject): Promise<ValidatedProjectPlan>` and `ValidateProjectStage` implementing it.
- Produces: `TemplateProposalValidator.validate(template: AnalyzedTemplate, file: RenderedTemplateFile): Promise<FileMigrationPlan>`.
- Produces: `CssReferenceCollector.collect(rendered: RenderedProject, files: readonly FileMigrationPlan[]): Promise<OwnedCssReferences>`.
- The transitional continuation changes from `Migrator(RenderedProject)` to `Migrator(ValidatedProjectPlan)`.

- [ ] **Step 1: Write failing Render/Validate ownership tests**

Add tests proving Render returns unresolved edit proposals without applying edits or reparsing, and Validate alone materializes them:

```ts
test('renders proposals without edit application or validation parsing', async () => {
  const edits = [{ start: 0, end: 3, replacement: 'new' }];
  const parser = { parse: vi.fn() };
  const rendered = await renderStage({ parser }).run(analyzedProjectFixture());

  expect(rendered.files[0]?.edits).toEqual(edits);
  expect(parser.parse).not.toHaveBeenCalled();
});

test('materializes and reparses each changed template exactly once', async () => {
  const parser = { parse: vi.fn(() => parsedTemplateFixture('new')) };
  const validated = await validateStage({ parser }).run(renderedProjectFixture({ changed: true }));

  expect(parser.parse).toHaveBeenCalledTimes(1);
  expect(validated.plan.artifacts[0]?.proposed).toEqual({ status: 'present', contents: 'new' });
});
```

Update architecture assertions so `SourceEditor.apply`, `ChangedTemplateValidation.parse`, `DestinationTemplateSource.read`, `validateMigrationPaths`, CSS reference collection, and `StylesheetPlanner.plan` are forbidden in Render and required in Validate.

- [ ] **Step 2: Run the focused RED gate**

Run:

```bash
npx vitest run src/pipeline/render/render-project.stage.spec.ts src/pipeline/validate/validate-project.stage.spec.ts src/pipeline/validated-project-plan.spec.ts test/architecture/enterprise-pipeline-boundary.test.ts test/architecture/enterprise-pipeline-shell-boundary.test.ts
```

Expected: FAIL because `ValidateProjectStage` and proposal-only Render files do not exist and validation authorities remain in Render/Migrator.

- [ ] **Step 3: Define proposal-only Render and Validate contracts**

Change `RenderedProject` file entries to carry identity, ordered conversion results, and edits without template artifact decisions. Define the stage boundary in `migration-pipeline.ts`:

```ts
export interface ValidateStage {
  run(rendered: RenderedProject): Promise<ValidatedProjectPlan>;
}

export interface RenderedTemplateFile {
  readonly inputPath: string;
  readonly outputPath: string;
  readonly edits: readonly SourceEdit[];
  readonly results: readonly ConversionResult[];
}
```

Keep stored original parse failures as edit-free entries with existing parse-error results.

- [ ] **Step 4: Move template proposal validation**

Implement `TemplateProposalValidator` by moving, not duplicating, the current compatibility validator behavior:

```ts
export class TemplateProposalValidator {
  constructor(
    private readonly validationParser: TemplateParser = new AngularTemplateParser(),
    private readonly destinationTemplates: DestinationTemplateSource = nodeDestinationTemplateSource,
  ) {}

  async validate(template: AnalyzedTemplate, rendered: RenderedTemplateFile): Promise<FileMigrationPlan> {
    // preserve original parse errors; apply edits; reject invalid ranges;
    // skip reparse when bytes are unchanged; reparse changed bytes once;
    // read only distinct destinations; construct canonical template artifact.
  }
}
```

Retain exact invalid-edit and generated-template parse diagnostics. Delete `CompatibilityEditValidator` after all imports move.

- [ ] **Step 5: Move CSS reference collection and stylesheet planning**

Extract the existing complete-project reference logic from `Migrator.referencedCssClasses` into `CssReferenceCollector`. It must prefer proposed template artifacts, reuse analyzed source for unchanged in-place outputs, read distinct unchanged destinations once, preserve incomplete authority for dynamic class bindings, and parse proposed/reference source under the existing role name.

Implement Validate CSS planning:

```ts
if (rendered.session.target === 'css') {
  const references = await this.cssReferences.collect(rendered, files);
  const stylesheetArtifact = await this.stylesheetPlanner.plan(stylesheetPath, rendered.session.rules, references);
  // append artifact and exact StylesheetMigrationResult metadata
}
```

Tailwind must never invoke the collector or stylesheet planner.

- [ ] **Step 6: Centralize topology and canonical invariants**

In `ValidateProjectStage.run`:

```ts
await validateMigrationPaths({ templates: renderedFileIdentities, stylesheetPath, reportPath });
const files = await validateTemplatesInOrder(rendered);
const plan = migrationPlan({ target: rendered.session.target, files: files.map(item => item.file), artifacts });
await validateMigrationPaths({ templates: plan.files, stylesheetPath, reportPath });
return validatedProjectPlan({ rendered, plan, stylesheet });
```

Strengthen `validatedProjectPlan` to canonicalize and freeze target, file identity/order, template artifacts, stylesheet metadata, and finalized-session congruence. No migration mode enters Validate.

- [ ] **Step 7: Redirect the compatibility continuation**

Temporarily compose `RenderProjectStage -> ValidateProjectStage -> Migrator`. Change `Migrator` to accept `ValidatedProjectPlan`, remove validation, CSS reference, stylesheet, and path-topology responsibilities, and consume only `validated.plan` plus `validated.stylesheet`.

- [ ] **Step 8: Run focused GREEN and parity gates**

Run:

```bash
npx vitest run src/pipeline/render src/pipeline/validate src/pipeline/validated-project-plan.spec.ts src/migrator/migrator.spec.ts src/migrator/stylesheet.planner.spec.ts test/architecture/enterprise-pipeline-boundary.test.ts test/architecture/enterprise-pipeline-shell-boundary.test.ts test/architecture/migration-transaction-boundary.test.ts test/compatibility test/performance/migration-workload-counter.test.ts
npm run typecheck
npm run lint
```

Expected: all pass; counters show validation reparses only for changed proposals and no Tailwind stylesheet work.

- [ ] **Step 9: Review and commit Task 1**

Review the task diff against the spec, fix critical/important findings, rerun the focused gate, then commit:

```bash
git add src test
git commit -m "refactor: centralize project validation"
```

---

### Task 2: Focused Transaction Units and Concrete Apply Stage

**Files:**
- Create: `src/pipeline/apply/apply-project.stage.ts`
- Create: `src/pipeline/apply/apply-project.stage.spec.ts`
- Create: `src/pipeline/applied-project.ts`
- Create: `src/pipeline/applied-project.spec.ts`
- Create: `src/transaction/staging.unit.ts`
- Create: `src/transaction/staging.unit.spec.ts`
- Create: `src/transaction/commit.unit.ts`
- Create: `src/transaction/commit.unit.spec.ts`
- Create: `src/transaction/rollback.unit.ts`
- Create: `src/transaction/rollback.unit.spec.ts`
- Create: `src/transaction/cleanup.unit.ts`
- Create: `src/transaction/cleanup.unit.spec.ts`
- Modify: `src/transaction/migration-transaction.ts`
- Modify: `src/transaction/migration-transaction.spec.ts`
- Modify: `src/transaction/migration-transaction.concurrency.spec.ts`
- Modify: `src/transaction/transaction-signal.registrar.spec.ts`
- Modify: `src/pipeline/migration-pipeline.ts`
- Modify: `src/migrator/migrator.ts`
- Modify: `src/migrator/migrator.spec.ts`
- Modify: `test/architecture/migration-transaction-boundary.test.ts`
- Modify: `test/performance/migration-workload-counter.test.ts`

**Interfaces:**
- Consumes: `ValidatedProjectPlan`, `MigrationMode`, current `MigrationTransaction.preflight/apply` behavior.
- Produces: `ApplyStage.run(validated: ValidatedProjectPlan): Promise<AppliedProject>`.
- Produces: focused `StagingUnit`, `CommitUnit`, `RollbackUnit`, and `CleanupUnit` ports/results consumed only by `MigrationTransaction`.

- [ ] **Step 1: Write failing Apply decision tests**

```ts
test.each([
  ['plan', false, 'skipped', 'plan-only', 1, 0],
  ['write', true, 'skipped', 'parse-errors', 0, 0],
  ['write', false, 'applied', undefined, 1, 1],
] as const)('applies the canonical validated plan for %s mode', async (mode, parseErrors, status, reason, preflights, applies) => {
  const transaction = transactionSpy();
  const result = await new ApplyProjectStage(mode, transaction).run(validatedFixture({ parseErrors }));
  expect(result.application).toEqual(reason ? { status, reason } : { status });
  expect(transaction.preflight).toHaveBeenCalledTimes(preflights);
  expect(transaction.apply).toHaveBeenCalledTimes(applies);
});
```

Add a changed-plan-identity case that fails closed before mutation.

- [ ] **Step 2: Write failing transaction-unit fault tests**

For each unit, use a real temporary directory and controlled filesystem port. Assert exact paths, deterministic order, mode preservation, reverse rollback, cleanup after success/failure/cancellation, and unresolved recovery evidence. Name the realistic production mutation each test catches.

- [ ] **Step 3: Run the focused RED gate**

Run:

```bash
npx vitest run src/pipeline/apply src/pipeline/applied-project.spec.ts src/transaction test/architecture/migration-transaction-boundary.test.ts
```

Expected: FAIL because Apply and transaction unit boundaries are absent and the monolith owns all mechanics.

- [ ] **Step 4: Add immutable Applied handoff and Apply stage**

```ts
export interface AppliedProject {
  readonly validated: ValidatedProjectPlan;
  readonly application: MigrationApplication;
}

export class ApplyProjectStage implements ApplyStage {
  constructor(private readonly mode: MigrationMode, private readonly transaction: MigrationTransactionPort) {}
  async run(validated: ValidatedProjectPlan): Promise<AppliedProject> {
    // exact existing plan/write/parse-error/preflight/apply decision table
  }
}
```

Freeze the handoff and ensure the transaction receives the canonical `validated.plan` object.

- [ ] **Step 5: Extract staging and commit mechanics**

Move existing staging-file creation and destination replacement algorithms without semantic change. Give each unit a narrow port and immutable journal entries:

```ts
export interface StagedArtifact { readonly artifact: PlannedOutputArtifact; readonly stagingPath?: string; readonly backupPath?: string; }
export interface StagingUnit { stage(artifacts: readonly PlannedOutputArtifact[], signal: AbortSignal): Promise<readonly StagedArtifact[]>; }
export interface CommitUnit { commit(staged: readonly StagedArtifact[], signal: AbortSignal): Promise<readonly CommittedArtifact[]>; }
```

The commit unit preserves artifact order and records each completed replacement before advancing.

- [ ] **Step 6: Extract rollback and cleanup mechanics**

```ts
export interface RollbackUnit { rollback(committed: readonly CommittedArtifact[]): Promise<readonly string[]>; }
export interface CleanupUnit { cleanup(staged: readonly StagedArtifact[]): Promise<readonly string[]>; }
```

Rollback consumes reversed committed order. Cleanup removes only invocation-owned paths. Both return or throw the existing structured recovery evidence without hiding the initiating error.

- [ ] **Step 7: Reduce MigrationTransaction to coordination**

Retain legal-state transitions, preflight identity/content sealing, cancellation checkpoints, signal lifecycle, recovery sequencing, and error aggregation in `MigrationTransaction`. Remove direct filesystem mechanics that now belong to units. Do not change public error wording or fault-injection seams.

- [ ] **Step 8: Redirect the compatibility continuation through Apply**

Temporarily change the downstream continuation so `Migrator` receives `AppliedProject` and only builds the existing report. Remove transaction imports and mutation calls from `Migrator`.

- [ ] **Step 9: Run GREEN, fault, concurrency, and compatibility gates**

Run:

```bash
npx vitest run src/pipeline/apply src/pipeline/applied-project.spec.ts src/transaction src/migrator/migrator.spec.ts test/architecture/migration-transaction-boundary.test.ts test/compatibility test/performance/migration-workload-counter.test.ts
npm run typecheck
npm run lint
```

Expected: all pass with one mutation authority and unchanged rollback/interruption results.

- [ ] **Step 10: Review and commit Task 2**

Review fault paths and ownership before committing:

```bash
git add src test
git commit -m "refactor: decompose project application transaction"
```

---

### Task 3: Direct Pipeline, CLI, Reporting, and Presentation Composition

**Files:**
- Create: `src/pipeline/migration-runner.ts`
- Create: `src/pipeline/migration-runner.spec.ts`
- Modify: `src/pipeline/migration-pipeline.ts`
- Modify: `src/pipeline/migration-pipeline.spec.ts`
- Modify: `src/cli/run-cli.ts`
- Modify: `src/cli/run-cli.spec.ts`
- Modify: `src/report/migration-report.builder.ts`
- Modify: `src/report/migration-report.builder.spec.ts`
- Modify: `src/report/terminal.presenter.ts`
- Modify: `src/report/terminal.presenter.spec.ts`
- Modify: `src/report/json-report.writer.ts`
- Modify: `src/report/json-report.writer.spec.ts`
- Delete: `src/pipeline/current-migration.pipeline.ts`
- Delete: `src/pipeline/current-migration.pipeline.spec.ts`
- Delete: `src/migrator/migrator.ts`
- Delete: `src/migrator/migrator.spec.ts`
- Modify: `src/main.ts`
- Modify: `test/cli/cli.test.ts`
- Modify: `test/architecture/enterprise-pipeline-boundary.test.ts`
- Modify: `test/architecture/enterprise-pipeline-shell-boundary.test.ts`
- Modify: `test/package/package-contract.test.ts`
- Modify: `test/performance/migration-workload-counter.test.ts`

**Interfaces:**
- Consumes: concrete Discover, Analyze, Render, Validate, Apply stages and immutable `AppliedProject`.
- Produces: `MigrationRunner.run(invocation: MigrationInvocation): Promise<MigrationReport>`.
- Produces: a concrete `MigrationPipeline` whose `run` executes every stage exactly once and in order.

- [ ] **Step 1: Write failing route and observer tests**

```ts
test('runs the five-stage route exactly once in order', async () => {
  const calls: string[] = [];
  const report = await runnerFixture(calls).run(invocationFixture());
  expect(calls).toEqual(['discover', 'analyze', 'render', 'validate', 'apply']);
  expect(report).toEqual(existingReportFixture());
});

test('presentation failure cannot change the completed application decision', async () => {
  const applied = appliedProjectFixture();
  await expect(presentCompleted(applied, rejectingPresenter())).rejects.toThrow('presenter failed');
  expect(applied.application).toEqual({ status: 'applied' });
});
```

Update architecture gates to reject `CurrentMigrationPipeline`, `Migrator`, or direct stage bypasses on the CLI route.

- [ ] **Step 2: Run the focused RED gate**

Run:

```bash
npx vitest run src/pipeline/migration-runner.spec.ts src/pipeline/migration-pipeline.spec.ts src/cli/run-cli.spec.ts src/report test/cli/cli.test.ts test/architecture/enterprise-pipeline-boundary.test.ts test/architecture/enterprise-pipeline-shell-boundary.test.ts
```

Expected: FAIL because production still uses the compatibility façade and continuation.

- [ ] **Step 3: Make MigrationPipeline concrete and exact**

Define stage contracts with exact handoffs and implement:

```ts
const manifest = await this.discover.run(invocation);
const analyzed = await this.analyze.run(manifest);
const rendered = await this.render.run(analyzed);
const validated = await this.validate.run(rendered);
return this.apply.run(validated);
```

No stage may be retried or observed through a second execution path.

- [ ] **Step 4: Implement MigrationRunner and report construction**

`MigrationRunner` captures the existing start time, invokes the pipeline once, then calls `MigrationReportBuilder` using immutable analyzed/validated/applied data. Preserve exact input/output paths, target, mode, stylesheet result, duration semantics, and application result.

- [ ] **Step 5: Cut CLI composition over**

Construct target session and narrow filesystem/parser/transaction ports once in `run-cli.ts`, assemble concrete stages, invoke `MigrationRunner.run` once, present the returned report, write optional JSON through its separate writer, and resolve the existing exit policy. Preserve error mapping and every debug/progress string.

- [ ] **Step 6: Delete compatibility orchestration**

Delete `CurrentMigrationPipeline` and `Migrator` after `rg` and resolved-symbol architecture checks show zero production consumers. Move no policy into CLI or report modules.

- [ ] **Step 7: Run GREEN public-oracle gates**

Run:

```bash
npx vitest run src/pipeline src/cli src/report test/cli/cli.test.ts test/compatibility test/architecture/enterprise-pipeline-boundary.test.ts test/architecture/enterprise-pipeline-shell-boundary.test.ts test/performance/migration-workload-counter.test.ts
npm run build
npm run package:check
```

Expected: all pass with byte-identical terminal/JSON/template/stylesheet fixtures and unchanged exit codes.

- [ ] **Step 8: Review and commit Task 3**

Review the concrete call graph and public snapshots, then commit:

```bash
git add src test
git commit -m "refactor: compose the complete migration pipeline"
```

---

### Task 4: Dead Code, Compatibility Alias, and Dependency Cleanup

**Files:**
- Delete: `src/migrator/file.migrator.ts`
- Delete: `src/migrator/file.migrator.spec.ts`
- Delete: `src/migrator/folder.migrator.ts`
- Delete: `src/migrator/folder.migrator.spec.ts`
- Delete: compatibility-only adapter aliases identified by the architecture inventory
- Modify: production/test imports that still use compatibility barrels
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `scripts/architecture-inventory.mjs`
- Modify: `scripts/architecture-inventory.spec.ts`
- Modify: `test/architecture/semantic-render-ownership.test.ts`
- Modify: `test/architecture/enterprise-pipeline-boundary.test.ts`
- Modify: `test/package/package-contract.test.ts`
- Modify: `test/package/tooling-policy.test.ts`
- Modify: `docs/architecture/enterprise-architecture-rewrite.md`

**Interfaces:**
- Consumes: final production route and resolved-symbol inventory from Tasks 1–3.
- Produces: no compatibility façade on the production graph; exact declared runtime dependency set; final owner/dependency architecture gates.

- [ ] **Step 1: Generate the deletion inventory and write failing absence tests**

Run read-only searches:

```bash
npm run architecture:inventory -- --json /tmp/flex-layout-roadmap-pre-cleanup.json
rg -n "CurrentMigrationPipeline|CompatibilityEditValidator|FileMigrator|FolderMigrator|ConversionAdapterSession|from ['\"]ignore['\"]" src test scripts package.json
```

Add architecture/package assertions that each obsolete symbol/module is absent from production exports and that every production external import maps to one declared runtime dependency.

- [ ] **Step 2: Run cleanup RED gates**

Run:

```bash
npx vitest run test/architecture scripts/architecture-inventory.spec.ts test/package/package-contract.test.ts test/package/tooling-policy.test.ts
```

Expected: FAIL with the exact remaining aliases, tombstones, barrels, or dependency mismatch.

- [ ] **Step 3: Delete only proven-unreachable modules**

Delete the named compatibility files and any additional alias only when both `rg` and resolved-symbol closure show no production consumer. Replace test imports with canonical owners. Do not delete public package entry points still required by package tests.

- [ ] **Step 4: Resolve the `ignore` dependency accurately**

If production still imports `ignore`, move it from an undeclared/transitive state to `dependencies` at the already locked compatible version. If the final Discover implementation no longer needs it, remove the import and dependency only after its ignore-pattern characterization tests remain green. Do not implement a partial replacement for Git ignore semantics.

- [ ] **Step 5: Tighten final architecture and package contracts**

Assert the final stage route, one policy owner per named policy, one project-mutation owner, transaction-unit boundaries, observer-only presenters, no compatibility façades, and an exact runtime dependency/import bijection. Update the architecture document to mark slices 5–8 implemented with the real final owners.

- [ ] **Step 6: Run GREEN cleanup gates**

Run:

```bash
npx vitest run test/architecture scripts/architecture-inventory.spec.ts test/package
npm run typecheck
npm run lint
npm run build
npm run package:check
```

Expected: all pass; package contents expose no deleted internal compatibility module.

- [ ] **Step 7: Review and commit Task 4**

Review every deletion against reachability and package compatibility, then commit:

```bash
git add -A src test scripts package.json package-lock.json docs/architecture/enterprise-architecture-rewrite.md
git commit -m "refactor: remove obsolete architecture compatibility paths"
```

---

### Task 5: Final Evidence, Whole-Branch Review, and Pull-Request Gate

**Files:**
- Create: `docs/maintenance/2026-09-04-enterprise-architecture-final.md`
- Modify: `docs/architecture/enterprise-architecture-rewrite.md`
- Modify: `test/package/architecture-baseline-contract.test.ts`
- Modify: `test/package/docs-contract.test.ts`
- Modify: `test/performance/migration-workload-counter.test.ts`
- Modify: benchmark scripts/specifications only if the unchanged schema cannot capture final counters

**Interfaces:**
- Consumes: final production tree, Slice 1 baseline, architecture inventory, workload counters, packaged CLI scenarios, dependency metadata, benchmark runner.
- Produces: final executable evidence and an honest before/after report; no production behavior.

- [ ] **Step 1: Write failing final-evidence contracts**

Add docs/package tests requiring a final report with exact final route, inventory keys, dependency audit fields, deterministic workload counters, benchmark methodology, measured samples, retained debt, and explicit no-improvement wording when warranted.

- [ ] **Step 2: Run evidence RED**

Run:

```bash
npx vitest run test/package/architecture-baseline-contract.test.ts test/package/docs-contract.test.ts test/performance/migration-workload-counter.test.ts
```

Expected: FAIL because the final report and final counter table are absent.

- [ ] **Step 3: Capture final structural and dependency evidence**

Run:

```bash
npm run architecture:inventory -- --json /tmp/flex-layout-roadmap-final-inventory.json
npm ls --omit=dev --all --json
npm run package:check
```

Record production file count, internal/external edge count, runtime dependencies, policy/side-effect owners, package contents, licenses, purposes, and replacement decisions. Derive numbers from generated output, never estimates.

- [ ] **Step 4: Capture deterministic workload and public parity evidence**

Run:

```bash
npx vitest run test/performance/migration-workload-counter.test.ts test/compatibility test/cli/cli.test.ts
npm run build
npm run package:check
```

Record reads, initial parses, validation reparses, semantic plans, target renders, session finalizations, stylesheet reads, reference parses, preflights, stages, project writes, rollbacks, and cleanup actions for the established scenarios.

- [ ] **Step 5: Run the five-sample benchmark**

Run the supported preparation and benchmark commands:

```bash
npm run benchmark:architecture:prepare
npm run benchmark:architecture -- --json /tmp/flex-layout-roadmap-final-benchmark.json
```

Confirm one discarded warm-up plus five recorded samples per product and architecture scenario. Calculate/report median, minimum, maximum, and MAD using the runner output. Claim an improvement only if the same-machine medians support it; otherwise state that no repeatable improvement is claimed.

- [ ] **Step 6: Write the final report and make evidence GREEN**

Populate `docs/maintenance/2026-09-04-enterprise-architecture-final.md` with exact commands, environment, commit captured, route, ownership map, inventory, dependency/license audit, counters, package evidence, parity evidence, benchmark samples, comparison to Slice 1, and retained debt. Update the roadmap completion state.

Run:

```bash
npx vitest run test/package/architecture-baseline-contract.test.ts test/package/docs-contract.test.ts test/performance/migration-workload-counter.test.ts
```

Expected: all pass and every asserted value matches generated evidence.

- [ ] **Step 7: Commit final evidence**

```bash
git add docs test scripts
git commit -m "docs: publish final enterprise architecture evidence"
```

- [ ] **Step 8: Run the clean full verification gate**

Run:

```bash
npm run clean && npm run verify
git diff --check
git status --short
```

Expected: formatting, lint, typecheck, all tests with coverage, build, package check, diff check, and tracked worktree status pass. Only explicitly ignored benchmark scratch output may remain, and it must be removed before handoff.

- [ ] **Step 9: Perform independent whole-branch review**

Review `origin/main...HEAD` against the approved spec in two passes:

1. spec compliance and public compatibility;
2. code quality, invariants, failure paths, concurrency/recovery, dependency accuracy, and evidence honesty.

Classify findings as critical, important, or minor. If critical/important findings exist, perform one bounded fix wave, add regression tests first, rerun scoped gates, commit, and request one scoped re-review. Do not open the PR with an unresolved critical or important finding.

- [ ] **Step 10: Refresh final evidence after fixes**

If the fix wave changes production, tests, ownership, inventory, counters, or timing-relevant code, regenerate the affected evidence and commit the refreshed report. Then rerun:

```bash
npm run clean && npm run verify
npm run package:check
git diff --check
git status --short
```

- [ ] **Step 11: Prepare integration handoff**

Summarize commits, final architecture, removals, dependency outcome, deterministic counters, benchmark result, verification counts, review findings/fixes, and retained debt. Use `superpowers:finishing-a-development-branch` to offer local merge, PR creation, or branch preservation. Do not push or create a PR without the user's integration choice.
