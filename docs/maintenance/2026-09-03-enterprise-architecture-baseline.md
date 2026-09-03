# Enterprise architecture baseline

This document records the Slice 1 baseline for the enterprise architecture rewrite. Stable structural facts and deterministic workload counts are executable documentation contracts. Timing and peak-memory values are observations from one machine and one run.

## Commit

Commit captured: `1b6a8dcde0205e60f6c4f944a668a509d288b5e3`

The evidence was collected before this baseline document was added, from a clean build of the commit above.

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

The rows below enter through `Migrator.migrate()` and record the current production-pipeline work. Counter order is discoveries, template reads, initial Angular parses, validation and reference-collection parses, rendered templates, stylesheet reads, and project writes.

| Scenario                   | Discoveries | Template reads | Initial parses | Validation parses | Rendered templates | Stylesheet reads | Project writes |
| -------------------------- | ----------: | -------------: | -------------: | ----------------: | -----------------: | ---------------: | -------------: |
| Single-file Tailwind plan  |           1 |              1 |              1 |                 1 |                  1 |                0 |              0 |
| Single-file Tailwind write |           1 |              1 |              1 |                 1 |                  1 |                0 |              1 |
| Two-file CSS folder plan   |           2 |              2 |              2 |                 4 |                  2 |                0 |              0 |
| Two-file CSS folder write  |           2 |              2 |              2 |                 4 |                  2 |                0 |              3 |
| Unchanged Tailwind rerun   |           1 |              1 |              1 |                 1 |                  1 |                0 |              0 |
| Unchanged CSS folder rerun |           2 |              4 |              2 |                 4 |                  2 |                1 |              0 |

Repeated reads, parses, and renders are current baseline work, not target values. Later slices may update a row only when a reviewed implementation changes the real pipeline and the public behavior oracle remains green.

## Production structure

The inventory reads Git-tracked `src/**/*.ts` production files, excluding specifications, and parses imports with the TypeScript compiler AST.

| Measure                                       | Count |
| --------------------------------------------- | ----: |
| Production TypeScript files                   |   122 |
| Runtime dependency entries                    |     5 |
| Relative, built-in, and external module edges |   245 |
| Known policy owners                           |     6 |

The six symbol-derived owners are artifact identity (`CssArtifactRegistry` in `src/adapter/css/css-artifact.registry.ts`), breakpoint classification (`BreakpointCatalog` in `src/breakpoint/breakpoint-catalog.ts`), diagnostics (`DiagnosticCode` in `src/analyzer/conversion-result.ts`), responsive precedence (`SharedResponsiveFamilyPlanner` in `src/adapter/responsive-family.planner.ts`), semantic planning (`ConversionPlanner` in `src/planner/conversion-planner.ts`), and transaction recovery (`MigrationTransaction` in `src/transaction/migration-transaction.ts`).

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
| `src/adapter/css/stylesheet/owned-stylesheet.merger.ts`                   |            245 |
| `src/migrator/migrator.ts`                                                |            244 |
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

The benchmark invokes the built package entry point with `node --import scripts/benchmark/memory-probe.mjs dist/cli.js`. Every invocation copies a checked-in fixture to a new temporary project, writes metrics to an invocation-owned path, and must exit successfully.

Warm-up runs per scenario: **1**

Recorded samples per scenario: **5**

Warm-up observations are discarded. The five recorded elapsed-time and peak-RSS observations produce median, minimum, maximum, and median absolute deviation summaries. Scenario order is stable:

1. `single-tailwind-plan`
2. `multi-tailwind-plan`
3. `multi-native-css-plan`
4. `unchanged-write`

## Benchmark results

Generated at `2026-09-03T08:54:27.913Z` on the environment and commit above. Millisecond and peak-RSS values are machine-specific observations. CI does not use wall-clock thresholds.

| Scenario                | Recorded milliseconds                                                                              |             Median |            Minimum |            Maximum |                MAD | Recorded peak RSS bytes                |
| ----------------------- | -------------------------------------------------------------------------------------------------- | -----------------: | -----------------: | -----------------: | -----------------: | -------------------------------------- |
| `single-tailwind-plan`  | 97.67575; 100.721791; 97.34474999999998; 97.04762500000004; 106.55008299999997                     |           97.67575 |  97.04762500000004 | 106.55008299999997 | 0.6281249999999545 | 97808; 98416; 98736; 97440; 101344     |
| `multi-tailwind-plan`   | 127.85149999999999; 133.91358400000001; 118.05620900000008; 115.95770900000002; 117.44954200000006 | 118.05620900000008 | 115.95770900000002 | 133.91358400000001 |  2.098500000000058 | 106416; 106336; 103200; 101744; 102352 |
| `multi-native-css-plan` | 109.1764999999998; 104.9202499999999; 100.03250000000003; 102.12245800000005; 102.45916599999987   | 102.45916599999987 | 100.03250000000003 |  109.1764999999998 |  2.426665999999841 | 99264; 98896; 88096; 98496; 97936      |
| `unchanged-write`       | 94.39654199999995; 92.8530410000003; 93.142875; 94.00412499999993; 91.99858300000005               |          93.142875 |  91.99858300000005 |  94.39654199999995 | 0.8612499999999272 | 97504; 95888; 96752; 95520; 96656      |

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
- A clean `npm run verify`, packaged CLI execution, documentation contracts, `git diff --check`, and scoped worktree review pass before merge.
- The undeclared `ignore` import is resolved only in delivery slice 8; no second undeclared production package may enter the baseline.
- No pipeline-shell work begins until the Slice 1 baseline pull request is merged.
