# Enterprise Pipeline Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce immutable Discover → Analyze → Render → Validate → Apply contracts and a fail-closed coordinator, while routing production through one temporary compatibility façade over the existing migrator.

**Architecture:** New `src/pipeline` modules define readonly handoff models, narrow stage ports, and a coordinator that passes each completed result exactly once to the next stage. A temporary `CurrentMigrationPipeline` implements the CLI-facing runner by delegating to the existing `Migrator`; it is the only production route until later slices replace its internals stage by stage, and its removal is explicitly reserved for Slice 7.

**Tech Stack:** TypeScript 6, Node.js 24, Vitest 4, existing migration models and adapters.

**Spec:** `docs/architecture/enterprise-architecture-rewrite.md`

## Global Constraints

- Preserve discovered template order, source bytes, generated output, diagnostics, plan/write behavior, reports, exit codes, transaction recovery, interruption behavior, and packaged CLI entry points.
- Add no runtime dependency, plugin framework, reflection framework, service locator, or general dependency-injection container.
- Every handoff factory recursively freezes its owned arrays, records, and artifact states; it does not freeze opaque Angular compiler nodes or mutate caller-owned values.
- Expected source limitations remain data; thrown stage failures are I/O or internal invariants and identify the failing stage internally without changing public JSON schema.
- Only the existing transaction/atomic-writer boundary may mutate project files.
- The compatibility façade contains no conversion, breakpoint, rendering, validation, transaction, reporting, or exit policy. It is removed in delivery Slice 7 after real stages own the complete production flow.
- Add no Changeset because public behavior is unchanged.
- Retain the exact known undeclared `ignore` baseline; do not add or remove dependencies in this slice.
- Preserve or improve deterministic workload counters and benchmark report schemas; timing values remain observational.
- Every task follows TDD, ends with focused verification and `git diff --check`, and produces an independently reviewable commit.

---

### Task 1: Define immutable pipeline handoff models

**Files:**

- Create: `src/pipeline/project-manifest.ts`
- Create: `src/pipeline/analyzed-project.ts`
- Create: `src/pipeline/rendered-project.ts`
- Create: `src/pipeline/validated-project-plan.ts`
- Create: `src/pipeline/pipeline-handoffs.spec.ts`

**Interfaces:**

- Consumes: `MigrationOptions`, `TemplateParseResult`, `LocatedFlexLayoutInput`, `FileMigrationPlan`, `AdapterSessionResult`, `MigrationPlan`, and `StylesheetMigrationResult`.
- Produces:

```ts
export interface MigrationInvocation {
  readonly inputPath: string;
  readonly outputPath: string;
  readonly options: Readonly<MigrationOptions>;
}

export interface ManifestTemplate {
  readonly inputPath: string;
  readonly outputPath: string;
}

export interface ProjectManifest {
  readonly invocation: MigrationInvocation;
  readonly templates: readonly ManifestTemplate[];
}

export type AnalyzedTemplate =
  | {
      readonly status: 'parsed';
      readonly file: ManifestTemplate;
      readonly source: string;
      readonly parseResult: Extract<TemplateParseResult, { readonly status: 'parsed' }>;
      readonly inputs: readonly LocatedFlexLayoutInput[];
    }
  | {
      readonly status: 'parse-error';
      readonly file: ManifestTemplate;
      readonly source: string;
      readonly parseResult: Extract<TemplateParseResult, { readonly status: 'parse-error' }>;
    };

export interface AnalyzedProject {
  readonly manifest: ProjectManifest;
  readonly templates: readonly AnalyzedTemplate[];
}

export interface RenderedProject {
  readonly analyzed: AnalyzedProject;
  readonly files: readonly FileMigrationPlan[];
  readonly session: AdapterSessionResult;
}

export interface ValidatedProjectPlan {
  readonly rendered: RenderedProject;
  readonly plan: MigrationPlan;
  readonly stylesheet?: StylesheetMigrationResult;
}
```

Each module exports a same-named camel-case factory: `migrationInvocation`, `projectManifest`, `analyzedProject`, `renderedProject`, and `validatedProjectPlan`.

- [ ] **Step 1: Write failing factory tests**

Test exact normalization and ownership rules:

- invocation paths become normalized absolute paths;
- invocation options are copied and frozen;
- manifest templates preserve input order and contain normalized absolute paths;
- analyzed templates preserve the manifest identities and source bytes;
- input arrays, rendered file plans, session rule arrays, migration plan contents, and stylesheet records are copied/frozen through their existing factories where available;
- mutating any caller-owned top-level array or plain options/stylesheet record after construction cannot change a handoff;
- malformed membership (an analyzed template not present in its manifest, a rendered file not represented by an analyzed template, or a validated plan target differing from its finalized session target) throws an internal invariant error;
- opaque Angular parse nodes remain usable and are not recursively frozen.

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
npx vitest run src/pipeline/pipeline-handoffs.spec.ts
```

Expected: FAIL because the handoff modules do not exist.

- [ ] **Step 3: Implement minimal factories**

Use `Object.freeze`, copied arrays, existing `fileMigrationPlan`/`migrationPlan` factories, and normalized absolute paths. Add a private invariant helper in the owning module rather than a cross-project error framework. Membership comparisons use normalized absolute input/output pairs and code-unit equality; do not compare opaque Angular nodes structurally.

- [ ] **Step 4: Verify models and type boundaries**

Run:

```bash
npx vitest run src/pipeline/pipeline-handoffs.spec.ts src/migrator/file.migrator.spec.ts src/migrator/migrator.spec.ts
npx tsc --noEmit
npx eslint src/pipeline
git diff --check
```

Expected: all selected tests, type-checking, lint, and diff checks pass.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline
git commit -m "refactor: define immutable migration handoffs"
```

---

### Task 2: Implement the five-stage coordinator

**Files:**

- Create: `src/pipeline/migration-pipeline.ts`
- Create: `src/pipeline/migration-pipeline.spec.ts`
- Create: `src/pipeline/pipeline-stage.error.ts`

**Interfaces:**

- Consumes: factories and interfaces from Task 1.
- Produces:

```ts
export type PipelineStageName = 'discover' | 'analyze' | 'render' | 'validate' | 'apply';

export interface DiscoverStage {
  run(invocation: MigrationInvocation): Promise<ProjectManifest>;
}
export interface AnalyzeStage {
  run(manifest: ProjectManifest): Promise<AnalyzedProject>;
}
export interface RenderStage {
  run(analyzed: AnalyzedProject): Promise<RenderedProject>;
}
export interface ValidateStage {
  run(rendered: RenderedProject): Promise<ValidatedProjectPlan>;
}
export interface ApplyStageResult {
  readonly application: MigrationApplication;
}
export interface ApplyStage {
  run(plan: ValidatedProjectPlan): Promise<ApplyStageResult>;
}
export interface MigrationPipelineResult {
  readonly validated: ValidatedProjectPlan;
  readonly application: MigrationApplication;
}

export class MigrationPipeline {
  constructor(
    discover: DiscoverStage,
    analyze: AnalyzeStage,
    render: RenderStage,
    validate: ValidateStage,
    apply: ApplyStage,
  );
  run(invocation: MigrationInvocation): Promise<MigrationPipelineResult>;
}
```

`PipelineStageError` exposes readonly `stage: PipelineStageName` and `cause: unknown`; its message is `Migration pipeline <stage> stage failed.`.

- [ ] **Step 1: Write failing coordinator tests**

Use recording fake stages with real Task 1 handoffs. Assert exact call order, one call per stage, referential identity between one stage output and the next input, frozen final result/application, and no stage call after a predecessor throws.

Add a parameterized failure test for all five stages. Existing `PipelineStageError` values pass through unchanged; any other thrown value is wrapped once with the exact stage and original cause. A stage that returns a promise rejection is handled identically to a synchronous throw.

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
npx vitest run src/pipeline/migration-pipeline.spec.ts
```

Expected: FAIL because the coordinator and error do not exist.

- [ ] **Step 3: Implement the coordinator**

Keep the coordinator linear and explicit:

```ts
const manifest = await runStage('discover', () => this.discover.run(invocation));
const analyzed = await runStage('analyze', () => this.analyze.run(manifest));
const rendered = await runStage('render', () => this.render.run(analyzed));
const validated = await runStage('validate', () => this.validate.run(rendered));
const applied = await runStage('apply', () => this.apply.run(validated));
return Object.freeze({ validated, application: Object.freeze({ ...applied.application }) });
```

Do not add middleware, event buses, retries, parallel execution, generic stage graphs, or a DI container.

- [ ] **Step 4: Verify coordinator behavior**

Run:

```bash
npx vitest run src/pipeline/migration-pipeline.spec.ts src/pipeline/pipeline-handoffs.spec.ts
npx tsc --noEmit
npx eslint src/pipeline
git diff --check
```

Expected: all selected tests and static checks pass.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/migration-pipeline.ts src/pipeline/migration-pipeline.spec.ts src/pipeline/pipeline-stage.error.ts
git commit -m "refactor: add staged migration coordinator"
```

---

### Task 3: Route the CLI through the current-pipeline façade

**Files:**

- Create: `src/pipeline/current-migration.pipeline.ts`
- Create: `src/pipeline/current-migration.pipeline.spec.ts`
- Modify: `src/cli/run-cli.ts`
- Modify: `src/cli/run-cli.spec.ts`
- Modify: `test/architecture/migration-transaction-boundary.test.ts`

**Interfaces:**

- Consumes: current `Migrator`, `ConversionAdapterSession`, `MigrationOptions`, and `MigrationReport`.
- Produces:

```ts
export interface MigrationRunner {
  run(invocation: MigrationInvocation): Promise<MigrationReport>;
}

export type MigratorFactory = (
  session: ConversionAdapterSession,
  inputPath: string,
  outputPath: string,
) => Pick<Migrator, 'migrate'>;

export class CurrentMigrationPipeline implements MigrationRunner {
  constructor(session: ConversionAdapterSession, createMigrator?: MigratorFactory);
  run(invocation: MigrationInvocation): Promise<MigrationReport>;
}
```

- [ ] **Step 1: Write failing façade tests**

Assert that `CurrentMigrationPipeline.run()` constructs exactly one migrator with the invocation's normalized paths, passes the exact copied options to `migrate`, returns the same report identity, and adds no exception translation. Assert the factory is called once per invocation and stores no completed invocation state.

In the CLI unit test, inject a `MigrationRunner` factory and assert CLI argument validation creates one immutable invocation and calls `run()` once. Preserve existing adapter-session construction and presenter/report-writer assertions.

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
npx vitest run src/pipeline/current-migration.pipeline.spec.ts src/cli/run-cli.spec.ts test/architecture/migration-transaction-boundary.test.ts
```

Expected: FAIL because the façade/runner seam does not exist and CLI still constructs `Migrator` directly.

- [ ] **Step 3: Implement the thin façade and CLI seam**

The façade body contains only construction and delegation:

```ts
run(invocation: MigrationInvocation): Promise<MigrationReport> {
  return this.createMigrator(this.session, invocation.inputPath, invocation.outputPath).migrate(invocation.options);
}
```

Change `runCli` dependencies to accept an optional `createMigrationRunner(session)` defaulting to `new CurrentMigrationPipeline(session)`. After current argument/path validation, create the invocation through `migrationInvocation(...)`, call the runner once, and leave presentation, report writing, and exit policy in their existing order.

Update the transaction authority contract so the exact production call graph is CLI → `CurrentMigrationPipeline.run` → `Migrator.migrate` → `MigrationTransaction.apply`. Preserve fail-closed detection of indirect/dynamic write authority.

- [ ] **Step 4: Verify packaged parity and workload stability**

Run:

```bash
npx vitest run src/pipeline/current-migration.pipeline.spec.ts src/cli/run-cli.spec.ts test/architecture/migration-transaction-boundary.test.ts test/compatibility/enterprise-rewrite-parity.test.ts test/performance/migration-workload-counter.test.ts
npm run build
npx vitest run test/cli/cli.test.ts
npx tsc --noEmit
npx eslint src/pipeline/current-migration.pipeline.ts src/pipeline/current-migration.pipeline.spec.ts src/cli/run-cli.ts src/cli/run-cli.spec.ts test/architecture/migration-transaction-boundary.test.ts
git diff --check
```

Expected: exact public parity, workload counters, packaged CLI behavior, authority graph, type-checking, lint, and diff checks pass.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/current-migration.pipeline.ts src/pipeline/current-migration.pipeline.spec.ts src/cli/run-cli.ts src/cli/run-cli.spec.ts test/architecture/migration-transaction-boundary.test.ts
git commit -m "refactor: route CLI through migration pipeline"
```

---

### Task 4: Enforce pipeline ownership and document the transition

**Files:**

- Create: `test/architecture/enterprise-pipeline-shell-boundary.test.ts`
- Modify: `test/architecture/enterprise-pipeline-boundary.test.ts`
- Modify: `test/package/test-discovery.test.ts`
- Modify: `docs/architecture/enterprise-architecture-rewrite.md`

**Interfaces:**

- Consumes: pipeline modules from Tasks 1–3 and existing architecture inspection utilities.
- Produces: executable dependency-direction contracts and the named removal point for `CurrentMigrationPipeline`.

- [ ] **Step 1: Write failing architecture tests**

Require:

- `src/pipeline` handoff models import only target-neutral analyzer/template/migrator/report model types and Node path normalization; they import no concrete adapter, filesystem, CLI, presenter, logger, transaction, or writer;
- `migration-pipeline.ts` imports only handoff models, stage error, and `MigrationApplication` type;
- `current-migration.pipeline.ts` is the sole pipeline module allowed to import concrete `Migrator` and adapter session, and its production AST contains exactly one call to `migrate` and no directive, breakpoint, render, validation, report-building, filesystem, transaction, or exit-policy symbols;
- `run-cli.ts` imports `MigrationRunner`/`CurrentMigrationPipeline` and does not import `Migrator` directly;
- no production module outside `run-cli.ts` imports `CurrentMigrationPipeline`;
- new handoff arrays and result objects are readonly/frozen under mutation attempts; and
- every `src/pipeline/*.spec.ts` file is discovered by Vitest policy.

- [ ] **Step 2: Run architecture tests to verify RED**

Run:

```bash
npx vitest run test/architecture/enterprise-pipeline-shell-boundary.test.ts test/package/test-discovery.test.ts
```

Expected: FAIL until the new pipeline ownership constraints are implemented and discovered.

- [ ] **Step 3: Complete the boundaries and transition documentation**

Use the existing TypeScript AST helpers, not regex over source comments/strings, for import and call assertions. Tighten `enterprise-pipeline-boundary.test.ts` so pipeline modules are included in the no-mutation production scan.

Under delivery Slice 2 in the architecture document, add this transition statement:

```text
`CurrentMigrationPipeline` is the single temporary compatibility façade over `Migrator`. Slices 3–6 replace its delegated responsibilities with concrete stages; Slice 7 removes the façade after the CLI-facing `MigrationRunner` is backed by `MigrationPipeline`.
```

Do not update user-facing README/compatibility docs or add a Changeset.

- [ ] **Step 4: Run complete slice verification**

Run:

```bash
npm run clean
npm run verify
npx vitest run test/compatibility/enterprise-rewrite-parity.test.ts test/performance/migration-workload-counter.test.ts test/architecture/enterprise-pipeline-shell-boundary.test.ts
npm run architecture:inventory -- --json "$(mktemp -d)/pipeline-shell-inventory.json"
git diff --check
git status --short
```

Expected: format, lint, type-check, 3,230-or-more tests, coverage, build, package checks, parity, workload counters, inventory, and diff checks pass. Only intended tracked changes are present.

- [ ] **Step 5: Commit**

```bash
git add test/architecture/enterprise-pipeline-shell-boundary.test.ts test/architecture/enterprise-pipeline-boundary.test.ts test/package/test-discovery.test.ts docs/architecture/enterprise-architecture-rewrite.md
git commit -m "test: enforce migration pipeline shell"
```

---

## Slice completion gate

After Task 4, request independent spec-compliance and code-quality review of the complete slice. Address findings through focused fix commits, rerun `npm run clean && npm run verify`, and open a pull request containing only Slice 2. Do not begin discovery/analysis ownership work until this pull request is merged; write the Slice 3 plan against the merged pipeline contracts.
