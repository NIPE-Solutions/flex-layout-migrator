# Enterprise architecture final evidence

This document records the implementation and evidence result for Slice 9 of the enterprise architecture rewrite. Structural and workload values are executable documentation contracts. Timing and peak-memory values are observations from one same-machine run, not CI limits.

## Commit

Commit captured: `fafb4177d0482303730fe810adb1fdf180c387c5`

This is the final production implementation commit. The evidence-only documentation and test commit follows it and does not alter `src`, package metadata, the benchmark runner, or the benchmark corpus.

## Environment

- Node.js: `v24.20.0`
- npm: `11.19.0`
- Platform: `darwin-arm64`
- Operating system: `macOS 14.6.1` (`23G93`)
- Kernel: `Darwin 23.6.0`, `RELEASE_ARM64_T6031`

Evidence was generated with:

```text
npm run architecture:inventory -- --json /tmp/flex-layout-roadmap-final-inventory.json
npm ls --omit=dev --all --json
npm run package:check
npx vitest run test/performance/migration-workload-counter.test.ts test/compatibility test/cli/cli.test.ts
npm run build
npm run package:check
npm run benchmark:architecture:prepare
npm run benchmark:architecture -- --json /tmp/flex-layout-roadmap-final-benchmark.json
```

## Final route

Every production CLI invocation uses this single route:

```text
CLI -> Discover -> Analyze -> Render -> Validate -> Apply -> Presentation
```

`runCli` composes one `MigrationPipeline`; `MigrationPipeline` invokes each of the five stages once and in order; `MigrationRunner` constructs the report from the applied handoff; `TerminalPresenter` and `JsonReportWriter` observe the completed report. There is no compatibility fallback or second production route.

## Ownership map

| Boundary              | Production owner                                                                               | Exclusive authority                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| CLI composition       | `src/cli/run-cli.ts` (`runCli`)                                                                | Argument validation, stage construction, presentation selection, and exit mapping                                           |
| Discover              | `src/pipeline/discover/discover-project.stage.ts` (`DiscoverProjectStage`)                     | Topology enumeration, ignore matching, exclusions, deterministic file identity and order                                    |
| Analyze               | `src/pipeline/analyze/analyze-project.stage.ts` (`AnalyzeProjectStage`)                        | Original template read, initial Angular parse, and source-input analysis                                                    |
| Render                | `src/pipeline/render/render-project.stage.ts` (`RenderProjectStage`)                           | Semantic-plan consumption, target rendering, and one render-session finalization                                            |
| Validate              | `src/pipeline/validate/validate-project.stage.ts` (`ValidateProjectStage`)                     | Edit materialization, changed-template reparse, topology, CSS reference collection, stylesheet planning, and canonical plan |
| Apply                 | `src/pipeline/apply/apply-project.stage.ts` (`ApplyProjectStage`)                              | Mode/error decision and the sole project-level mutation call                                                                |
| Transaction policy    | `src/transaction/migration-transaction.ts` (`MigrationTransaction`)                            | Preflight seal, state transitions, cancellation scope, rollback/cleanup sequencing, and recovery evidence                   |
| Transaction mechanics | `src/transaction/staging.unit.ts`, `commit.unit.ts`, `rollback.unit.ts`, and `cleanup.unit.ts` | One focused filesystem responsibility per unit through `TransactionUnitSession`                                             |
| Report construction   | `src/pipeline/migration-runner.ts` and `src/report/migration-report.builder.ts`                | Mapping the applied handoff to the unchanged public report                                                                  |
| Presentation          | `src/report/terminal.presenter.ts` and `src/report/json-report.writer.ts`                      | Observer-only terminal and report-file side effects                                                                         |

## Inventory evidence

The inventory reads Git-tracked production `src/**/*.ts`, excludes specifications, and parses static imports and exports with the TypeScript compiler. Relative edges include runtime and type-only local references. External and built-in edges are runtime references.

| Measure                        | Count |
| ------------------------------ | ----: |
| Production TypeScript files    |   145 |
| Relative internal module edges |   495 |
| Runtime external module edges  |     5 |
| Runtime built-in module edges  |    36 |
| Known policy owners            |     6 |

There are 536 total recorded module edges. The runtime-dependency violation list is empty.

## Policy owners

| Policy                    | Module                                      | Symbol                    |
| ------------------------- | ------------------------------------------- | ------------------------- |
| artifact identity         | `src/adapter/css/css-artifact.registry.ts`  | `CssArtifactRegistry`     |
| breakpoint classification | `src/breakpoint/breakpoint-catalog.ts`      | `BreakpointCatalog`       |
| diagnostics               | `src/analyzer/conversion-result.ts`         | `DiagnosticCode`          |
| responsive precedence     | `src/semantic/responsive-family.planner.ts` | `ResponsiveFamilyPlanner` |
| semantic planning         | `src/semantic/element-semantic.planner.ts`  | `ElementSemanticPlanner`  |
| transaction recovery      | `src/transaction/migration-transaction.ts`  | `MigrationTransaction`    |

## Largest production modules

| Module                                                                | Physical lines |
| --------------------------------------------------------------------- | -------------: |
| `src/semantic/semantic-family-composition.planner.ts`                 |            965 |
| `src/semantic/element-semantic.planner.ts`                            |            796 |
| `src/adapter/tailwind/tailwind-class-conflict.ts`                     |            650 |
| `src/adapter/tailwind/extended/tailwind-candidate-classifier.ts`      |            629 |
| `src/transaction/transaction-unit.session.ts`                         |            606 |
| `src/semantic/responsive-family.planner.ts`                           |            504 |
| `src/render/tailwind/tailwind.renderer.ts`                            |            387 |
| `src/adapter/tailwind/extended/tailwind-arbitrary-value-ownership.ts` |            373 |
| `src/analyzer/compatibility-inventory.ts`                             |            331 |
| `src/semantic/css-property-ownership.ts`                              |            298 |
| `src/semantic/extended/extended-semantic.planner.ts`                  |            275 |
| `src/transaction/cleanup.unit.ts`                                     |            271 |
| `src/planner/conversion-planner.ts`                                   |            268 |
| `src/migrator/migration-path.validator.ts`                            |            261 |
| `src/adapter/css/stylesheet/owned-stylesheet.merger.ts`               |            245 |
| `src/transaction/migration-transaction.ts`                            |            241 |
| `src/transaction/commit.unit.ts`                                      |            227 |
| `src/pipeline/validated-project-plan.ts`                              |            220 |
| `src/semantic/extended/extended-family.planner.ts`                    |            219 |
| `src/transaction/rollback.unit.ts`                                    |            196 |

The former 1,245-line transaction is now a 241-line recovery coordinator plus focused units. The two largest final modules are shared semantic planners rather than orchestration or filesystem authorities.

## Dependency and license audit

The direct runtime set has five entries. `npm ls --omit=dev --all --json` resolved 36 unique runtime package/version instances including transitives. The package tarball reports no npm-bundled dependencies, and `dist/cli.js` retains one bare external import for each direct dependency. Maintenance status here is deliberately repository-local: each entry is declared, resolved, imported, licensed, and exercised by verification; no unsupported claim about upstream activity is made.

| Package             | Inventory status | Production purpose                   | Declared  | Resolved  | Imported by                               | License | Bundle/install contribution               | Maintenance / replacement decision                                                                |
| ------------------- | ---------------- | ------------------------------------ | --------- | --------- | ----------------------------------------- | ------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `@angular/compiler` | declared, used   | Angular template parsing             | `21.2.22` | `21.2.22` | `src/template/angular-template.parser.ts` | MIT     | External runtime install; not npm-bundled | Resolved and retained; no Node built-in supplies Angular template semantics                       |
| `commander`         | declared, used   | CLI command and option parsing       | `^15.0.0` | `15.0.0`  | `src/cli/run-cli.ts`                      | MIT     | External runtime install; not npm-bundled | Resolved and retained; replacement would duplicate the characterized CLI contract                 |
| `fs-extra`          | declared, used   | Gitignore file existence and reading | `^11.4.0` | `11.4.0`  | `src/lib/gitignore.helper.ts`             | MIT     | External runtime install; not npm-bundled | Resolved and retained; a built-in replacement was not justified in this behavior-preserving slice |
| `ignore`            | declared, used   | Git-compatible ignore matching       | `5.2.4`   | `5.2.4`   | `src/lib/gitignore.helper.ts`             | MIT     | External runtime install; not npm-bundled | Resolved, explicitly declared, and retained; no Node built-in supplies Git ignore semantics       |
| `winston`           | declared, used   | Application logging                  | `^3.19.0` | `3.19.0`  | `src/logger.ts`                           | MIT     | External runtime install; not npm-bundled | Resolved and retained as the production logger; replacement is outside this refactor              |

The Slice 1 runtime import set also contained five packages, but `ignore` was undeclared and supplied transitively. The final manifest declares it explicitly at the already resolved `5.2.4`; no runtime package was added to or removed from the production import set.

## Workload counters

These assertions run the real Discover, Analyze, Render, Validate, and Apply stages. Original reads are Analyze reads; destination reads are successful Validate reads and exclude absent-path probes. Validation reparses occur once per changed proposal. Reference parses are the complete native-CSS project-state pass. Semantic-plan and target-render counts are observed at their real production ports.

| Scenario                   | Discovery passes | Templates discovered | Original reads | Destination reads | Initial parses | Validation reparses | Reference parses | Semantic plans | Target renders | Session finalizations | Stylesheet reads |
| -------------------------- | ---------------: | -------------------: | -------------: | ----------------: | -------------: | ------------------: | ---------------: | -------------: | -------------: | --------------------: | ---------------: |
| Single-file Tailwind plan  |                1 |                    1 |              1 |                 0 |              1 |                   1 |                0 |              1 |              1 |                     1 |                0 |
| Single-file Tailwind write |                1 |                    1 |              1 |                 0 |              1 |                   1 |                0 |              1 |              1 |                     1 |                0 |
| Two-file CSS folder plan   |                1 |                    2 |              2 |                 0 |              2 |                   2 |                2 |              2 |              2 |                     1 |                0 |
| Two-file CSS folder write  |                1 |                    2 |              2 |                 0 |              2 |                   2 |                2 |              2 |              2 |                     1 |                0 |
| Unchanged Tailwind rerun   |                1 |                    1 |              1 |                 1 |              1 |                   1 |                0 |              1 |              1 |                     1 |                0 |
| Unchanged CSS folder rerun |                1 |                    2 |              2 |                 4 |              2 |                   2 |                2 |              2 |              2 |                     1 |                1 |

Tailwind performs no stylesheet read or project reference parse. The unchanged CSS rerun reads two destinations while deciding template artifacts and reads those two destinations once more while assembling the complete proposed project state; each owner performs one distinct read per destination.

## Application counters

The workload test uses the real transaction coordinator and real filesystem units. Pipeline stages count Discover through Apply. Staged artifacts count transaction-owned `stage` files. Staging verification parses are the transaction safety check for staged templates, separate from Validate reparses. Project writes count public hard-link installs. Cleanup actions count successful transaction-owned unlink and directory-removal operations. The established success scenarios correctly perform no rollback; injected-failure, concurrency, cancellation, reverse-rollback, and unresolved-cleanup behavior remains covered by the transaction suites.

| Scenario                   | Pipeline stages | Preflights | Staged artifacts | Staging validation parses | Project writes | Rollback actions | Cleanup actions |
| -------------------------- | --------------: | ---------: | ---------------: | ------------------------: | -------------: | ---------------: | --------------: |
| Single-file Tailwind plan  |               5 |          1 |                0 |                         0 |              0 |                0 |               0 |
| Single-file Tailwind write |               5 |          1 |                1 |                         1 |              1 |                0 |               2 |
| Two-file CSS folder plan   |               5 |          1 |                0 |                         0 |              0 |                0 |               0 |
| Two-file CSS folder write  |               5 |          1 |                3 |                         2 |              3 |                0 |               6 |
| Unchanged Tailwind rerun   |               5 |          1 |                0 |                         0 |              0 |                0 |               0 |
| Unchanged CSS folder rerun |               5 |          1 |                0 |                         0 |              0 |                0 |               0 |

Plan mode and unchanged writes stage nothing and perform no project write. A parse-error write likewise performs no preflight, staging, write, rollback, or cleanup action under the Apply decision contract.

## Package evidence

`npm pack --dry-run --json --ignore-scripts` reported exactly six files, a 255,903-byte tarball, a 1,262,350-byte unpacked size, and no bundled dependencies. `npm run package:check` installed the generated tarball in a clean temporary project and exercised help, version, Tailwind plan/write, native-CSS plan/write, report schema, exact generated bytes, and unchanged rerun behavior with Node.js `v24.20.0`. The manifest continues to require Node.js `>=24` and exposes `flex-layout-codemod` at `dist/cli.js`.

| Package file    |   Bytes |
| --------------- | ------: |
| CHANGELOG.md    |   2,625 |
| LICENSE         |   1,076 |
| README.md       |  11,114 |
| dist/cli.js     | 415,669 |
| dist/cli.js.map | 828,771 |
| package.json    |   3,095 |

## Public parity evidence

The final public parity run passed 8 test files and 105 tests across `test/compatibility` and `test/cli/cli.test.ts`. It covers Tailwind and native-CSS output bytes, responsive images, shared semantic parity, custom and standard breakpoints, plan/write decisions, unchanged reruns, reports, parse and configuration failures, terminal output, exit status, collisions, and interruption-facing CLI behavior. The required combined counter/parity command passed 9 files and 110 tests. The subsequent package check passed the installed-tarball oracle and preserved the six-file public package surface.

## Benchmark method

The runner and corpus are unchanged from Slice 1. `npm run benchmark:architecture:prepare` builds `dist/cli.js`. Each product invocation copies a checked-in fixture to a fresh temporary project, invokes the packaged CLI with the memory probe, requires a zero exit status, and removes the project afterward. Architecture-test timing starts a fresh Vitest process for `test/architecture/enterprise-pipeline-boundary.test.ts`.

Warm-up runs per scenario: **1**

Recorded samples per scenario: **5**

One warm-up was discarded for each of the four product scenarios and for the architecture-test scenario. The runner calculated median, minimum, maximum, and median absolute deviation from the five retained samples. Product rows also preserve peak RSS. CI has no wall-clock threshold.

## Benchmark results

Generated at `2026-09-04T16:10:49.783Z` from the captured commit and environment above.

| Scenario                | Recorded milliseconds                                                                              |             Median |            Minimum |            Maximum |                MAD | Recorded peak RSS bytes                               |
| ----------------------- | -------------------------------------------------------------------------------------------------- | -----------------: | -----------------: | -----------------: | -----------------: | ----------------------------------------------------- |
| `single-tailwind-plan`  | 104.76083400000002; 102.220417; 104.18812500000001; 105.95458299999996; 104.10058400000003         | 104.18812500000001 |         102.220417 | 105.95458299999996 | 0.5727090000000032 | 97566720; 99155968; 99581952; 98893824; 100450304     |
| `multi-tailwind-plan`   | 125.77199999999993; 122.49479099999996; 119.94074999999998; 122.06116600000018; 129.64716599999997 | 122.49479099999996 | 119.94074999999998 | 129.64716599999997 |  2.554040999999984 | 102301696; 101285888; 102039552; 100220928; 100220928 |
| `multi-native-css-plan` | 106.72029099999986; 108.87924999999996; 107.35983299999998; 106.12654099999986; 107.11099999999988 | 107.11099999999988 | 106.12654099999986 | 108.87924999999996 | 0.3907090000000153 | 96256000; 99270656; 98254848; 96862208; 96501760      |
| `unchanged-write`       | 94.771792; 98.54375000000027; 96.9670000000001; 97.878334; 97.37720800000034                       |  97.37720800000034 |          94.771792 |  98.54375000000027 | 0.5011259999996582 | 94978048; 96649216; 96763904; 95551488; 95977472      |

## Architecture-test timing

| Command                                                                                          | Recorded milliseconds                                                                      |            Median |            Minimum |      Maximum |               MAD |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ----------------: | -----------------: | -----------: | ----------------: |
| `node node_modules/vitest/vitest.mjs run test/architecture/enterprise-pipeline-boundary.test.ts` | 31443.481208000005; 40661.387334; 33108.78545800001; 33191.96758299999; 33574.596415999986 | 33191.96758299999 | 31443.481208000005 | 40661.387334 | 382.6288329999952 |

## Slice 1 comparison

The same machine and unchanged corpus produced these median comparisons. Positive deltas are slower observations.

| Scenario                |     Slice 1 median |       Final median | Final minus Slice 1 | Relative delta |
| ----------------------- | -----------------: | -----------------: | ------------------: | -------------: |
| `single-tailwind-plan`  |  98.99062500000002 | 104.18812500000001 |   5.197499999999991 |         +5.25% |
| `multi-tailwind-plan`   | 115.16966699999989 | 122.49479099999996 |   7.325124000000074 |         +6.36% |
| `multi-native-css-plan` | 106.70066699999984 | 107.11099999999988 |   0.410333000000042 |         +0.38% |
| `unchanged-write`       |  92.08108399999992 |  97.37720800000034 |    5.29612400000042 |         +5.75% |
| Architecture test       |        7885.041084 |  33191.96758299999 |  25306.926498999987 |       +320.95% |

All four product medians and the architecture-test median are higher in this capture. No repeatable median improvement is claimed. These are observational results from one five-sample run; no causal attribution is made and they do not create a timing gate.

The Slice 1 aggregate workload columns and the final aggregate work remain equivalent for the established scenarios. The final contracts separate original reads from destination reads, changed-template validation from native-CSS reference parsing, and transaction staging verification from Validate. That greater precision is evidence, not a throughput claim.

## Retained debt

- **Performance evidence — performance owner:** all measured medians are neutral-to-negative versus Slice 1, and the architecture-test process is materially slower. A future performance task must profile current resolved-symbol inspection and product startup before proposing an optimization; this rewrite makes no improvement claim.
- **Large semantic modules — semantic architecture owner:** `SemanticFamilyCompositionPlanner` and `ElementSemanticPlanner` are the two largest production modules. Their size is recorded for maintainability review, but no speculative split is included without a separate responsibility design.
- **Stable-release compatibility — product owner:** conservative native-CSS limitations, opt-in responsive-image behavior, and other gaps already reserved for the stable-release audit remain unchanged. They are not architecture-rewrite regressions.

There is no retained compatibility façade, dead-module exception, undeclared or unused runtime dependency, package-surface deviation, or known final-evidence mismatch. Independent whole-branch review remains the pull-request gate after this implementation/evidence commit.
