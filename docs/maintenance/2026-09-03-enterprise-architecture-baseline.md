# Enterprise architecture baseline

This document records the Slice 1 baseline for the enterprise architecture rewrite. Stable structural facts and deterministic workload counts are executable documentation contracts. Timing and peak-memory values are observations from one machine and one run.

## Commit

Commit captured: `41c0714bca3ec09470e25efde0f30b6bc96cc0ac`

The final-review benchmark evidence was collected from a clean build of the commit above. Structural and workload facts were regenerated from that revision and are rechecked by the full verification gate.

## Environment

- Node.js: `v24.20.0`
- npm: `11.19.0`
- Platform: `darwin-arm64`
- Operating system: `macOS 14.6.1` (`23G93`)
- Kernel: `Darwin 23.6.0`, `RELEASE_ARM64_T6031`

## Behavior oracle

The packaged `dist/cli.js` parity matrix is the public behavior oracle. It executes plan, write, and unchanged rerun flows and asserts exit status, stdout, stderr, JSON reports, template bytes, stylesheet bytes, and repeat-write stability for:

- `Tailwind Flex and Grid migration`
- `native CSS Flex migration`
- `responsive image migration`

The fresh oracle run passed all three cases. Together with the three deterministic workload cases, the requested evidence command passed 2 test files and 6 tests.

## Workload counters

The rows below enter through `Migrator.migrate()` and record the current production-pipeline work. Counter order is discovery passes, templates discovered, successful template reads, initial Angular parses, validation and reference-collection parses, rendered templates, stylesheet reads, and project writes. A missing destination probe is not a successful read. The discovery-pass counter is invoked at the real single-file or folder-traversal boundary, while templates discovered records the number of templates handed to `FileMigrator`.

| Scenario                   | Discovery passes | Templates discovered | Template reads | Initial parses | Validation parses | Rendered templates | Stylesheet reads | Project writes |
| -------------------------- | ---------------: | -------------------: | -------------: | -------------: | ----------------: | -----------------: | ---------------: | -------------: |
| Single-file Tailwind plan  |                1 |                    1 |              1 |              1 |                 1 |                  1 |                0 |              0 |
| Single-file Tailwind write |                1 |                    1 |              1 |              1 |                 1 |                  1 |                0 |              1 |
| Two-file CSS folder plan   |                1 |                    2 |              2 |              2 |                 4 |                  2 |                0 |              0 |
| Two-file CSS folder write  |                1 |                    2 |              2 |              2 |                 4 |                  2 |                0 |              3 |
| Unchanged Tailwind rerun   |                1 |                    1 |              2 |              1 |                 1 |                  1 |                0 |              0 |
| Unchanged CSS folder rerun |                1 |                    2 |              6 |              2 |                 4 |                  2 |                1 |              0 |

Repeated reads, parses, and renders are current baseline work, not target values. Later slices may update a row only when a reviewed implementation changes the real pipeline and the public behavior oracle remains green.

## Production structure

The inventory reads Git-tracked `src/**/*.ts` production files, excluding specifications, and parses imports with the TypeScript compiler AST. Static internal edges include runtime and type-only imports and re-exports. Built-in and external edges, along with runtime dependency usage, remain runtime-only observations.

| Measure                                                       | Count |
| ------------------------------------------------------------- | ----: |
| Production TypeScript files                                   |   122 |
| Runtime dependency entries                                    |     5 |
| Static internal and runtime external or built-in module edges |   416 |
| Known policy owners                                           |     6 |

## Policy owners

The inventory discovers these owners from their declared symbols rather than from a hardcoded module list.

| Policy                    | Module                                     | Symbol                          |
| ------------------------- | ------------------------------------------ | ------------------------------- |
| artifact identity         | `src/adapter/css/css-artifact.registry.ts` | `CssArtifactRegistry`           |
| breakpoint classification | `src/breakpoint/breakpoint-catalog.ts`     | `BreakpointCatalog`             |
| diagnostics               | `src/analyzer/conversion-result.ts`        | `DiagnosticCode`                |
| responsive precedence     | `src/adapter/responsive-family.planner.ts` | `SharedResponsiveFamilyPlanner` |
| semantic planning         | `src/planner/conversion-planner.ts`        | `ConversionPlanner`             |
| transaction recovery      | `src/transaction/migration-transaction.ts` | `MigrationTransaction`          |

## Largest production modules

Physical line counts come directly from the fresh inventory. This is the complete top-20 inventory list, ordered by descending line count and then code-unit path order.

| Module                                                                    | Physical lines |
| ------------------------------------------------------------------------- | -------------: |
| `src/transaction/migration-transaction.ts`                                |          1,245 |
| `src/adapter/tailwind/tailwind.adapter.ts`                                |            686 |
| `src/adapter/tailwind/tailwind-class-conflict.ts`                         |            650 |
| `src/adapter/tailwind/extended/tailwind-candidate-classifier.ts`          |            629 |
| `src/adapter/responsive-family.planner.ts`                                |            556 |
| `src/adapter/tailwind/extended/extended-display-composition.planner.ts`   |            526 |
| `src/adapter/css/css.adapter.ts`                                          |            438 |
| `src/adapter/tailwind/extended/extended-responsive.planner.ts`            |            430 |
| `src/adapter/tailwind/extended/tailwind-arbitrary-value-ownership.ts`     |            373 |
| `src/analyzer/compatibility-inventory.ts`                                 |            331 |
| `src/adapter/tailwind/extended/css-property-ownership.ts`                 |            298 |
| `src/adapter/tailwind/extended/generated-property-composition.planner.ts` |            276 |
| `src/planner/conversion-planner.ts`                                       |            266 |
| `src/migrator/migration-path.validator.ts`                                |            261 |
| `src/migrator/migrator.ts`                                                |            247 |
| `src/adapter/css/stylesheet/owned-stylesheet.merger.ts`                   |            245 |
| `src/adapter/tailwind/visibility/display-composition.planner.ts`          |            237 |
| `src/adapter/tailwind/extended/extended-family.planner.ts`                |            219 |
| `src/adapter/tailwind/extended/responsive-style-value.parser.ts`          |            202 |
| `src/adapter/tailwind/visibility/literal-style-display.ts`                |            188 |

## Runtime dependencies

Every observed runtime import appears here. Declared ranges come from `package.json`; resolved versions come from `package-lock.json`.

| Package             | Inventory status | Production purpose                    | Declared     | Resolved  | Imported by                               |
| ------------------- | ---------------- | ------------------------------------- | ------------ | --------- | ----------------------------------------- |
| `@angular/compiler` | declared, used   | Angular template parsing              | `21.2.22`    | `21.2.22` | `src/template/angular-template.parser.ts` |
| `commander`         | declared, used   | CLI command and option parsing        | `^15.0.0`    | `15.0.0`  | `src/cli/run-cli.ts`                      |
| `fs-extra`          | declared, used   | Filesystem traversal and copy helpers | `^11.4.0`    | `11.4.0`  | `src/lib/gitignore.helper.ts`             |
| `ignore`            | undeclared, used | Gitignore-compatible path filtering   | not declared | `5.2.4`   | `src/lib/gitignore.helper.ts`             |
| `winston`           | declared, used   | Application logging                   | `^3.19.0`    | `3.19.0`  | `src/logger.ts`                           |

`ignore` is the one exact known undeclared production import. It is retained baseline debt reserved for delivery slice 8, Dependency and dead-code removal. `winston` is used production code and is not an unused-dependency finding. No other findings are parked.

## Benchmark method

The product benchmark invokes the built package entry point with `node --import scripts/benchmark/memory-probe.mjs dist/cli.js`. Every invocation copies a checked-in fixture to a new temporary project, writes metrics to an invocation-owned path, and must exit successfully. Node reports `process.resourceUsage().maxRSS` in KiB on every supported platform, so the probe multiplies it by 1,024 and records bytes.

Architecture-test timing is recorded separately by starting `node node_modules/vitest/vitest.mjs run test/architecture/enterprise-pipeline-boundary.test.ts` in a fresh process for every run. It uses the same warm-up and recorded-sample method, without adding that command to the four product scenario names or collecting product RSS metrics from it.

Warm-up runs per scenario: **1**

Recorded samples per scenario: **5**

Warm-up observations are discarded. The five recorded elapsed-time observations produce median, minimum, maximum, and median absolute deviation summaries; the product runs also retain peak RSS. Product scenario order is stable:

1. `single-tailwind-plan`
2. `multi-tailwind-plan`
3. `multi-native-css-plan`
4. `unchanged-write`

## Benchmark results

Generated at `2026-09-03T09:31:58.378Z` on the environment and commit above. Millisecond and peak-RSS values are machine-specific observations. CI retains the complete JSON report but does not compare timing values; a failed benchmark command still fails the job.

| Scenario                | Recorded milliseconds                                                                              |             Median |            Minimum |            Maximum |                MAD | Recorded peak RSS bytes                               |
| ----------------------- | -------------------------------------------------------------------------------------------------- | -----------------: | -----------------: | -----------------: | -----------------: | ----------------------------------------------------- |
| `single-tailwind-plan`  | 106.02175; 98.99062500000002; 100.882792; 98.00824999999998; 97.29541699999993                     |  98.99062500000002 |  97.29541699999993 |          106.02175 | 1.6952080000000933 | 101318656; 98844672; 103710720; 100089856; 100483072  |
| `multi-tailwind-plan`   | 116.01020900000003; 112.99579200000005; 111.88487500000008; 115.16966699999989; 115.19262499999991 | 115.16966699999989 | 111.88487500000008 | 116.01020900000003 | 0.8405420000001413 | 105218048; 103579648; 104529920; 105873408; 105529344 |
| `multi-native-css-plan` | 104.23183300000005; 106.70066699999984; 108.08454199999983; 113.50716700000021; 104.03737499999988 | 106.70066699999984 | 104.03737499999988 | 113.50716700000021 |  2.468833999999788 | 102137856; 90357760; 101662720; 103710720; 100614144  |
| `unchanged-write`       | 94.41216600000007; 90.77275000000009; 91.33283399999982; 92.08108399999992; 93.24458300000015      |  92.08108399999992 |  90.77275000000009 |  94.41216600000007 |  1.163499000000229 | 97615872; 97370112; 98910208; 98697216; 98877440      |

## Architecture-test timing

The architecture-test values below came from the same generated report and are observations from isolated processes.

| Command                                                                                          | Recorded milliseconds                                                             |      Median |           Minimum |     Maximum |                MAD |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ----------: | ----------------: | ----------: | -----------------: |
| `node node_modules/vitest/vitest.mjs run test/architecture/enterprise-pipeline-boundary.test.ts` | 7885.041084; 8270.962292; 7733.717292000001; 7860.095666000001; 8042.124209000001 | 7885.041084 | 7733.717292000001 | 8270.962292 | 151.32379199999923 |

## Known hotspots

The inventory identifies responsibility clusters rather than prescribing their eventual decomposition:

- Transaction coordination and recovery are concentrated in `src/transaction/migration-transaction.ts`.
- Tailwind rendering, candidate classification, class conflict detection, arbitrary-value ownership, and extended responsive composition form the largest target-specific cluster.
- Responsive-family and display-composition policy spans the large shared responsive planner and focused Tailwind composition modules.
- Native CSS rendering and owned-stylesheet handling form a smaller but distinct artifact cluster.
- Topology validation and current orchestration remain visible in the migration path validator and migrator.

These size and import observations are evidence for later slices. They do not by themselves prove a new abstraction or ownership boundary.

## Rewrite acceptance gates

- The packaged public behavior oracle remains byte- and output-compatible for all three cases.
- Deterministic workload counters do not regress; intentional improvements update this document and its contract in the same reviewed slice.
- Architecture inventory changes are explained against a moved owner, dependency decision, or deleted obsolete path.
- Benchmark comparisons use the same corpus and at least five recorded runs on the same machine. Wall-clock values remain observations rather than CI failure criteria.
- CI builds before running the benchmark and retains `architecture-benchmark.json`; only command or test failure can fail that job.
- A clean `npm run verify`, packaged CLI execution, documentation contracts, `git diff --check`, and scoped worktree review pass before merge.
- The undeclared `ignore` import is resolved only in delivery slice 8; no second undeclared production package may enter the baseline.
- No pipeline-shell work begins until the Slice 1 baseline pull request is merged.
