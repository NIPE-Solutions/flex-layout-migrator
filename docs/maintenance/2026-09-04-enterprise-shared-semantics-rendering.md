# Enterprise shared semantics and rendering evidence

This report records the Slice 4 semantic-policy and production Render cutover from the established enterprise-architecture baseline. Deterministic counters and symbol-resolved architecture assertions are acceptance evidence. Timings are observational; no wall-clock measurement is a CI failure threshold. No repeatable median improvement is claimed.

## Commit

Commit captured: `8d52ed0ceb7c88cb03f674efaf46b816ed63d823`

The inventory and benchmark were regenerated from the committed Task 5 fix-round implementation above. The subsequent evidence commit changes no production source, architecture assertion, or benchmark workload.

## Environment

- Node.js: `v24.20.0`
- npm: `11.19.0`
- Platform: `darwin-arm64`
- Operating system: `macOS 14.6.1` (`23G93`)
- Kernel: `Darwin 23.6.0`, `RELEASE_ARM64_T6031`

## Behavior oracle

The Slice 4 route retains the established packaged `dist/cli.js` parity matrix across Tailwind, native CSS, responsive-image, plan, write, and unchanged-rerun cases. The completion gate reruns that public oracle and the packaged CLI checks. Exact terminal output, JSON reports, exit status, template bytes, stylesheet bytes, and repeat-write stability remain binding.

The new table-driven target-parity contract sends identical located inputs and element context through `ElementSemanticPlanner` and both real renderers. It asserts exact shared semantics and established output for `fxLayout`, `fxLayoutGap`, `fxLayoutAlign`, `fxFlex`, `fxGrow`, `fxShrink`, `fxFlexAlign`, `fxFlexFill`, `fxFill`, `fxFlexOffset`, and `fxFlexOrder`. Separate rows retain complete diagnostics for Grid, visibility, responsive class/style, orientation, print, custom breakpoints, dynamic bindings, Tailwind class conflicts, and CSS limitations.

## Workload counters

The existing scenario names and counter columns remain unchanged. Original template reads and initial parses stay single-owner Analyze work. Changed-template reparses remain in the temporary compatibility edit validator and occur once only when a proposal changes. Plan mode performs no project writes.

| Scenario                   | Discovery passes | Templates discovered | Template reads | Initial parses | Validation parses | Rendered templates | Stylesheet reads | Project writes |
| -------------------------- | ---------------: | -------------------: | -------------: | -------------: | ----------------: | -----------------: | ---------------: | -------------: |
| Single-file Tailwind plan  |                1 |                    1 |              1 |              1 |                 1 |                  1 |                0 |              0 |
| Single-file Tailwind write |                1 |                    1 |              1 |              1 |                 1 |                  1 |                0 |              1 |
| Two-file CSS folder plan   |                1 |                    2 |              2 |              2 |                 2 |                  2 |                0 |              0 |
| Two-file CSS folder write  |                1 |                    2 |              2 |              2 |                 2 |                  2 |                0 |              3 |
| Unchanged Tailwind rerun   |                1 |                    1 |              1 |              1 |                 1 |                  1 |                0 |              0 |
| Unchanged CSS folder rerun |                1 |                    2 |              2 |              2 |                 2 |                  2 |                1 |              0 |

## Render lifecycle counters

The production counter harness records one semantic planning pass for every parsed template, one target-render call for every converted family, and one target-session finalization per invocation. An unchanged rerun means the newly rendered proposal already matches the destination; it still resolves and renders each source family and validates each generated template before the transaction determines that no project write is needed.

| Scenario                   | Parsed templates | Semantic planning passes | Validation parses | Session finalizations |
| -------------------------- | ---------------: | -----------------------: | ----------------: | --------------------: |
| Single-file Tailwind plan  |                1 |                        1 |                 1 |                     1 |
| Single-file Tailwind write |                1 |                        1 |                 1 |                     1 |
| Two-file CSS folder plan   |                2 |                        2 |                 2 |                     1 |
| Two-file CSS folder write  |                2 |                        2 |                 2 |                     1 |
| Unchanged Tailwind rerun   |                1 |                        1 |                 1 |                     1 |
| Unchanged CSS folder rerun |                2 |                        2 |                 2 |                     1 |

## Target render counters

| Scenario                   | Converted families | Target renders |
| -------------------------- | -----------------: | -------------: |
| Single-file Tailwind plan  |                  1 |              1 |
| Single-file Tailwind write |                  1 |              1 |
| Two-file CSS folder plan   |                  2 |              2 |
| Two-file CSS folder write  |                  2 |              2 |
| Unchanged Tailwind rerun   |                  1 |              1 |
| Unchanged CSS folder rerun |                  2 |              2 |

Stored original parse failures bypass semantic planning, target rendering, and changed-template validation. A render or asynchronous validation rejection prevents session finalization.

## Inventory evidence

Generated with `npm run architecture:inventory -- --json <temporary-path>` from the Task 5 implementation tree. The inventory is Git-tracked production TypeScript, excludes specifications, and uses the TypeScript AST for import edges and declared policy symbols.

| Measure                                                       | Slice 1 baseline | Slice 4 |
| ------------------------------------------------------------- | ---------------: | ------: |
| Production TypeScript files                                   |              122 |     165 |
| Runtime dependency entries                                    |                5 |       5 |
| Static internal and runtime external or built-in module edges |              416 |     619 |
| Known policy owners                                           |                6 |       6 |

The file and edge increases are the immutable stage handoffs, Discover/Analyze/Render stages and ports, shared semantic planners, target renderers, compatibility validation boundary, and structural safeguards delivered through Slices 2–4. Slice 4 deletes the superseded adapter responsive-family barrel. It adds no runtime dependency or Changeset; `ignore` remains the single known undeclared runtime import reserved for Slice 8.

## Policy owners

| Policy                    | Module                                      | Symbol                    |
| ------------------------- | ------------------------------------------- | ------------------------- |
| artifact identity         | `src/adapter/css/css-artifact.registry.ts`  | `CssArtifactRegistry`     |
| breakpoint classification | `src/breakpoint/breakpoint-catalog.ts`      | `BreakpointCatalog`       |
| diagnostics               | `src/analyzer/conversion-result.ts`         | `DiagnosticCode`          |
| responsive precedence     | `src/semantic/responsive-family.planner.ts` | `ResponsiveFamilyPlanner` |
| semantic planning         | `src/semantic/element-semantic.planner.ts`  | `ElementSemanticPlanner`  |
| transaction recovery      | `src/transaction/migration-transaction.ts`  | `MigrationTransaction`    |

Resolved-symbol architecture checks additionally prove that the responsive owner above is the only canonical declaration through direct declarations, runtime exports, barrels, and aliases; semantic modules have no type or runtime dependency on targets or side-effect layers; renderer eligibility, render, conflict, and record calls stay in the external coordinator; only `RenderProjectStage` calls interface or concrete render-session finalization; and `Migrator` has no runtime semantic, rendering, conversion-planner, or adapter-session import. Related inspections share one immutable TypeScript Program per scenario, with deterministic construction-count assertions preserving fixture isolation.

## Benchmark method

The unchanged benchmark JSON schema was used after `npm run benchmark:architecture:prepare`. The supported CLI form, `npm run benchmark:architecture -- --json <temporary-path>`, defaults to the requested five samples. Each of the four packaged-product scenarios and the architecture-test scenario used one discarded warm-up followed by five recorded samples on the same machine. Product invocations retain elapsed milliseconds and peak RSS; the architecture test runs in a fresh process for every sample.

Timings are observational. The result is mixed relative to the Slice 1 medians, and architecture-suite time increased as the symbol-resolved ownership surface expanded. No repeatable median improvement is claimed.

## Benchmark results

Generated at `2026-09-04T11:19:48.981Z`. Millisecond and peak-RSS values are machine-specific observations.

| Scenario                | Recorded milliseconds                                                                              |             Median |            Minimum |            Maximum |                MAD | Recorded peak RSS bytes                            |
| ----------------------- | -------------------------------------------------------------------------------------------------- | -----------------: | -----------------: | -----------------: | -----------------: | -------------------------------------------------- |
| `single-tailwind-plan`  | 98.56095900000003; 102.67216599999983; 100.46191700000008; 101.359375; 99.32887500000015           | 100.46191700000008 |  98.56095900000003 | 102.67216599999983 | 1.1330419999999322 | 97648640; 97583104; 96092160; 97058816; 97255424   |
| `multi-tailwind-plan`   | 120.73641599999996; 115.93299999999999; 114.2638750000001; 112.63012499999991; 112.96124999999984  |  114.2638750000001 | 112.63012499999991 | 120.73641599999996 |  1.633750000000191 | 101318656; 99368960; 100876288; 99434496; 99008512 |
| `multi-native-css-plan` | 104.96466699999974; 102.35191600000007; 104.24058299999979; 107.70495900000014; 105.00645900000018 | 104.96466699999974 | 102.35191600000007 | 107.70495900000014 |  0.724083999999948 | 97992704; 97042432; 96468992; 96518144; 97107968   |
| `unchanged-write`       | 89.46720800000003; 91.63341700000001; 90.86845799999992; 94.70074999999997; 105.7410420000001      |  91.63341700000001 |  89.46720800000003 |  105.7410420000001 | 2.1662089999999807 | 94388224; 94797824; 93192192; 93585408; 96681984   |

## Architecture-test timing

The architecture suite is measured separately from the product scenarios.

| Command                                                                                          | Recorded milliseconds                                                                       |       Median |            Minimum |            Maximum |               MAD |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | -----------: | -----------------: | -----------------: | ----------------: |
| `node node_modules/vitest/vitest.mjs run test/architecture/enterprise-pipeline-boundary.test.ts` | 31338.378916; 32256.915374999997; 31503.737292000005; 30670.33529199999; 30016.220415999996 | 31338.378916 | 30016.220415999996 | 32256.915374999997 | 668.0436240000126 |

## Ownership transition

The production authority graph is now:

```text
src/cli/run-cli.ts -> CurrentMigrationPipeline.run
CurrentMigrationPipeline.run -> DiscoverProjectStage.run
CurrentMigrationPipeline.run -> AnalyzeProjectStage.run
CurrentMigrationPipeline.run -> RenderProjectStage.run
CurrentMigrationPipeline.run -> Migrator.migrate
RenderProjectStage.run -> RenderSession.finalize
Migrator.migrate -> MigrationTransaction.apply
```

The generic `MigrationPipeline` also calls its abstract `RenderStage.run`; it is a typed orchestration boundary, not a second concrete Render owner. Production CLI composition remains through `CurrentMigrationPipeline`. `RenderedProject` is the only continuation input to `Migrator`, so semantic planning, target rendering, and target-session finalization cannot flow downstream.

Shared semantics are target-free. `TailwindRenderer` and `CssRenderer` receive resolved plans and own only target capabilities, output syntax, artifact registration, and target-specific conflicts. Exact cross-target contracts preserve common semantic meaning while making target limitations explicit.

## Retained compatibility

`CompatibilityEditValidator` remains inside Render as the named Slice 5 debt for proposed edit application, distinct-destination reads, and changed-template Angular reparsing. `CurrentMigrationPipeline` and the generic pipeline compatibility surface remain assigned to Slice 7. Test-only adapter compatibility aliases, `src/migrator/file.migrator.ts`, and the empty `src/migrator/folder.migrator.ts` tombstone remain unreachable from the production authority graph and are assigned to Slice 8.

CSS reference collection, stylesheet merging, validation, report construction, and transaction coordination remain downstream until their named slices. This slice removes no File/Folder tombstone, introduces no alternate production pipeline, and preserves the exact public behavior contract.
