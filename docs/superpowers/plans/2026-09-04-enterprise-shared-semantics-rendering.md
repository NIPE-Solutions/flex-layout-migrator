# Enterprise Shared Semantics and Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make target-neutral semantic policy and the concrete Render stage the sole production owners of responsive/dependency decisions and project rendering while preserving every public migration result.

**Architecture:** Move responsive family orchestration into `src/semantic`, express target interaction through narrow capability/render hooks, and keep Tailwind/CSS syntax and conflict logic in their target namespaces. Add `RenderProjectStage` to turn one `AnalyzedProject` and one invocation-scoped render session into an immutable `RenderedProject`, then narrow `Migrator` to validation-through-report compatibility work.

**Tech Stack:** TypeScript 6, Node.js 24, Angular compiler template model, Tailwind CSS 4 compiler-backed conflict inspection, Vitest 4, semantic TypeScript architecture inspection.

**Spec:** `docs/superpowers/specs/2026-09-04-enterprise-shared-semantics-rendering-design.md`

## Global Constraints

- Preserve converted and preserved bytes; generated Tailwind candidates and native CSS; diagnostic status, code, reason, suggestion, source, and ordering; discovered order; plan/write decisions; reports; terminal output; exit codes; stylesheet ownership; transactions; interruption behavior; and packaged entry points.
- The production route must be `Discover -> Analyze -> Render -> compatibility validation/application` with no observational or fallback render pass.
- Target-neutral responsive activation, precedence, family grouping, and dependency closure have one production owner outside `src/adapter`.
- Tailwind and native CSS retain distinct capability, syntax, artifact, and conflict decisions.
- Use one invocation-scoped target session and finalize it exactly once after all analyzed templates have been rendered.
- Stored original parse failures bypass semantic and target rendering and retain their current results.
- Keep changed-template edit validation, destination-state reads, stylesheet planning, transactions, and reporting behind named temporary boundaries for later slices.
- Do not add runtime dependencies, a Changeset, public behavior, a service locator, a DI framework, or a second production pipeline.
- Every production change follows a witnessed RED/GREEN TDD cycle.
- Timing results are observational unless five comparable samples support a claim; deterministic workload counters are hard assertions.

---

### Task 1: Establish the Target-Neutral Responsive and Dependency Owner

**Files:**

- Create: `src/semantic/conversion-context.ts`
- Create: `src/semantic/semantic-plan.ts`
- Create: `src/semantic/responsive-family.planner.ts`
- Create: `src/semantic/responsive-family.planner.spec.ts`
- Modify: `src/adapter/responsive-family.planner.ts`
- Modify: `src/adapter/tailwind/responsive-family.planner.ts`
- Modify: `src/adapter/css/css.adapter.ts`
- Modify: `src/adapter/conversion-adapter.ts`

**Interfaces:**

- Consumes: `LocatedFlexLayoutInput`, `TemplateElement`, `TemplateAttribute`, `BreakpointCatalog`, and existing family-specific semantic results from `src/flex` and `src/grid`.
- Produces:

```ts
export interface SemanticConversionContext {
  readonly element: TemplateElement;
  readonly parent?: TemplateElement;
  readonly inputs: readonly LocatedFlexLayoutInput[];
  readonly parentInputs: readonly LocatedFlexLayoutInput[];
  readonly existingClassNames: readonly string[];
  readonly attributeEvidence: readonly TemplateAttribute[];
  readonly activeLayout?: string;
  readonly activeParentLayout?: string;
}

export type SemanticPlan<TValue> =
  | { readonly status: 'planned'; readonly input: LocatedFlexLayoutInput; readonly family: DirectiveFamily; readonly value: TValue }
  | { readonly status: 'review' | 'invalid' | 'unsupported'; readonly input: LocatedFlexLayoutInput; readonly code: DiagnosticCode; readonly reason: string; readonly suggestion: string };

export interface SemanticTargetPolicy<TPlan extends ResponsiveOrchestrationPlan> {
  emptyPlan(input: LocatedFlexLayoutInput): TPlan;
  targetEligibility(input: LocatedFlexLayoutInput): TPlan | undefined;
  validateActivation(plan: TPlan): TPlan;
  isTargetEligibilityFailure(plan: TPlan): boolean;
  sameOutput(left: TPlan, right: TPlan): boolean;
  contextUnverified(input: LocatedFlexLayoutInput, reason: string): TPlan;
  contextualOutputUnverified(input: LocatedFlexLayoutInput): TPlan;
  responsivePrecedenceUnverified(input: LocatedFlexLayoutInput): TPlan;
  decorate(plan: TPlan): TPlan;
  addPrintFallback(plan: TPlan): TPlan;
}

export class ResponsiveFamilyPlanner<TPlan extends ResponsiveOrchestrationPlan> {
  constructor(catalog: BreakpointCatalog, policy: SemanticTargetPolicy<TPlan>);
  plan(inputs: readonly LocatedFlexLayoutInput[], context: SemanticConversionContext, planOne: ResponsivePlanOne<TPlan>, planExtendedFamily?: ResponsivePlanExtendedFamily<TPlan>): readonly TPlan[];
  closeDependencies(inputs: readonly LocatedFlexLayoutInput[], context: SemanticConversionContext, planOne: ResponsivePlanOne<TPlan>): readonly TPlan[];
}
```

- `src/adapter/responsive-family.planner.ts` becomes a type-only compatibility re-export during this task and is deleted in Task 5 after all callers move.

- [ ] **Step 1: Write failing ownership and behavior tests**

Copy no production implementation into the test. Move the existing responsive-family behavioral table to the new semantic test and add explicit local/parent dependency cases:

```ts
test('blocks a layout-dependent family when one responsive layout member is unresolved', () => {
  const plans = planner.plan(
    [literal('fxLayout', 'row'), responsive('fxLayout', 'dynamic', 'md', 'property'), literal('fxLayoutGap', '16px')],
    context,
    planOne,
  );

  expect(plans.find(plan => plan.input.directive === 'fxLayoutGap')).toMatchObject({
    status: 'review',
    code: 'context-unverified',
  });
});

test('uses parent responsive layout activation when planning flex-item semantics', () => {
  expect(planner.plan([literal('fxFlex', '25')], childContextWithResponsiveParent, planOne)).toEqual(
    expectedFlexPlans,
  );
});
```

Add an architecture assertion that resolved runtime imports of `BreakpointCatalog` plus responsive range intersection from adapter planners fail the test.

- [ ] **Step 2: Verify Task 1 RED**

Run:

```bash
npx vitest run src/semantic/responsive-family.planner.spec.ts test/architecture/enterprise-pipeline-boundary.test.ts
```

Expected: FAIL because `src/semantic/responsive-family.planner.ts` and its exported contracts do not exist and adapter provenance still owns the planner.

- [ ] **Step 3: Move the shared planner without changing algorithms**

Move `DirectiveFamily`, range subtraction/coverage, family grouping, contextual layout planning, precedence checks, decoration sequencing, and dependency closure from `src/adapter/responsive-family.planner.ts` into the new semantic module. Replace adapter-relative `ConversionContext` with `SemanticConversionContext`. Preserve code-unit and source-order iteration exactly.

The compatibility module contains only:

```ts
export {
  ResponsiveFamilyPlanner as SharedResponsiveFamilyPlanner,
  type DirectiveFamily,
  type ResponsiveOrchestrationPlan,
  type ResponsivePlanExtendedFamily,
  type ResponsivePlanOne,
  type SemanticTargetPolicy as ResponsiveFamilyPolicy,
} from '../semantic/responsive-family.planner';
```

- [ ] **Step 4: Redirect Tailwind and CSS responsive owners**

Import `ResponsiveFamilyPlanner` and its policy types from `src/semantic`. Keep current policy callbacks byte-for-byte equivalent: Tailwind decoration still emits candidate variants and print fallbacks; CSS eligibility still rejects unverified breakpoints; output equivalence still compares canonical classes or declarations as appropriate.

Remove responsive orchestration implementation from adapter files. Do not move Tailwind candidate creation or CSS declarations into `src/semantic`.

- [ ] **Step 5: Verify Task 1 GREEN**

Run:

```bash
npx vitest run src/semantic/responsive-family.planner.spec.ts src/adapter/tailwind/responsive-family.planner.spec.ts src/adapter/css/css.adapter.spec.ts test/compatibility/flex-renderer-parity.test.ts test/architecture/enterprise-pipeline-boundary.test.ts
npm run typecheck
npm run lint
```

Expected: all pass with existing snapshots and diagnostic text unchanged.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/semantic src/adapter/responsive-family.planner.ts src/adapter/tailwind/responsive-family.planner.ts src/adapter/css/css.adapter.ts src/adapter/conversion-adapter.ts test/architecture/enterprise-pipeline-boundary.test.ts
git commit -m "refactor: establish shared responsive semantics"
```

---

### Task 2: Replace Policy-Rich Adapters with Semantic Render Sessions

**Files:**

- Create: `src/semantic/element-semantic.planner.ts`
- Create: `src/semantic/element-semantic.planner.spec.ts`
- Create: `src/render/conversion-renderer.ts`
- Create: `src/render/render-session.ts`
- Create: `src/render/render-session.spec.ts`
- Create: `src/render/tailwind/tailwind.renderer.ts`
- Create: `src/render/css/css.renderer.ts`
- Modify: `src/planner/conversion-planner.ts`
- Modify: `src/planner/conversion-planner.spec.ts`
- Modify: `src/adapter/conversion-adapter.ts`
- Modify: `src/adapter/conversion-adapter.session.ts`
- Modify: `src/adapter/adapter.factory.ts`
- Modify: `src/adapter/tailwind/tailwind.adapter.ts`
- Modify: `src/adapter/css/css.adapter.ts`

**Interfaces:**

- Consumes: analyzed element context, shared responsive planner, existing pure semantic functions, and target-specific render strategies.
- Produces:

```ts
export interface RenderedConversion {
  readonly status: 'converted';
  readonly input: LocatedFlexLayoutInput;
  readonly classNames: readonly string[];
}

export interface ConversionRenderer {
  readonly target: 'tailwind' | 'css';
  eligibility(input: LocatedFlexLayoutInput): PlannedConversion | undefined;
  render(plan: ResolvedSemanticPlan, context: SemanticConversionContext): PlannedConversion;
  resolveConflicts(plans: readonly PlannedConversion[], context: SemanticConversionContext): readonly PlannedConversion[];
  record(plans: readonly PlannedConversion[]): void;
}

export interface RenderSession {
  readonly renderer: ConversionRenderer;
  finalize(): AdapterSessionResult;
}

export class ElementSemanticPlanner {
  plan(inputs: readonly LocatedFlexLayoutInput[], context: SemanticConversionContext, renderer: ConversionRenderer): readonly PlannedConversion[];
}
```

- The public CLI factory continues to return an invocation-scoped session; compatibility names may re-export the new types until Task 5.
- `ConversionPlanner.plan` receives `ConversionRenderer` plus `ElementSemanticPlanner` rather than invoking policy callbacks on `ConversionAdapter`.

- [ ] **Step 1: Write failing semantic/renderer separation tests**

Add tests that use a recording renderer and real semantic inputs:

```ts
test('closes semantic dependencies before rendering target output', () => {
  const plans = semanticPlanner.plan(inputs, context, renderer);

  expect(renderer.renderedFamilies).toEqual(['layout', 'layout-gap', 'flex-item']);
  expect(plans.map(plan => plan.status)).toEqual(['converted', 'converted', 'converted']);
});

test('does not render a family rejected by shared dependency policy', () => {
  semanticPlanner.plan(inputsWithUnresolvedLayout, context, renderer);
  expect(renderer.renderedFamilies).not.toContain('layout-gap');
});

test('render sessions reject work after exactly one finalization', () => {
  session.finalize();
  expect(() => session.finalize()).toThrow('Render session already finalized');
  expect(() => session.renderer.render(plan, context)).toThrow('Render session is finalized');
});
```

For every Flex family shared by both targets, assert that one resolved semantic value is handed separately to Tailwind and CSS renderers and produces the existing expected candidates/declarations.

- [ ] **Step 2: Verify Task 2 RED**

Run:

```bash
npx vitest run src/semantic/element-semantic.planner.spec.ts src/render/render-session.spec.ts src/planner/conversion-planner.spec.ts test/compatibility/flex-renderer-parity.test.ts
```

Expected: FAIL because the semantic planner, renderer contract, and render session do not exist.

- [ ] **Step 3: Implement the semantic plan coordinator**

Move element-family grouping, repeated responsive closure, display dependency closure, grid parent dependency closure, and conservative downgrade creation out of `TailwindAdapter` and `CssAdapter` into `ElementSemanticPlanner`. Call existing `planLayout`, `planLayoutGapSemantics`, `planLayoutAlignment`, `planFlexItemSemantics`, `planFlexAlignSemantics`, `planFlexFillSemantics`, `planFlexOffsetSemantics`, `planFlexOrderSemantics`, Grid parsing, visibility planning, and extended-family parsing through family-specific pure helpers.

Use a stable two-pass closure matching current behavior:

```ts
let closed = responsive.closeDependencies(plans, context, planOne);
closed = closeDisplayDependencies(closed, context);
closed = responsive.closeDependencies(closed, context, planOne);
closed = closeDisplayDependencies(closed, context);
return closeGridParentDependencies(closed, context, plansByInputId);
```

Do not create target strings in the semantic namespace.

- [ ] **Step 4: Implement target renderers by delegation**

Move the existing Tailwind strategy selection, responsive candidate emission, extended/Grid/visibility emission, and class-conflict logic behind `TailwindRenderer`. Move CSS declarations, capability rejection, `CssArtifactRegistry` recording, class identity, and CSS conflict/invariant checks behind `CssRenderer`.

During this step, old adapter classes become thin compatibility delegates:

```ts
/** @deprecated Remove in Slice 8 after all external compatibility tests use RenderSession. */
export class TailwindAdapter implements ConversionAdapter {
  constructor(private readonly delegate: TailwindRenderer) {}
  // Forward target rendering only; no responsive or dependency algorithms.
}
```

Never duplicate a moved algorithm between delegate and compatibility class.

- [ ] **Step 5: Narrow `ConversionPlanner` and session lifecycle**

Replace calls to `adapter.planElement`, `adapter.closePlanDependencies`, and `adapter.acceptPlans` with one `ElementSemanticPlanner.plan` call followed by renderer conflict resolution and recording. Preserve bound-class blocking and source edit order in `ConversionPlanner`, because edit materialization remains outside target renderers.

Make the session-bound renderer assert activity around every method and freeze the finalized `AdapterSessionResult` exactly as the current session does.

- [ ] **Step 6: Verify Task 2 GREEN**

Run:

```bash
npx vitest run src/semantic src/render src/planner/conversion-planner.spec.ts src/adapter/tailwind/tailwind.adapter.spec.ts src/adapter/css/css.adapter.spec.ts test/compatibility/flex-renderer-parity.test.ts test/compatibility/native-css-stylesheet.test.ts test/compatibility/angular-template-engine.test.ts
npm run typecheck
npm run lint
```

Expected: all pass; golden candidates, CSS declarations, diagnostics, and order remain unchanged.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/semantic src/render src/planner src/adapter
git commit -m "refactor: separate semantic planning from target rendering"
```

---

### Task 3: Add the Concrete Render Project Stage

**Files:**

- Create: `src/pipeline/render/render-project.stage.ts`
- Create: `src/pipeline/render/render-project.stage.spec.ts`
- Create: `src/pipeline/render/compatibility-edit.validator.ts`
- Create: `src/pipeline/render/compatibility-edit.validator.spec.ts`
- Modify: `src/pipeline/rendered-project.ts`
- Modify: `src/pipeline/pipeline-handoffs.spec.ts`
- Modify: `src/migrator/analyzed-file.migrator.ts`
- Modify: `src/migrator/analyzed-file.migrator.spec.ts`

**Interfaces:**

- Consumes: `AnalyzedProject`, one `RenderSession`, `ConversionPlanner`, `SourceEditor`, destination template source, and generated-template parser.
- Produces:

```ts
export interface RenderTemplatePlanner {
  plan(template: Extract<AnalyzedTemplate, { readonly status: 'parsed' }>, renderer: ConversionRenderer, options: ConversionPlanningOptions): FilePlan;
}

export interface CompatibilityEditValidator {
  validate(template: AnalyzedTemplate, plan: FilePlan): Promise<FileMigrationPlan>;
}

export class RenderProjectStage implements RenderStage {
  constructor(session: RenderSession, templatePlanner?: RenderTemplatePlanner, editValidator?: CompatibilityEditValidator);
  run(analyzed: AnalyzedProject): Promise<RenderedProject>;
}
```

- Parse-error conversion results are built from stored diagnostics with `template-parse-error`; neither planner nor renderer is called.
- `CompatibilityEditValidator` owns only edit application, changed-output reparse, and distinct destination original-state reads. Its removal owner is slice 5.

- [ ] **Step 1: Write failing stage lifecycle and ordering tests**

```ts
test('renders parsed templates in analyzed order and finalizes once', async () => {
  const rendered = await stage.run(analyzed);

  expect(plannedPaths).toEqual([firstInput, secondInput]);
  expect(finalizeCalls).toBe(1);
  expect(rendered.files.map(file => file.file.inputPath)).toEqual([firstInput, secondInput]);
  expect(Object.isFrozen(rendered)).toBe(true);
});

test('preserves stored parse diagnostics without invoking semantic or target rendering', async () => {
  const rendered = await stage.run(projectWithParseError);
  expect(plannerCalls).toBe(0);
  expect(rendered.files[0]?.file.results).toEqual(expectedTemplateParseResults);
});

test('does not finalize after a template render throws', async () => {
  await expect(stage.run(analyzed)).rejects.toThrow(renderFailure);
  expect(finalizeCalls).toBe(0);
});
```

Add validator tests for unchanged source, invalid edit ranges, generated-template parse errors, in-place original reuse, distinct destination present/absent state, and exact destination read error propagation.

- [ ] **Step 2: Verify Task 3 RED**

Run:

```bash
npx vitest run src/pipeline/render/render-project.stage.spec.ts src/pipeline/render/compatibility-edit.validator.spec.ts src/pipeline/pipeline-handoffs.spec.ts
```

Expected: FAIL because concrete Render stage and compatibility validator do not exist.

- [ ] **Step 3: Extract the compatibility edit validator**

Move `SourceEditor.apply`, generated-template reparse, `originalState`, and artifact equality code from `AnalyzedFileMigrator` into `CompatibilityEditValidator`. Pass original source and paths through `AnalyzedTemplate`; do not reread in-place input source.

Invalid edit plans retain:

```ts
throw new Error(`Invalid edit plan for ${template.file.inputPath}: ${diagnostics.join('; ')}`);
```

Generated parse failures retain `generated-template-parse-error`, output filename, message, and source ranges.

- [ ] **Step 4: Implement `RenderProjectStage`**

Iterate `analyzed.templates` sequentially. Convert stored original parse errors directly. For parsed templates, call the template planner once and compatibility validator once. Only after every file succeeds call `session.finalize()` and construct `renderedProject({ analyzed, files, session: sessionResult })`.

Freeze no ad hoc copy; use the existing handoff factory so one-to-one identity invariants remain centralized.

- [ ] **Step 5: Verify Task 3 GREEN**

Run:

```bash
npx vitest run src/pipeline/render src/pipeline/pipeline-handoffs.spec.ts src/migrator/analyzed-file.migrator.spec.ts src/planner/conversion-planner.spec.ts
npm run typecheck
npm run lint
```

Expected: all pass and the stage finalizes once only after successful ordered rendering.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/pipeline/render src/pipeline/rendered-project.ts src/pipeline/pipeline-handoffs.spec.ts src/migrator/analyzed-file.migrator.ts src/migrator/analyzed-file.migrator.spec.ts
git commit -m "refactor: add project render stage"
```

---

### Task 4: Route Production Through Render and Narrow the Migrator

**Files:**

- Modify: `src/pipeline/current-migration.pipeline.ts`
- Modify: `src/pipeline/current-migration.pipeline.spec.ts`
- Modify: `src/cli/run-cli.ts`
- Modify: `src/cli/run-cli.spec.ts`
- Modify: `src/migrator/migrator.ts`
- Modify: `src/migrator/migrator.spec.ts`
- Modify: `src/adapter/adapter.factory.ts`
- Modify: `test/performance/migration-workload-counter.test.ts`
- Modify: `test/compatibility/enterprise-rewrite-parity.test.ts`

**Interfaces:**

- Consumes: concrete Discover, Analyze, and Render stages plus `RenderedProject`.
- Produces:

```ts
export interface RenderedMigrationContinuation {
  migrate(options?: MigrationOptions, execution?: MigrationExecutionContext): Promise<MigrationReport>;
}

export type MigratorFactory = (rendered: RenderedProject) => RenderedMigrationContinuation;

export class Migrator {
  constructor(rendered: RenderedProject, now?: () => number, transaction?: MigrationTransactionPort, stylesheetPlanner?: StylesheetPlannerPort, dependencies?: MigratorDependencies);
}
```

- `CurrentMigrationPipeline` receives `RenderStage`; session construction occurs once in CLI composition and is owned by the concrete Render stage.
- `Migrator` uses `rendered.files` and `rendered.session`; it does not import `ConversionAdapter`, `ConversionAdapterSession`, semantic planners, renderers, `ConversionPlanner`, or session finalization.

- [ ] **Step 1: Write failing production-route tests**

Update the façade test to use ordered stage sentinels:

```ts
test('runs discover, analyze, render, then the rendered continuation exactly once', async () => {
  await pipeline.run(invocation);
  expect(events).toEqual(['discover', 'analyze', 'render', 'create-continuation', 'migrate']);
  expect(receivedRendered).toBe(rendered);
});
```

Update Migrator tests to construct a real `RenderedProject` and prove it never calls rendering:

```ts
test('builds validation/application work from the rendered handoff', async () => {
  const report = await new Migrator(rendered).migrate(options);
  expect(report.files).toEqual(expectedFiles);
  expect(renderCalls).toBe(0);
});
```

Add workload assertions `semanticPlanningPasses === parsedTemplates`, `targetSessionFinalizations === 1`, and `targetRenders === convertedFamilies` using injected production ports rather than source-text counters.

- [ ] **Step 2: Verify Task 4 RED**

Run:

```bash
npx vitest run src/pipeline/current-migration.pipeline.spec.ts src/migrator/migrator.spec.ts src/cli/run-cli.spec.ts test/performance/migration-workload-counter.test.ts test/compatibility/enterprise-rewrite-parity.test.ts
```

Expected: FAIL because the façade stops after Analyze, Migrator still receives `AnalyzedProject` and a session, and counters cannot observe the new owners.

- [ ] **Step 3: Route `CurrentMigrationPipeline` through Render**

Call stages in strict order and preserve invocation path remapping around each compatibility boundary. Start timing before Discover as today. Create the continuation only after a valid `RenderedProject` exists.

```ts
const manifest = await compatible(() => this.discover.run(invocation), invocation);
const analyzed = await compatible(() => this.analyze.run(manifest), invocation);
const rendered = await compatible(() => this.render.run(analyzed), invocation);
return this.createMigrator(rendered).migrate(invocation.options, { now: this.now, startedAt });
```

- [ ] **Step 4: Narrow `Migrator` to rendered input**

Delete its file-render loop and session finalization. Initialize `filePlans` from `this.rendered.files` and `sessionResult` from `this.rendered.session`. Retain path validation, CSS reference collection, stylesheet planning, migration-plan construction, preflight/apply decisions, report construction, and destination read error mapping unchanged.

For CSS reference collection, match `rendered.analyzed.templates[index]` against `rendered.files[index]` and preserve the existing internal-invariant failure.

- [ ] **Step 5: Update CLI composition and workload instrumentation**

Construct exactly one render session from the selected target configuration, pass it to `RenderProjectStage`, and pass the stage into `CurrentMigrationPipeline`. Instrument semantic planner, renderer, and session wrappers without changing production behavior or benchmark schemas.

- [ ] **Step 6: Verify Task 4 GREEN and public parity**

Run:

```bash
npx vitest run src/pipeline/current-migration.pipeline.spec.ts src/migrator/migrator.spec.ts src/cli/run-cli.spec.ts test/performance/migration-workload-counter.test.ts test/compatibility/enterprise-rewrite-parity.test.ts test/cli/cli.test.ts test/compatibility
npm run typecheck
npm run lint
```

Expected: all pass; every scenario observes one session finalization and no second render pass.

- [ ] **Step 7: Commit Task 4**

```bash
git add src/pipeline/current-migration.pipeline.ts src/pipeline/current-migration.pipeline.spec.ts src/cli src/migrator/migrator.ts src/migrator/migrator.spec.ts src/adapter/adapter.factory.ts test/performance/migration-workload-counter.test.ts test/compatibility/enterprise-rewrite-parity.test.ts
git commit -m "refactor: route migration through project rendering"
```

---

### Task 5: Enforce Ownership, Remove Superseded Paths, and Publish Evidence

**Files:**

- Modify: `test/architecture/enterprise-pipeline-boundary.test.ts`
- Modify: `test/architecture/enterprise-pipeline-shell-boundary.test.ts`
- Modify: `test/architecture/migration-transaction-boundary.test.ts`
- Modify: `test/architecture/typescript-boundary.ts`
- Create: `test/compatibility/shared-semantic-target-parity.test.ts`
- Modify: `test/package/test-discovery.test.ts`
- Delete: `src/adapter/responsive-family.planner.ts`
- Modify or delete if unreachable: `src/adapter/conversion-adapter.ts`
- Modify: `docs/architecture/enterprise-architecture-rewrite.md`
- Create: `docs/maintenance/2026-09-04-enterprise-shared-semantics-rendering.md`
- Modify: `test/package/architecture-baseline-contract.test.ts`

**Interfaces:**

- Consumes: the completed semantic, renderer, Render-stage, and continuation authority graph.
- Produces: executable import/call ownership rules, cross-target parity contracts, updated structural evidence, and no reachable legacy semantic/render path.

- [ ] **Step 1: Write failing semantic architecture boundaries**

Use the TypeScript symbol resolver rather than substring matching. Add assertions equivalent to:

```ts
expect(runtimeOwnersOf('ResponsiveFamilyPlanner')).toEqual(['src/semantic/responsive-family.planner.ts']);
expect(importsFromNamespace('src/semantic', ['src/adapter', 'src/render', 'node:fs', 'src/edit', 'src/report', 'src/transaction'])).toEqual([]);
expect(callersOfMethod('finalize', 'RenderSession')).toEqual(['src/pipeline/render/render-project.stage.ts']);
expect(runtimeImports('src/migrator/migrator.ts')).not.toContainAny([
  'src/semantic',
  'src/render',
  'src/planner/conversion-planner.ts',
  'src/adapter/conversion-adapter.session.ts',
]);
```

Retain negative controls proving test doubles, type-only imports, compatibility aliases, and unrelated `finalize` methods are not classified as production authority.

- [ ] **Step 2: Write failing cross-target semantic parity contracts**

Create one table covering `fxLayout`, `fxLayoutGap`, `fxLayoutAlign`, `fxFlex`/`fxGrow`/`fxShrink`, `fxFlexAlign`, `fxFlexFill`/`fxFill`, `fxFlexOffset`, and `fxFlexOrder`. Each row asserts a shared resolved family/value plus the exact established Tailwind candidates and CSS declarations.

Add explicit divergence rows for Grid, visibility, responsive class/style, orientation, print, custom breakpoints, dynamic bindings, Tailwind class conflicts, and CSS unsupported results. Assert full diagnostics, not only status.

- [ ] **Step 3: Verify Task 5 RED**

Run:

```bash
npx vitest run test/architecture/enterprise-pipeline-boundary.test.ts test/architecture/enterprise-pipeline-shell-boundary.test.ts test/architecture/migration-transaction-boundary.test.ts test/compatibility/shared-semantic-target-parity.test.ts test/package/architecture-baseline-contract.test.ts
```

Expected: FAIL until superseded adapter ownership is removed and evidence is updated.

- [ ] **Step 4: Remove superseded production paths**

Delete the responsive compatibility barrel after confirming `rg "adapter/responsive-family|SharedResponsiveFamilyPlanner" src test` has no runtime caller. Delete or reduce `ConversionAdapter` to a type-only deprecated compatibility alias only when package and source imports prove a live test need; it must not expose `planElement`, `closePlanDependencies`, or `acceptPlans`.

Update test discovery only for newly added top-level compatibility tests. Do not delete `FileMigrator`/`FolderMigrator` tombstones assigned to slice 8 unless the architecture inventory proves the deletion is mechanical and unrelated.

- [ ] **Step 5: Update architecture and performance evidence**

Mark slice 4 implemented in `enterprise-architecture-rewrite.md`, naming `ElementSemanticPlanner`, target renderers, `RenderProjectStage`, and the slice-5 compatibility validator debt.

Generate inventory and benchmark evidence:

```bash
npm run architecture:inventory
npm run benchmark:architecture:prepare
npm run benchmark:architecture -- --samples 5
```

Record deterministic before/after counts, module ownership, and all five timing samples in `docs/maintenance/2026-09-04-enterprise-shared-semantics-rendering.md`. State that timings are observational unless the median is repeatably improved.

- [ ] **Step 6: Verify focused ownership GREEN**

Run:

```bash
npx vitest run test/architecture test/compatibility/shared-semantic-target-parity.test.ts test/performance/migration-workload-counter.test.ts test/package/architecture-baseline-contract.test.ts test/package/test-discovery.test.ts
npm run typecheck
npm run lint
```

Expected: all pass with one shared semantic owner, one Render-stage finalization owner, and no downstream rendering authority.

- [ ] **Step 7: Run the complete completion gate**

Run:

```bash
npm run clean
npm run verify
git diff --check
git status --short
```

Expected: verification and packaged CLI execution pass; `git diff --check` is silent; status contains only intentional tracked slice files plus the pre-existing untracked `.DS_Store` files.

- [ ] **Step 8: Commit Task 5**

```bash
git add src/semantic src/render src/adapter src/pipeline test docs/architecture/enterprise-architecture-rewrite.md docs/maintenance/2026-09-04-enterprise-shared-semantics-rendering.md package.json
git commit -m "test: enforce shared semantics and rendering ownership"
```

- [ ] **Step 9: Perform whole-branch review and fix findings**

Review `git diff origin/main...HEAD` against every acceptance criterion in the spec. For each real finding, add a failing regression test, witness RED, implement the minimal correction, rerun the focused suite, and commit with `fix:`. Then rerun `npm run clean && npm run verify` and packaged CLI checks before push/PR handoff.

## Slice Completion Gate

Before presenting the branch as complete, confirm all of the following with fresh command output:

- [ ] Discover, Analyze, and Render execute exactly once in production order.
- [ ] Shared responsive/dependency policy has one owner outside target namespaces.
- [ ] Tailwind and CSS renderers own only capability, syntax, artifact, and conflict behavior.
- [ ] Every parsed template has one semantic planning pass; each converted family has one target render.
- [ ] The target session is invocation-scoped and finalized exactly once.
- [ ] `Migrator` consumes `RenderedProject` and cannot render or finalize.
- [ ] Stored parse errors bypass semantic and target work.
- [ ] Cross-target shared semantics and intentional divergences are executable contracts.
- [ ] Public parity, architecture, workload, coverage, build, and package checks pass.
- [ ] No new runtime dependency, Changeset, public behavior, or second pipeline exists.
- [ ] The only remaining tracked compatibility debt is named for slices 5, 7, or 8.
