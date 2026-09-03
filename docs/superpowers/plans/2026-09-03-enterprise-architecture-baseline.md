# Enterprise Architecture Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish immutable behavior, structure, dependency, and performance evidence before the enterprise architecture rewrite changes production ownership.

**Architecture:** This first program slice adds black-box parity contracts, deterministic workload counters, a repeatable packaged-CLI benchmark harness, and a generated structural inventory. One narrow dependency seam makes existing work countable without embedding instrumentation; the resulting baseline observes current behavior and becomes the acceptance oracle for later rewrite slices.

**Tech Stack:** TypeScript 6, Node.js 24 built-ins, Vitest 4, Angular compiler 21, the packaged ESM CLI, npm scripts, Markdown.

**Spec:** `docs/architecture/enterprise-architecture-rewrite.md`

## Global Constraints

- Preserve discovered template order, source bytes, generated output, diagnostics, plan/write behavior, reports, exit codes, transaction recovery, interruption behavior, and packaged CLI entry points.
- Add no runtime dependency, plugin system, reflection framework, or dependency-injection container.
- Do not add a Changeset: the one production dependency seam is internal and preserves behavior; every other change is test, tooling, or documentation.
- Benchmark wall-clock values are recorded but never used as CI pass/fail thresholds.
- Deterministic workload counters are hard assertions.
- Use warm-up runs followed by at least five recorded samples; report median, minimum, maximum, and median absolute deviation.
- Run all work in the `refactor/architecture-rewrite` worktree on Node.js 24 and npm 11.19.0.
- Every task ends with focused verification, `git diff --check`, and an independently reviewable commit.

---

### Task 1: Freeze the cross-mode public behavior matrix

**Files:**

- Create: `test/compatibility/enterprise-rewrite-parity.test.ts`
- Create: `test/fixtures/enterprise-architecture/tailwind.input.html`
- Create: `test/fixtures/enterprise-architecture/tailwind.expected.html`
- Create: `test/fixtures/enterprise-architecture/native-css.input.html`
- Create: `test/fixtures/enterprise-architecture/native-css.expected.html`
- Create: `test/fixtures/enterprise-architecture/native-css.expected.css`
- Create: `test/fixtures/enterprise-architecture/responsive-image.input.html`
- Create: `test/fixtures/enterprise-architecture/responsive-image.expected.html`

**Interfaces:**

- Consumes: packaged CLI contract `node dist/cli.js <input> --target <tailwind|css> [--stylesheet <path>] [--responsive-images] [--write] [--report <path>]`.
- Produces: a parameterized parity matrix whose plan and write cases assert exit status, stdout, stderr, JSON report, template bytes, stylesheet bytes, and second-run idempotence.

- [ ] **Step 1: Add representative source fixtures**

Create three compact fixtures by composing already-supported cases from `test/fixtures/compatibility/`: static and responsive Flex directives plus Grid for Tailwind; base and responsive Flex directives plus handwritten stylesheet context for native CSS; and literal `src` plus standard responsive `src.<alias>` values for responsive images. Copy expected bytes from the existing compatibility behavior; do not introduce a new directive case.

- [ ] **Step 2: Write the failing packaged parity test**

Use Node's `mkdtemp`, `cp`, `readFile`, and `spawnSync`. Define this case model in the test:

```ts
interface ParityCase {
  readonly name: string;
  readonly target: 'tailwind' | 'css';
  readonly inputFixture: string;
  readonly expectedTemplateFixture: string;
  readonly expectedStylesheetFixture?: string;
  readonly responsiveImages: boolean;
}
```

For every case, first run without `--write` and assert status `0`, unchanged project bytes, schema `2`, `mode: 'plan'`, and `application.status: 'skipped'`. Then run with `--write`, assert exact expected project bytes and `application.status: 'applied'`. Run the same write command a second time and assert byte-for-byte idempotence. Normalize only temporary absolute paths using one test helper; do not normalize ordering, messages, status, or generated content.

- [ ] **Step 3: Run the test to verify the missing fixtures/contracts fail**

Run:

```bash
npm run build
npx vitest run test/compatibility/enterprise-rewrite-parity.test.ts
```

Expected: FAIL until every fixture and exact public expectation is supplied.

- [ ] **Step 4: Complete the fixture expectations from current packaged behavior**

Run the current packaged CLI once per fixture in a temporary directory, inspect the complete terminal and JSON results, and encode those current values as explicit assertions. Do not update production code when an expectation is inconvenient; this task characterizes the merged baseline.

- [ ] **Step 5: Verify the parity matrix**

Run:

```bash
npm run build
npx vitest run test/compatibility/enterprise-rewrite-parity.test.ts test/cli/cli.test.ts test/compatibility/native-css-target.test.ts test/compatibility/responsive-image-plan-write.test.ts
git diff --check
```

Expected: all selected tests pass and the diff check is empty.

- [ ] **Step 6: Commit**

```bash
git add test/compatibility/enterprise-rewrite-parity.test.ts test/fixtures/enterprise-architecture
git commit -m "test: freeze enterprise rewrite parity"
```

---

### Task 2: Add deterministic workload counters

**Files:**

- Create: `test/performance/migration-workload-counter.test.ts`
- Modify: `src/migrator/file.migrator.ts`
- Modify: `src/migrator/file.migrator.spec.ts`
- Modify: `src/migrator/folder.migrator.ts`
- Modify: `src/migrator/folder.migrator.spec.ts`

**Interfaces:**

- Consumes: `AngularTemplateParser.parse(source: string, fileName: string): TemplateParseResult`, `FileMigrator.plan(options): Promise<FileMigrationPlan>`, and existing injected parser support.
- Produces: `MigrationWorkloadCounts` in test code only, with exact `discoveries`, `templateReads`, `initialParses`, `validationParses`, `renderedTemplates`, `stylesheetReads`, and `projectWrites` numbers for plan, write, and unchanged rerun scenarios.

- [ ] **Step 1: Write failing lifecycle tests for injected file dependencies**

Extend `FileMigrator` tests to require a single injected dependency object rather than constructing analyzers and planners during `plan()`:

```ts
interface FileMigratorDependencies {
  readonly readTemplate: (path: string) => Promise<string>;
  readonly parser: AngularTemplateParser;
  readonly analyzer: TemplateAnalyzer;
  readonly planner: ConversionPlanner;
}
```

Assert one template read, one initial parse, one render plan, and one validation parse only when output changes. Preserve the current constructor call through a default dependency factory so existing callers remain source-compatible during this baseline slice.

- [ ] **Step 2: Run focused tests to verify RED**

Run:

```bash
npx vitest run src/migrator/file.migrator.spec.ts src/migrator/folder.migrator.spec.ts
```

Expected: FAIL because `FileMigratorDependencies` and injected read/analyze/plan lifecycle do not exist.

- [ ] **Step 3: Add the minimal dependency seam**

Export `FileMigratorDependencies` from `src/migrator/file.migrator.ts`. Add a fifth optional constructor argument created by:

```ts
function defaultFileMigratorDependencies(): FileMigratorDependencies {
  return {
    readTemplate: path => readFile(path, 'utf8'),
    parser: new AngularTemplateParser(),
    analyzer: new TemplateAnalyzer(),
    planner: new ConversionPlanner(),
  };
}
```

Route existing work through the injected object without changing result construction or public output. Change `FolderMigrator` only enough to pass the same dependency factory to each file when tests request counting; do not cache source or parsed templates yet.

- [ ] **Step 4: Write the workload counter contract**

In `migration-workload-counter.test.ts`, create counting wrappers around the dependency seam and the existing transaction mock. Execute representative single-file and folder plans for Tailwind and CSS. Assert the current baseline counts explicitly, including any repeated work. Label assertions as `current baseline` rather than desired final counts; later slices must update them only when a reviewed optimization removes work.

- [ ] **Step 5: Verify counters and compatibility**

Run:

```bash
npx vitest run test/performance/migration-workload-counter.test.ts src/migrator/file.migrator.spec.ts src/migrator/folder.migrator.spec.ts src/migrator/migrator.spec.ts
npx tsc --noEmit
npx eslint src/migrator/file.migrator.ts src/migrator/file.migrator.spec.ts src/migrator/folder.migrator.ts src/migrator/folder.migrator.spec.ts test/performance/migration-workload-counter.test.ts
git diff --check
```

Expected: all selected tests, type-checking, lint, and diff checks pass.

- [ ] **Step 6: Commit**

```bash
git add src/migrator/file.migrator.ts src/migrator/file.migrator.spec.ts src/migrator/folder.migrator.ts src/migrator/folder.migrator.spec.ts test/performance/migration-workload-counter.test.ts
git commit -m "test: count migration pipeline workload"
```

---

### Task 3: Add the packaged-CLI benchmark corpus and runner

**Files:**

- Create: `benchmark/fixtures/single-tailwind/card.component.html`
- Create: `benchmark/fixtures/multi-tailwind/app.component.html`
- Create: `benchmark/fixtures/multi-tailwind/dashboard.component.html`
- Create: `benchmark/fixtures/multi-tailwind/grid.component.html`
- Create: `benchmark/fixtures/multi-native-css/app.component.html`
- Create: `benchmark/fixtures/multi-native-css/dashboard.component.html`
- Create: `benchmark/fixtures/multi-native-css/flex-layout-migration.css`
- Create: `benchmark/fixtures/unchanged-write/card.component.html`
- Create: `scripts/benchmark/architecture-benchmark.mjs`
- Create: `scripts/benchmark/memory-probe.mjs`
- Create: `scripts/benchmark/architecture-benchmark.spec.ts`
- Modify: `package.json`
- Modify: `test/package/test-discovery.test.ts`

**Interfaces:**

- Consumes: built `dist/cli.js`, Node `spawnSync`, and checked-in benchmark fixtures.
- Produces: `npm run benchmark:architecture -- --json <path>` and JSON with this stable tooling-only shape:

```ts
interface BenchmarkReport {
  readonly generatedAt: string;
  readonly node: string;
  readonly platform: string;
  readonly commit: string;
  readonly warmups: 1;
  readonly samples: 5;
  readonly scenarios: readonly {
    readonly name: 'single-tailwind-plan' | 'multi-tailwind-plan' | 'multi-native-css-plan' | 'unchanged-write';
    readonly milliseconds: readonly number[];
    readonly medianMilliseconds: number;
    readonly minMilliseconds: number;
    readonly maxMilliseconds: number;
    readonly medianAbsoluteDeviationMilliseconds: number;
    readonly peakRssBytes: readonly number[];
  }[];
}
```

- [ ] **Step 1: Write failing runner unit tests**

Test exported pure functions `median(values)`, `medianAbsoluteDeviation(values)`, and `summarize(samples)`. Test that `runBenchmark({ warmups: 1, samples: 5, ... })` invokes every scenario six times, excludes the warm-up from statistics, rejects nonzero CLI exits, and sorts scenarios by the declared order. Inject `runProcess`, `now`, `readPeakRss`, and `commit` so the test never measures real time.

- [ ] **Step 2: Run runner tests to verify RED**

Run:

```bash
npx vitest run scripts/benchmark/architecture-benchmark.spec.ts test/package/test-discovery.test.ts
```

Expected: FAIL because the benchmark module and test-discovery allowance do not exist.

- [ ] **Step 3: Implement the benchmark runner**

Use Node built-ins only. Copy each fixture to an invocation-owned `mkdtemp` directory before each sample so runs are independent. Spawn:

```text
node --import scripts/benchmark/memory-probe.mjs dist/cli.js <scenario arguments>
```

Pass an invocation-owned metrics path through `FLEX_LAYOUT_BENCHMARK_METRICS_PATH`. `memory-probe.mjs` registers an `exit` handler and writes `{ "peakRssBytes": process.resourceUsage().maxRSS * platformMultiplier }`; use multiplier `1024` on non-Darwin platforms and `1` on Darwin. The hook is benchmark-only and must not be imported by production code.

Add scripts:

```json
"benchmark:architecture": "node scripts/benchmark/architecture-benchmark.mjs",
"benchmark:architecture:prepare": "npm run build"
```

Require an explicit `--json` output path so benchmark runs never mutate a tracked baseline automatically.

- [ ] **Step 4: Add representative checked-in fixtures**

Keep the corpus below 50 KB. Use only syntax already covered by public compatibility fixtures. The multi-file Tailwind corpus must contain static Flex, responsive Flex, visibility, responsive class/style, Grid, orientation, and print examples. The native CSS corpus must contain every supported CSS Flex family and an existing owned stylesheet block. The unchanged-write fixture must already equal the current migrated Tailwind output.

- [ ] **Step 5: Verify the real harness**

Run:

```bash
npm run benchmark:architecture:prepare
benchmark_report_path="$(mktemp -d)/baseline.json"
npm run benchmark:architecture -- --json "$benchmark_report_path"
node -e "const r=require(process.argv[1]); if(r.samples!==5||r.scenarios.length!==4) process.exit(1)" "$benchmark_report_path"
npx vitest run scripts/benchmark/architecture-benchmark.spec.ts test/package/test-discovery.test.ts
git diff --check
```

Expected: four scenarios, five recorded timing and RSS values per scenario, all tests pass, and no tracked benchmark output changes.

- [ ] **Step 6: Commit**

```bash
git add benchmark scripts/benchmark package.json test/package/test-discovery.test.ts
git commit -m "test: add architecture benchmark harness"
```

---

### Task 4: Generate the structural and dependency inventory

**Files:**

- Create: `scripts/architecture-inventory.mjs`
- Create: `scripts/architecture-inventory.spec.ts`
- Create: `test/architecture/enterprise-pipeline-boundary.test.ts`
- Modify: `package.json`
- Modify: `test/package/test-discovery.test.ts`

**Interfaces:**

- Consumes: tracked production TypeScript files, `package.json`, and package-lock metadata.
- Produces: `npm run architecture:inventory -- --json <path>` with sorted `productionFiles`, `runtimeDependencies`, `largestFiles`, `moduleEdges`, and `policyOwners`; plus boundary tests freezing current mutation and target-dependency constraints.

- [ ] **Step 1: Write failing inventory tests**

Test a synthetic source tree and package manifest. Require code-unit path ordering, production-file line counts, external import classification, relative module edges, direct runtime dependency usage, and deterministic JSON serialization. Comments and string literals containing `import` must not create edges; use the TypeScript compiler AST already available as a development dependency.

- [ ] **Step 2: Run inventory tests to verify RED**

Run:

```bash
npx vitest run scripts/architecture-inventory.spec.ts test/architecture/enterprise-pipeline-boundary.test.ts
```

Expected: FAIL because the inventory generator and enterprise boundary do not exist.

- [ ] **Step 3: Implement the inventory generator**

Export pure `inventoryProject(input)` and CLI `main(argv)` functions from `architecture-inventory.mjs`. Read only tracked `src/**/*.ts` files excluding `*.spec.ts`. Record runtime dependencies with `declared`, `importedBy`, and `status: 'used' | 'unused'`. Record known policy owners for breakpoint classification, responsive precedence, semantic planning, artifact identity, diagnostics, and transaction recovery as exact module paths discovered from imports and symbols, not prose guesses.

Add:

```json
"architecture:inventory": "node scripts/architecture-inventory.mjs"
```

- [ ] **Step 4: Freeze current dependency boundaries**

In `enterprise-pipeline-boundary.test.ts`, reuse `typescript-boundary.ts` to assert:

- `src/flex` imports neither target adapter;
- renderers import no filesystem, CLI, report, or transaction modules;
- presenters import no adapter, planner, migrator, or transaction implementation;
- only existing transaction and atomic-writer modules call project mutation APIs; and
- production code imports no undeclared package.

These tests describe current valid boundaries. The later pipeline-shell slice will tighten them when the new stage directories exist.

- [ ] **Step 5: Verify real inventory generation**

Run:

```bash
inventory_path="$(mktemp -d)/inventory.json"
npm run architecture:inventory -- --json "$inventory_path"
node -e "const r=require(process.argv[1]); if(!r.productionFiles.length||!r.runtimeDependencies.length) process.exit(1)" "$inventory_path"
npx vitest run scripts/architecture-inventory.spec.ts test/architecture/enterprise-pipeline-boundary.test.ts test/package/test-discovery.test.ts
git diff --check
```

Expected: the generated inventory is nonempty and deterministically ordered; all selected tests pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/architecture-inventory.mjs scripts/architecture-inventory.spec.ts test/architecture/enterprise-pipeline-boundary.test.ts package.json test/package/test-discovery.test.ts
git commit -m "test: inventory architecture and dependencies"
```

---

### Task 5: Record and enforce the baseline evidence

**Files:**

- Create: `docs/maintenance/2026-09-03-enterprise-architecture-baseline.md`
- Create: `test/package/architecture-baseline-contract.test.ts`
- Modify: `docs/architecture/enterprise-architecture-rewrite.md`

**Interfaces:**

- Consumes: benchmark report from Task 3, inventory report from Task 4, workload counts from Task 2, and public parity matrix from Task 1.
- Produces: the human-readable baseline source of truth and an executable documentation contract that checks all stable structural facts while deliberately excluding machine-specific timing thresholds.

- [ ] **Step 1: Write the failing documentation contract**

Require the baseline document to include:

```text
Commit
Environment
Behavior oracle
Workload counters
Production structure
Runtime dependencies
Benchmark method
Benchmark results
Known hotspots
Rewrite acceptance gates
```

Assert exact documented counts for production files, runtime dependencies, largest production modules, scenario names, warm-up/sample counts, and deterministic workload counters. Assert that no sentence describes a wall-clock number as a CI threshold.

- [ ] **Step 2: Run the contract to verify RED**

Run:

```bash
npx vitest run test/package/architecture-baseline-contract.test.ts
```

Expected: FAIL because the baseline document does not exist.

- [ ] **Step 3: Capture fresh evidence**

Run from a clean build:

```bash
npm run clean
npm run build
evidence_dir="$(mktemp -d)"
npm run architecture:inventory -- --json "$evidence_dir/inventory.json"
npm run benchmark:architecture -- --json "$evidence_dir/benchmark.json"
npx vitest run test/performance/migration-workload-counter.test.ts test/compatibility/enterprise-rewrite-parity.test.ts
```

Copy the exact commit, Node/npm/OS details, structural counts, dependency purposes, counter values, and benchmark distributions into the document. Name the current largest responsibility clusters without prescribing abstractions not yet proven by the inventory.

- [ ] **Step 4: Link the baseline from the architecture spec**

Add one sentence under `Performance contract` naming `docs/maintenance/2026-09-03-enterprise-architecture-baseline.md` as the baseline source of truth. Do not change the approved architecture or completion criteria.

- [ ] **Step 5: Verify the slice and packaged artifact**

Run:

```bash
npm run clean
npm run verify
npx vitest run test/package/architecture-baseline-contract.test.ts test/compatibility/enterprise-rewrite-parity.test.ts test/performance/migration-workload-counter.test.ts
git diff --check
git status --short
```

Expected: format, lint, type-check, all tests, coverage, build, package checks, documentation contracts, and diff checks pass. Only intended tracked changes are present; pre-existing `.DS_Store` files remain untouched.

- [ ] **Step 6: Commit**

```bash
git add docs/maintenance/2026-09-03-enterprise-architecture-baseline.md docs/architecture/enterprise-architecture-rewrite.md test/package/architecture-baseline-contract.test.ts
git commit -m "docs: record enterprise architecture baseline"
```

---

## Slice completion gate

After Task 5, request independent spec-compliance and code-quality review of the complete slice. Address findings through focused fix commits, rerun `npm run clean && npm run verify`, and open a pull request containing only Slice 1. Do not begin the pipeline-shell slice until this baseline pull request is merged; write its implementation plan against the merged interfaces and evidence.
