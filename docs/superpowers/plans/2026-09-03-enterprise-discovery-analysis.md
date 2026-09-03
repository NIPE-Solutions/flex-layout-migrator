# Enterprise Discovery and Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Discover and Analyze the sole production owners of topology discovery, original template reads, initial Angular parsing, and Flex-Layout input analysis while preserving every public migration result.

**Architecture:** Add concrete filesystem-backed `DiscoverProjectStage` and target-neutral `AnalyzeProjectStage` implementations behind narrow ports. Route `CurrentMigrationPipeline` through both stages and pass the authoritative `AnalyzedProject` into a compatibility `Migrator` continuation that retains rendering, validation, application, and reporting only.

**Tech Stack:** TypeScript 6, Node.js 24 filesystem APIs, Angular compiler template parsing, Vitest 4, existing Tailwind/native CSS adapters, semantic TypeScript architecture inspection.

**Spec:** `docs/superpowers/specs/2026-09-03-enterprise-discovery-analysis-design.md`

## Global Constraints

- Preserve discovered template order; converted and preserved bytes; generated Tailwind classes and native CSS; all diagnostic data and ordering; plan/write behavior; terminal and JSON output; progress semantics; exit codes; stylesheet ownership; transaction ordering and recovery; interruption behavior; packaged entry points; and the supported Node.js version.
- Discover is the only production owner of filesystem topology, `.gitignore` loading, deterministic template ordering, exclusions, and input/output mapping.
- Analyze reads each original template once, parses it once, and invokes `TemplateAnalyzer` once for each successfully parsed template and never for a parse-error template.
- Analyze remains target-neutral and has no adapter, renderer, report, transaction, or filesystem-write authority.
- The compatibility continuation must not rediscover inputs, reread in-place original templates, initially parse original source, or rerun `TemplateAnalyzer`.
- Retain one invocation-scoped target session and the existing changed-template validation reparse until Slice 5.
- Do not add runtime dependencies, a service locator, a DI framework, a Changeset, public behavior, or a second production pipeline.
- Do not redesign `PipelineStageError`; its public mapping remains assigned to Slice 7.
- Every production change follows a witnessed RED/GREEN TDD cycle and receives independent spec and quality review.
- Benchmark timings are observational. Update deterministic counters only when the production authority actually moves, without changing the workload or benchmark schemas.

---

### Task 1: Make Discover the topology owner

**Files:**

- Create: `src/pipeline/discover/discovery-file-system.port.ts`
- Create: `src/pipeline/discover/ignore-matcher.port.ts`
- Create: `src/pipeline/discover/discover-project.stage.ts`
- Create: `src/pipeline/discover/discover-project.stage.spec.ts`
- Modify: `src/lib/gitignore.helper.ts`
- Create: `src/lib/gitignore.helper.spec.ts`
- Modify: `src/pipeline/project-manifest.ts`
- Modify: `src/pipeline/pipeline-handoffs.spec.ts`

**Interfaces:**

- Consumes: `MigrationInvocation` and `projectManifest()` from `src/pipeline/project-manifest.ts`.
- Produces:

```ts
export interface DiscoveryEntry {
  readonly name: string;
  readonly kind: 'file' | 'directory' | 'other';
}

export interface DiscoveryFileSystem {
  kind(path: string): Promise<'file' | 'directory' | 'other'>;
  entries(directory: string): Promise<readonly DiscoveryEntry[]>;
}

export interface IgnoreMatcher {
  ignores(path: string): boolean;
}

export interface IgnoreMatcherFactory {
  load(root: string): Promise<IgnoreMatcher>;
}

export class DiscoverProjectStage implements DiscoverStage {
  constructor(fileSystem?: DiscoveryFileSystem, ignoreMatchers?: IgnoreMatcherFactory);
  run(invocation: MigrationInvocation): Promise<ProjectManifest>;
}
```

- `ManifestTemplate` continues to carry canonical absolute `inputPath` and `outputPath` values. `ProjectManifest.invocation` retains raw and canonical invocation identities unchanged.
- The default ignore factory must create invocation-scoped matcher state; it must not reuse mutable module-global ignore state between runs.

- [ ] **Step 1: Write failing stage contract tests**

Add real temporary-directory tests that independently derive literal expected paths and cover:

```ts
test('discovers one HTML file without reading its contents', async () => {
  const manifest = await stage.run(migrationInvocation({
    inputPath: input,
    outputPath: output,
    options: { mode: 'plan' },
  }));

  expect(manifest.templates).toEqual([{ inputPath: resolve(input), outputPath: resolve(output) }]);
  expect(readCalls).toBe(0);
});

test('orders nested folder templates by UTF-16 code units and preserves relative outputs', async () => {
  expect(manifest.templates.map(template => relative(inputRoot, template.inputPath))).toEqual([
    'A.html',
    'Z/nested.html',
    'a.html',
  ]);
});
```

Also cover ignored files/directories, non-HTML files, configured stylesheet exclusion even when named `*.html`, unsupported file extensions, non-file/non-directory input, and raw/canonical invocation preservation across a cwd change.

- [ ] **Step 2: Run Task 1 tests and verify RED**

Run:

```bash
npx vitest run src/pipeline/discover/discover-project.stage.spec.ts src/pipeline/pipeline-handoffs.spec.ts src/lib/gitignore.helper.spec.ts
```

Expected: FAIL because `DiscoverProjectStage` and invocation-scoped ignore ports do not exist; existing manifest tests remain green.

- [ ] **Step 3: Implement invocation-scoped ignore matching**

Refactor `gitignore.helper.ts` so production discovery can request an immutable matcher per root. Preserve compatibility exports only if unchanged callers still need them, and add a removal comment naming Task 4 of this plan. Do not add or move the `ignore` dependency in this slice.

```ts
export async function createGitIgnoreMatcher(root: string): Promise<IgnoreMatcher> {
  const matcher = ignore();
  const gitignorePath = path.join(root, '.gitignore');
  if (await fs.pathExists(gitignorePath)) matcher.add(await fs.readFile(gitignorePath, 'utf8'));
  return Object.freeze({ ignores: (candidate: string) => matcher.ignores(path.relative(root, candidate)) });
}
```

- [ ] **Step 4: Implement Discover with deterministic traversal**

Use `compareCodeUnits` for directory entries and the final canonical input sequence. Stat the invocation input once. For a file, validate both extensions and emit one pair. For a directory, traverse recursively, check ignore/exclusion before descending or selecting, and map relative paths under the output root. Call `projectManifest()` once at the boundary.

- [ ] **Step 5: Verify Task 1 GREEN and compatibility**

Run:

```bash
npx vitest run src/pipeline/discover/discover-project.stage.spec.ts src/pipeline/pipeline-handoffs.spec.ts src/lib/gitignore.helper.spec.ts src/migrator/folder.migrator.spec.ts src/migrator/migration-path.validator.spec.ts
npm run typecheck
npm run lint
```

Expected: all pass; no production caller is routed yet.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/pipeline/discover src/lib/gitignore.helper.ts src/lib/gitignore.helper.spec.ts src/pipeline/project-manifest.ts src/pipeline/pipeline-handoffs.spec.ts
git commit -m "refactor: add project discovery stage"
```

---

### Task 2: Make Analyze the original-source owner

**Files:**

- Create: `src/pipeline/analyze/template-source-reader.port.ts`
- Create: `src/pipeline/analyze/template-parser.port.ts`
- Create: `src/pipeline/analyze/template-input-analyzer.port.ts`
- Create: `src/pipeline/analyze/analyze-project.stage.ts`
- Create: `src/pipeline/analyze/analyze-project.stage.spec.ts`
- Modify: `src/pipeline/analyzed-project.ts`
- Modify: `src/pipeline/pipeline-handoffs.spec.ts`

**Interfaces:**

- Consumes: ordered `ProjectManifest`, `AngularTemplateParser.parse()`, and `TemplateAnalyzer.analyze()`.
- Produces:

```ts
export interface TemplateSourceReader {
  read(path: string): Promise<string>;
}

export interface TemplateParser {
  parse(source: string, fileName: string): TemplateParseResult;
}

export interface TemplateInputAnalyzer {
  analyze(fileName: string, elements: readonly TemplateElement[]): readonly LocatedFlexLayoutInput[];
}

export class AnalyzeProjectStage implements AnalyzeStage {
  constructor(
    sourceReader?: TemplateSourceReader,
    parser?: TemplateParser,
    analyzer?: TemplateInputAnalyzer,
  );
  run(manifest: ProjectManifest): Promise<AnalyzedProject>;
}
```

- The default source reader uses `node:fs/promises.readFile(path, 'utf8')`; parser and analyzer defaults wrap the existing concrete owners without changing their policies.

- [ ] **Step 1: Write failing exactly-once and ordering tests**

Use specific port fakes with complete results and assert returned real handoff behavior:

```ts
test('reads, parses, and analyzes every manifest template once in manifest order', async () => {
  const result = await stage.run(manifest);

  expect(result.templates.map(template => template.file.inputPath)).toEqual([first, second]);
  expect(readPaths).toEqual([first, second]);
  expect(parseInputs).toEqual([
    { source: '<div fxLayout></div>', fileName: first },
    { source: '<span fxHide></span>', fileName: second },
  ]);
  expect(analyzePaths).toEqual([first, second]);
});

test('keeps parse errors as data and does not analyze their elements', async () => {
  expect(result.templates[0]).toMatchObject({ status: 'parse-error', source });
  expect(analyzePaths).toEqual([]);
});
```

Cover read rejection propagation, parser rejection propagation, frozen defensive ownership, empty manifests, and no adapter/session construction.

- [ ] **Step 2: Run Task 2 tests and verify RED**

Run:

```bash
npx vitest run src/pipeline/analyze/analyze-project.stage.spec.ts src/pipeline/pipeline-handoffs.spec.ts
```

Expected: FAIL because the Analyze stage and ports do not exist.

- [ ] **Step 3: Implement ordered Analyze execution**

Implement a straightforward ordered loop. Read and parse every template once. Invoke the analyzer only for parsed results. Build one complete sequence and pass it through `analyzedProject()` once so canonical sequence checks and defensive freezing remain centralized.

```ts
const templates: AnalyzedTemplate[] = [];
for (const file of manifest.templates) {
  const source = await sourceReader.read(file.inputPath);
  const parseResult = parser.parse(source, file.inputPath);
  templates.push(parseResult.status === 'parse-error'
    ? { status: 'parse-error', file, source, parseResult }
    : { status: 'parsed', file, source, parseResult, inputs: analyzer.analyze(file.inputPath, parseResult.elements) });
}
return analyzedProject({ manifest, templates });
```

- [ ] **Step 4: Verify Task 2 GREEN**

Run:

```bash
npx vitest run src/pipeline/analyze/analyze-project.stage.spec.ts src/pipeline/pipeline-handoffs.spec.ts src/template/angular-template.parser.spec.ts src/analyzer/template.analyzer.spec.ts
npm run typecheck
npm run lint
```

Expected: all pass with one read/parse/analyze sequence per eligible template.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/pipeline/analyze src/pipeline/analyzed-project.ts src/pipeline/pipeline-handoffs.spec.ts
git commit -m "refactor: add project analysis stage"
```

---

### Task 3: Render one authoritative analyzed template

**Files:**

- Modify: `src/migrator/file.migrator.ts`
- Modify: `src/migrator/file.migrator.spec.ts`
- Modify: `src/migrator/file-migration-result.ts`
- Modify: `src/planner/conversion-planner.ts`
- Modify: `src/planner/conversion-planner.spec.ts`

**Interfaces:**

- Consumes: one `AnalyzedTemplate`, existing `ConversionAdapter`, `ConversionPlanner`, `SourceEditor`, and changed-output parser.
- Produces:

```ts
export interface FileMigratorDependencies {
  readonly readDestination: (path: string) => Promise<string>;
  readonly validationParser: TemplateParser;
  readonly planner: ConversionPlanner;
}

export class FileMigrator {
  constructor(adapter: ConversionAdapter, template: AnalyzedTemplate, dependencies?: FileMigratorDependencies);
  plan(options?: FileMigrationOptions): Promise<FileMigrationPlan>;
}
```

- `FileMigrator` must not accept original input/output strings separately, read the original input, invoke the initial parser, or own `TemplateAnalyzer`.
- Parse-error conversion results must be derived solely from `AnalyzedTemplate.parseResult.diagnostics`.
- Changed-template validation continues to use `validationParser` exactly once. A distinct existing destination may be read once; an in-place original uses `template.source`.

- [ ] **Step 1: Rewrite tests first against analyzed-template input**

Replace constructor fixtures with explicit `AnalyzedTemplate` values and add regressions:

```ts
test('renders parsed analysis without rereading, reparsing, or reanalyzing original source', async () => {
  const plan = await migrator.plan({ responsiveImages: false });
  expect(plan.file.inputPath).toBe(analyzed.file.inputPath);
  expect(readDestination).not.toHaveBeenCalledWith(analyzed.file.inputPath);
  expect(validationParser).toHaveBeenCalledTimes(plan.file.changed ? 1 : 0);
});

test('maps an analyzed parse error without calling planner or validation parser', async () => {
  expect(plan.file.results).toEqual([expectedParseResult]);
  expect(planner.plan).not.toHaveBeenCalled();
  expect(validationParser.parse).not.toHaveBeenCalled();
});
```

Retain all existing edit, unchanged, destination-state, generated-parse-error, diagnostic, and responsive-image assertions.

- [ ] **Step 2: Run Task 3 tests and verify RED**

Run:

```bash
npx vitest run src/migrator/file.migrator.spec.ts src/planner/conversion-planner.spec.ts
```

Expected: FAIL because `FileMigrator` still owns original source reading, parsing, and analysis.

- [ ] **Step 3: Refactor FileMigrator to consume analysis**

Move no policy into the stage. For parsed templates, pass `template.source`, `template.parseResult.elements`, and `template.inputs` to `ConversionPlanner`. For parse errors, map the stored diagnostics directly. Canonical file identities come from `template.file`. Keep destination reads and changed-template validation narrowly named in dependencies.

- [ ] **Step 4: Remove obsolete parser/analyzer constructor paths**

Delete production `readTemplate`, initial `parser`, and `analyzer` dependencies from `FileMigratorDependencies`. Do not retain an overload that reconstructs analysis from path strings. Update test builders rather than introducing a second compatibility execution path.

- [ ] **Step 5: Verify Task 3 GREEN and mutation counts**

Run:

```bash
npx vitest run src/migrator/file.migrator.spec.ts src/planner/conversion-planner.spec.ts src/pipeline/analyze/analyze-project.stage.spec.ts
npm run typecheck
npm run lint
```

Expected: all pass; original reads/parses/analyzes are absent from FileMigrator.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/migrator/file.migrator.ts src/migrator/file.migrator.spec.ts src/migrator/file-migration-result.ts src/planner/conversion-planner.ts src/planner/conversion-planner.spec.ts
git commit -m "refactor: render analyzed templates"
```

---

### Task 4: Cut production over to Discover and Analyze

**Files:**

- Modify: `src/pipeline/current-migration.pipeline.ts`
- Modify: `src/pipeline/current-migration.pipeline.spec.ts`
- Modify: `src/migrator/migrator.ts`
- Modify: `src/migrator/migrator.spec.ts`
- Modify: `src/migrator/folder.migrator.ts`
- Modify: `src/migrator/folder.migrator.spec.ts`
- Modify: `src/cli/run-cli.spec.ts`
- Modify: `test/cli/cli.test.ts`

**Interfaces:**

- Consumes: concrete `DiscoverProjectStage`, `AnalyzeProjectStage`, `AnalyzedProject`, invocation-scoped `ConversionAdapterSession`, and existing migration options.
- Produces:

```ts
export type MigratorFactory = (
  session: ConversionAdapterSession,
  analyzed: AnalyzedProject,
) => Pick<Migrator, 'migrate'>;

export class Migrator {
  constructor(
    session: ConversionAdapterSession,
    analyzed: AnalyzedProject,
    now?: () => number,
    transaction?: Pick<MigrationTransaction, 'preflight' | 'apply'>,
    stylesheetPlanner?: Pick<StylesheetPlanner, 'plan'>,
    dependencies?: MigratorDependencies,
  );
  migrate(options?: MigrationOptions): Promise<MigrationReport>;
}

export class CurrentMigrationPipeline implements MigrationRunner {
  constructor(
    session: ConversionAdapterSession,
    discover?: DiscoverStage,
    analyze?: AnalyzeStage,
    createMigrator?: MigratorFactory,
  );
  run(invocation: MigrationInvocation): Promise<MigrationReport>;
}
```

- `MigratorDependencies` retains only downstream needs: destination/reference reads, validation parser if needed outside FileMigrator, and analyzed-template renderer construction. It contains no discovery callback, input stat, ignore loader, initial source reader, or analyzer.
- `CurrentMigrationPipeline.run()` calls Discover once, Analyze once, then creates one Migrator and calls `migrate()` once.

- [ ] **Step 1: Write failing production-composition tests**

Test exact ordering and handoff identity with controlled stages:

```ts
expect(events).toEqual(['discover', 'analyze', 'create-migrator', 'migrate']);
expect(analyze.run).toHaveBeenCalledWith(manifest);
expect(createMigrator).toHaveBeenCalledWith(session, analyzed);
expect(migrate).toHaveBeenCalledWith(invocation.options);
```

Add failure tests proving Discover failure prevents Analyze and Migrator creation, and Analyze failure prevents Migrator creation. Preserve raw path and report behavior assertions.

- [ ] **Step 2: Rewrite Migrator tests around authoritative analyzed projects**

Update the test harness so discovery and initial analysis occur through real stages where integration behavior matters. Keep focused Migrator unit tests supplied with explicit `AnalyzedProject` fixtures. Add assertions that nested folders preserve manifest order, parse errors skip application, native CSS reference collection does not reread an in-place original, and one adapter session finalization occurs.

- [ ] **Step 3: Run Task 4 tests and verify RED**

Run:

```bash
npx vitest run src/pipeline/current-migration.pipeline.spec.ts src/migrator/migrator.spec.ts src/migrator/folder.migrator.spec.ts src/cli/run-cli.spec.ts test/cli/cli.test.ts
```

Expected: FAIL because the production façade still delegates directly to a path-owning Migrator.

- [ ] **Step 4: Route CurrentMigrationPipeline through concrete stages**

Construct default Discover and Analyze stages once per pipeline instance. In `run()`, await Discover, await Analyze, create the continuation with the analyzed handoff, and call `migrate(invocation.options)` once. Wrap errors through the existing public compatibility mapping so terminal and JSON messages remain unchanged; do not expose `PipelineStageError` stage text.

- [ ] **Step 5: Remove discovery and analysis from Migrator**

Delete `stat`, `.gitignore`, `FolderMigrator`, initial reader/parser/analyzer, input/output constructor fields, and discovery callbacks from the production Migrator path. Iterate `analyzed.templates` in order and create one analyzed-input `FileMigrator` per template. Build reports from `analyzed.manifest.invocation.inputPath` and `.outputPath` so raw public paths remain unchanged.

For native CSS reference collection:

- use proposed template contents for changed template artifacts;
- use `AnalyzedTemplate.source` for an in-place unchanged template;
- read only a distinct existing destination when no proposed artifact exists;
- preserve incomplete-authority behavior on missing or unparseable destination content.

- [ ] **Step 6: Retire FolderMigrator production authority**

Remove `FolderMigrator` from the production graph. Prefer deleting it and moving any still-useful discovery characterization into `DiscoverProjectStage` tests. If a compatibility export must remain, make it unreachable from `src/cli`, `src/pipeline`, and `src/migrator/migrator.ts`, and mark it for deletion in Slice 8. Do not leave a production path that discovers and then calls FileMigrator independently.

- [ ] **Step 7: Verify Task 4 GREEN and public parity**

Run:

```bash
npx vitest run src/pipeline/current-migration.pipeline.spec.ts src/migrator/migrator.spec.ts src/migrator/file.migrator.spec.ts src/pipeline/discover/discover-project.stage.spec.ts src/pipeline/analyze/analyze-project.stage.spec.ts src/cli/run-cli.spec.ts test/cli/cli.test.ts test/compatibility/enterprise-rewrite-parity.test.ts
npm run build
npm run package:check
```

Expected: all pass with exact existing terminal/report/exit behavior and packaged execution.

- [ ] **Step 8: Commit Task 4**

```bash
git add src/pipeline/current-migration.pipeline.ts src/pipeline/current-migration.pipeline.spec.ts src/migrator src/cli/run-cli.spec.ts test/cli/cli.test.ts
git commit -m "refactor: route migration through discovery and analysis"
```

---

### Task 5: Enforce ownership and publish Slice 3 evidence

**Files:**

- Modify: `test/architecture/enterprise-pipeline-shell-boundary.test.ts`
- Modify: `test/architecture/enterprise-pipeline-boundary.test.ts`
- Modify: `test/architecture/migration-transaction-boundary.test.ts`
- Modify: `test/architecture/typescript-boundary.ts`
- Modify: `test/performance/migration-workload-counter.test.ts`
- Modify: `test/package/architecture-baseline-contract.test.ts`
- Modify: `docs/architecture/enterprise-architecture-rewrite.md`
- Create: `docs/maintenance/2026-09-03-enterprise-discovery-analysis.md`
- Modify: `test/package/test-discovery.test.ts`

**Interfaces:**

- Consumes: the production graph after Task 4, existing semantic TypeScript inspection APIs, workload-counter schema, architecture inventory schema, benchmark schema, and public oracle.
- Produces: executable architecture ownership contracts and a checked-in Slice 3 evidence report. No existing JSON or Markdown table schema changes.

- [ ] **Step 1: Write failing architecture ownership assertions**

Extend semantic inspection only where current APIs cannot prove call provenance. Assert the exact graph:

```text
src/cli/run-cli.ts -> CurrentMigrationPipeline.run
CurrentMigrationPipeline.run -> DiscoverProjectStage.run
CurrentMigrationPipeline.run -> AnalyzeProjectStage.run
CurrentMigrationPipeline.run -> Migrator.migrate
Migrator.migrate -> MigrationTransaction.apply
```

Add adversarial positives and unrelated negatives proving:

- topology filesystem calls and ignore loading cannot originate outside Discover/legacy compatibility helper boundaries;
- initial template read, `AngularTemplateParser.parse`, and `TemplateAnalyzer.analyze` cannot originate in Migrator, FileMigrator, adapters, renderers, presenters, or CLI;
- Analyze cannot import adapter, planner, report, transaction, or filesystem mutation modules;
- reflected/aliased calls cannot bypass these authorities;
- changed-template validation reparses remain permitted only at their current named boundary.

- [ ] **Step 2: Run architecture tests and verify RED**

Run:

```bash
npx vitest run test/architecture/enterprise-pipeline-shell-boundary.test.ts test/architecture/enterprise-pipeline-boundary.test.ts test/architecture/migration-transaction-boundary.test.ts
```

Expected: FAIL until the inspectors and exact post-cutover graph assertions are updated.

- [ ] **Step 3: Implement semantic ownership inspection**

Reuse the central call-target, alias, CommonJS/dynamic-import, `.call`/`.apply`, and `Reflect.apply` provenance machinery. Add named findings for Discover and Analyze authorities rather than text matching. Cache an equivalent project inspection inside each scenario instead of reconstructing a TypeScript program for each assertion.

- [ ] **Step 4: Update deterministic workload expectations**

Keep the existing workload table columns and scenario names. Change only expected counts that genuinely improve after production cutover. Add direct assertions that every discovered template has one original read and one initial parse, parse-error templates have zero analyses, changed templates have one validation reparse, and unchanged templates have none.

Run:

```bash
npx vitest run test/performance/migration-workload-counter.test.ts test/package/architecture-baseline-contract.test.ts
```

Expected RED before expectation updates: the old baseline counts encode duplicated legacy ownership. Expected GREEN afterward: counters match the new single-owner execution.

- [ ] **Step 5: Generate inventory and benchmark evidence**

Run the repository's existing inventory and benchmark commands from `package.json`. Record commit, environment, deterministic before/after counts, and observational median/spread in `docs/maintenance/2026-09-03-enterprise-discovery-analysis.md`. Do not claim a timing improvement unless five same-machine samples support it. Preserve every existing schema and scenario.

- [ ] **Step 6: Update transition documentation**

Mark Slice 3 Discover/Analyze ownership as implemented in `enterprise-architecture-rewrite.md`. Name any retained compatibility helper and its Slice 8 deletion. State that Render through Apply remain on the compatibility continuation.

- [ ] **Step 7: Verify Task 5 GREEN**

Run:

```bash
npx vitest run test/architecture/enterprise-pipeline-shell-boundary.test.ts test/architecture/enterprise-pipeline-boundary.test.ts test/architecture/migration-transaction-boundary.test.ts test/performance/migration-workload-counter.test.ts test/package/architecture-baseline-contract.test.ts test/package/test-discovery.test.ts
npm run typecheck
npm run lint
npm run build
npm run package:check
git diff --check
```

Expected: all pass; dependency, lockfile, Changeset, inventory schema, benchmark schema, and public output diffs are empty.

- [ ] **Step 8: Commit Task 5**

```bash
git add test/architecture test/performance/migration-workload-counter.test.ts test/package docs/architecture/enterprise-architecture-rewrite.md docs/maintenance/2026-09-03-enterprise-discovery-analysis.md
git commit -m "test: enforce discovery and analysis ownership"
```

---

## Slice completion gate

- [ ] Run `npm run clean && npm run verify` from the Slice 3 worktree.
- [ ] Run the public compatibility oracle and packaged CLI matrix explicitly.
- [ ] Regenerate the architecture inventory and benchmark reports without schema changes.
- [ ] Confirm `git diff --check origin/main...HEAD` is clean.
- [ ] Confirm `package.json`, `package-lock.json`, `.changeset/`, workload schema, inventory schema, and benchmark schema have no unintended diff.
- [ ] Request independent whole-branch spec-compliance and code-quality review.
- [ ] Address Critical and Important findings through focused TDD fix commits and one scoped rereview.
- [ ] Open a pull request containing only Slice 3 after the branch is clean and all gates pass.
