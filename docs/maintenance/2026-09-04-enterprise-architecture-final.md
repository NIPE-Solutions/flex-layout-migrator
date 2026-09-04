# Enterprise architecture final evidence

This document records the implementation and evidence result for Slice 9 of the enterprise architecture rewrite. Structural and workload values are executable documentation contracts. Timing and peak-memory values are observations from one same-machine run, not CI limits.

## Commit

Commit captured: `92f720211a04563bd4216b90e52b9a7a230c048b`

This is the final production implementation commit. The evidence-only documentation and test commit follows it and does not alter `src`, package metadata, the benchmark runner, or the benchmark corpus.

## Environment

- Node.js: `v24.20.0`
- npm: `11.19.0`
- Platform: `darwin-arm64`

Evidence was generated with:

```text
npm run architecture:inventory -- --json /tmp/flex-layout-roadmap-second-remediation-inventory.json
npm ls --omit=dev --all --json --long
npm run package:check
npx vitest run test/performance/migration-workload-counter.test.ts test/compatibility test/cli/cli.test.ts
npm run build
npm run package:check
npm run benchmark:architecture:prepare
npm run benchmark:architecture -- --json /tmp/flex-layout-roadmap-second-remediation-benchmark.json
```

The benchmark runner's JSON values are preserved in the tracked artifact `docs/maintenance/evidence/2026-09-04-enterprise-architecture-final-benchmark.json`.

## Final route

Every production CLI invocation uses this single route:

```text
CLI -> Discover -> Analyze -> Render -> Validate -> Apply -> Presentation
```

`runCli` composes one `MigrationPipeline`. The pipeline first invokes Validate-owned topology prevalidation so the established collision diagnostic wins even when another input is also invalid, then invokes each of the five stage `run` methods once and in order. Validate reuses the same canonical physical checker during its normal stage run to guard against topology changes; the CLI owns only syntax and normalization. `MigrationRunner` constructs the report from the applied handoff; `TerminalPresenter` and `JsonReportWriter` observe the completed report. There is no compatibility fallback or second production route.

## Ownership map

| Boundary              | Production owner                                                                               | Exclusive authority                                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI composition       | `src/cli/run-cli.ts` (`runCli`)                                                                | Argument validation, stage construction, presentation selection, and exit mapping                                                                   |
| Discover              | `src/pipeline/discover/discover-project.stage.ts` (`DiscoverProjectStage`)                     | Topology enumeration, ignore matching, exclusions, deterministic file identity and order                                                            |
| Analyze               | `src/pipeline/analyze/analyze-project.stage.ts` (`AnalyzeProjectStage`)                        | Original template read, initial Angular parse, and source-input analysis                                                                            |
| Render                | `src/pipeline/render/render-project.stage.ts` (`RenderProjectStage`)                           | Semantic-plan consumption, target rendering, and one render-session finalization                                                                    |
| Validate              | `src/pipeline/validate/validate-project.stage.ts` (`ValidateProjectStage`)                     | Canonical topology prevalidation, edit materialization, changed-template reparse, CSS reference collection, stylesheet planning, and canonical plan |
| Apply                 | `src/pipeline/apply/apply-project.stage.ts` (`ApplyProjectStage`)                              | Mode/error decision and the sole project-level mutation call                                                                                        |
| Transaction policy    | `src/transaction/migration-transaction.ts` (`MigrationTransaction`)                            | Preflight seal, state transitions, cancellation scope, rollback/cleanup sequencing, and recovery evidence                                           |
| Transaction mechanics | `src/transaction/staging.unit.ts`, `commit.unit.ts`, `rollback.unit.ts`, and `cleanup.unit.ts` | One focused filesystem responsibility per unit through a phase-specific least-privilege port                                                        |
| Report construction   | `src/pipeline/migration-runner.ts` and `src/report/migration-report.builder.ts`                | Mapping the applied handoff to the unchanged public report                                                                                          |
| Presentation          | `src/report/terminal.presenter.ts` and `src/report/json-report.writer.ts`                      | Observer-only terminal and report-file side effects                                                                                                 |

## Inventory evidence

The inventory reads Git-tracked production `src/**/*.ts`, excludes specifications, and parses static imports and exports with the TypeScript compiler. Relative edges include runtime and type-only local references. External and built-in edges are runtime references. Reachability starts only at `src/main.ts`; all 146 production modules are reachable and the unreachable-production-module list is empty.

| Measure                        | Count |
| ------------------------------ | ----: |
| Production TypeScript files    |   146 |
| Relative internal module edges |   507 |
| Runtime external module edges  |     5 |
| Runtime built-in module edges  |    35 |
| Known policy owners            |     6 |

There are 547 total recorded module edges. The runtime-dependency violation list is empty.

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
| `src/transaction/transaction-unit.session.ts`                         |            858 |
| `src/semantic/element-semantic.planner.ts`                            |            796 |
| `src/adapter/tailwind/tailwind-class-conflict.ts`                     |            650 |
| `src/adapter/tailwind/extended/tailwind-candidate-classifier.ts`      |            629 |
| `src/semantic/responsive-family.planner.ts`                           |            504 |
| `src/render/tailwind/tailwind.renderer.ts`                            |            387 |
| `src/adapter/tailwind/extended/tailwind-arbitrary-value-ownership.ts` |            373 |
| `src/migrator/migration-path.validator.ts`                            |            324 |
| `src/semantic/css-property-ownership.ts`                              |            298 |
| `src/semantic/extended/extended-semantic.planner.ts`                  |            275 |
| `src/planner/conversion-planner.ts`                                   |            268 |
| `src/transaction/cleanup.unit.ts`                                     |            252 |
| `src/transaction/migration-transaction.ts`                            |            247 |
| `src/adapter/css/stylesheet/owned-stylesheet.merger.ts`               |            245 |
| `src/pipeline/rendered-project.ts`                                    |            220 |
| `src/pipeline/validated-project-plan.ts`                              |            220 |
| `src/semantic/extended/extended-family.planner.ts`                    |            219 |
| `src/transaction/commit.unit.ts`                                      |            200 |
| `src/semantic/literal-style-declaration.ts`                           |            188 |

The former 1,245-line transaction is now a 247-line recovery coordinator plus focused units and phase ports. The 858-line coordinator-owned session contains the physical transaction mechanics and creates frozen phase-specific command/view capabilities; no phase unit receives the session or another phase's authority.

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

## Runtime license inventory

The runtime-install graph was generated with `npm ls --omit=dev --all --json --long`. Package identity and license are read from each resolved package's own `package.json`; duplicate occurrences of the same package/version are counted once. The graph resolved 36 unique runtime package/version instances, and the grouped counts below cover all 36.

| License | Unique package/version instances | Packages                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------- | -------------------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0BSD    |                                1 | `tslib@2.8.1`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ISC     |                                2 | `graceful-fs@4.2.11`; `inherits@2.0.4`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| MIT     |                               33 | `@angular/compiler@21.2.22`; `@colors/colors@1.6.0`; `@dabh/diagnostics@2.0.8`; `@so-ric/colorspace@1.1.6`; `@types/triple-beam@1.3.5`; `async@3.2.4`; `color-convert@3.1.3`; `color-name@2.1.1`; `color-string@2.1.4`; `color@5.0.3`; `commander@15.0.0`; `enabled@2.0.0`; `fecha@4.2.3`; `fn.name@1.1.0`; `fs-extra@11.4.0`; `ignore@5.2.4`; `is-stream@2.0.1`; `jsonfile@6.1.0`; `kuler@2.0.0`; `logform@2.7.0`; `ms@2.1.3`; `one-time@1.0.0`; `readable-stream@3.6.2`; `safe-buffer@5.2.1`; `safe-stable-stringify@2.5.0`; `stack-trace@0.0.10`; `string_decoder@1.3.0`; `text-hex@1.0.0`; `triple-beam@1.4.1`; `universalify@2.0.0`; `util-deprecate@1.0.2`; `winston-transport@4.9.0`; `winston@3.19.0` |

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

`npm pack --dry-run --json --ignore-scripts` reported exactly 6 files, a 264,268-byte tarball, a 1,315,376-byte unpacked size, and no bundled dependencies. `npm run package:check` installed the generated tarball in a clean temporary project and exercised help, version, Tailwind plan/write, native-CSS plan/write, report schema, exact generated bytes, and unchanged rerun behavior with Node.js `v24.20.0`. The manifest continues to require Node.js `>=24` and exposes `flex-layout-codemod` at `dist/cli.js`.

| Package file    |   Bytes |
| --------------- | ------: |
| CHANGELOG.md    |   2,625 |
| LICENSE         |   1,076 |
| README.md       |  11,114 |
| dist/cli.js     | 433,383 |
| dist/cli.js.map | 864,083 |
| package.json    |   3,095 |

## Public parity evidence

The final public parity run passed 9 test files and 108 tests across `test/compatibility` and `test/cli/cli.test.ts`. It covers Tailwind and native-CSS output bytes, responsive images, shared semantic parity, custom and standard breakpoints, plan/write decisions, unchanged reruns, reports, parse and configuration failures, terminal output, exit status, collisions, and interruption-facing CLI behavior. The required combined counter/parity command passed 10 files and 113 tests. The subsequent package check passed the installed-tarball oracle and preserved the six-file public package surface.

## Benchmark method

The product runner, memory probe, and fixture corpus are byte-identical to Slice 1. `npm run benchmark:architecture:prepare` builds `dist/cli.js`. Each product invocation copies a checked-in fixture to a fresh temporary project, invokes the packaged CLI with the memory probe, requires a zero exit status, and removes the project afterward. Architecture-test timing starts a fresh Vitest process for `test/architecture/enterprise-pipeline-boundary.test.ts`; that test changed after Slice 1 and its timing is therefore reported without a historical comparison.

Warm-up runs per scenario: **1**

Recorded samples per scenario: **5**

One warm-up was discarded for each of the four product scenarios and for the architecture-test scenario. The runner calculated median, minimum, maximum, and median absolute deviation from the five retained samples. Product rows also preserve peak RSS. CI has no wall-clock threshold.

## Benchmark input digests

Each digest is SHA-256 over every selected Git path in code-unit order, adding `path`, a NUL byte, blob bytes, and a final NUL byte for each file. Slice 1 uses commit `41c0714bca3ec09470e25efde0f30b6bc96cc0ac`; final uses the captured production commit. Equality is required before a timing comparison is published.

| Input                      | Slice 1 SHA-256                                                    | Final SHA-256                                                      | Comparison status         |
| -------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------- |
| Runner                     | `4ff7e237feb9052cc263c172d27bb910fd97f8a015a06835013666b8004d92bc` | `4ff7e237feb9052cc263c172d27bb910fd97f8a015a06835013666b8004d92bc` | identical                 |
| Memory probe               | `6c9aafd10fc39401cf913f2ba13bac3725dda8d753b4eccc9592d30fbf25cd87` | `6c9aafd10fc39401cf913f2ba13bac3725dda8d753b4eccc9592d30fbf25cd87` | identical                 |
| Product fixtures           | `d8282d7000602d5467144a8cc85c9a4d8af9346630664dcb6ceb5a21d671a842` | `d8282d7000602d5467144a8cc85c9a4d8af9346630664dcb6ceb5a21d671a842` | identical                 |
| Architecture boundary test | `2ecfa2387c8c65e8110e5a8d06c58988cdcd7f71310406d40a07f237b3a380da` | `a8ac66c46838f81e74ebba1992110361f89b2ae7b7ceb97801afa824370a3af8` | different; not comparable |

## Benchmark results

Generated at `2026-09-04T18:45:52.479Z` from the tracked benchmark artifact.

| Scenario                | Recorded milliseconds                                                                         |             Median |            Minimum |            Maximum |                 MAD | Recorded peak RSS bytes                             |
| ----------------------- | --------------------------------------------------------------------------------------------- | -----------------: | -----------------: | -----------------: | ------------------: | --------------------------------------------------- |
| `single-tailwind-plan`  | 98.026791; 97.16512499999999; 96.53995800000001; 99.90104100000002; 97.505541                 |          97.505541 |  96.53995800000001 |  99.90104100000002 |  0.5212500000000091 | 97157120; 95649792; 97239040; 97533952; 98320384    |
| `multi-tailwind-plan`   | 115.04529200000002; 113.298; 116.11374999999998; 116.3114579999999; 117.59470899999997        | 116.11374999999998 |            113.298 | 117.59470899999997 |  1.0684579999999642 | 99844096; 99893248; 102793216; 100073472; 100401152 |
| `multi-native-css-plan` | 103.662916; 102.53041700000017; 102.20958300000007; 104.91941699999984; 104.52279199999998    |         103.662916 | 102.20958300000007 | 104.91941699999984 |  1.1324989999998252 | 88702976; 96813056; 96387072; 96944128; 97615872    |
| `unchanged-write`       | 93.87854199999992; 93.75329199999987; 91.53929100000005; 91.04437499999995; 91.35708300000033 |  91.53929100000005 |  91.04437499999995 |  93.87854199999992 | 0.49491600000010294 | 96468992; 93601792; 95584256; 95436800; 96124928    |

## Architecture-test timing

| Command                                                                                          | Recorded milliseconds                                                                            |            Median |            Minimum |           Maximum |                MAD |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ----------------: | -----------------: | ----------------: | -----------------: |
| `node node_modules/vitest/vitest.mjs run test/architecture/enterprise-pipeline-boundary.test.ts` | 31580.424709000006; 31757.07258400001; 31584.92020800001; 31175.262666999988; 31686.095208000013 | 31584.92020800001 | 31175.262666999988 | 31757.07258400001 | 101.17500000000291 |

## Slice 1 comparison

The same machine and byte-identical product inputs produced these median comparisons. Positive deltas are slower observations.

| Scenario                |     Slice 1 median |       Final median | Final minus Slice 1 | Relative delta |
| ----------------------- | -----------------: | -----------------: | ------------------: | -------------: |
| `single-tailwind-plan`  |  98.99062500000002 |          97.505541 |  -1.485084000000029 |         -1.50% |
| `multi-tailwind-plan`   | 115.16966699999989 | 116.11374999999998 |  0.9440830000000915 |         +0.82% |
| `multi-native-css-plan` | 106.70066699999984 |         103.662916 | -3.0377509999998438 |         -2.85% |
| `unchanged-write`       |  92.08108399999992 |  91.53929100000005 | -0.5417929999998705 |         -0.59% |

Three product medians are lower and one is higher in this capture. No repeatable median improvement is claimed. These are observational results from one five-sample run; no causal attribution is made and they do not create a timing gate. The architecture boundary test changed between Slice 1 and the final capture, so its timing is not comparable. Its final five-sample observation remains recorded above without a delta or percentage.

The Slice 1 aggregate workload columns and the final aggregate work remain equivalent for the established scenarios. The final contracts separate original reads from destination reads, changed-template validation from native-CSS reference parsing, and transaction staging verification from Validate. That greater precision is evidence, not a throughput claim.

## Retained debt

- **Performance evidence — performance owner:** three comparable product medians are lower and one is higher than Slice 1 in this capture. The current architecture-test observation cannot be compared because its test workload changed. A future performance task must collect repeated benchmark captures and profile product startup and current resolved-symbol inspection before proposing an optimization; this rewrite makes no improvement claim.
- **Large production modules — architecture owners:** `SemanticFamilyCompositionPlanner`, the coordinator-owned `TransactionUnitSession`, and `ElementSemanticPlanner` are the three largest production modules. The session grew while replacing shared mutable phase state with frozen command/view capabilities; its size and the semantic planners remain recorded for responsibility review, but no speculative split is included without a separate design.
- **Stable-release compatibility — product owner:** conservative native-CSS limitations, opt-in responsive-image behavior, and other gaps already reserved for the stable-release audit remain unchanged. They are not architecture-rewrite regressions.

There is no retained compatibility façade, dead-module exception, undeclared or unused runtime dependency, package-surface deviation, or known final-evidence mismatch. Independent whole-branch review remains the pull-request gate after this implementation/evidence commit.
