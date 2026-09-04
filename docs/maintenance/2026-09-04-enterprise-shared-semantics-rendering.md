# Enterprise shared semantics and rendering evidence

This report records the Slice 4 semantic-policy and production Render cutover from the established enterprise-architecture baseline. Deterministic counters and symbol-resolved architecture assertions are acceptance evidence. Timings are observational; no wall-clock measurement is a CI failure threshold. No repeatable median improvement is claimed.

## Commit

Commit captured: `a5ff9ce5bd63b0f1d156e424654745429f352f8a`

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
| Production TypeScript files                                   |              122 |     164 |
| Runtime dependency entries                                    |                5 |       5 |
| Static internal and runtime external or built-in module edges |              416 |     611 |
| Known policy owners                                           |                6 |       6 |

The file and edge increases are the immutable stage handoffs, Discover/Analyze/Render stages and ports, shared semantic planners, target renderers, compatibility validation boundary, and structural safeguards delivered through Slices 2–4. Slice 4 deletes the superseded adapter responsive-family barrel and the unreachable Tailwind responsive-policy facade that runtime-exported the old owner name. It adds no runtime dependency or Changeset; `ignore` remains the single known undeclared runtime import reserved for Slice 8.

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

Generated at `2026-09-04T11:45:33.734Z`. Millisecond and peak-RSS values are machine-specific observations.

| Scenario                | Recorded milliseconds                                                                           |            Median |            Minimum |            Maximum |                 MAD | Recorded peak RSS bytes                          |
| ----------------------- | ----------------------------------------------------------------------------------------------- | ----------------: | -----------------: | -----------------: | ------------------: | ------------------------------------------------ |
| `single-tailwind-plan`  | 97.126083; 99.30850000000001; 95.518708; 93.39712500000002; 95.248333                           |         95.518708 |  93.39712500000002 |  99.30850000000001 |  1.6073749999999905 | 97632256; 97566720; 96354304; 96010240; 96763904 |
| `multi-tailwind-plan`   | 112.48354099999995; 109.38633300000004; 112.04370799999992; 110.30037500000003; 110.70425       |         110.70425 | 109.38633300000004 | 112.48354099999995 |  1.3179169999999658 | 99827712; 98484224; 99008512; 98205696; 98353152 |
| `multi-native-css-plan` | 100.90091700000016; 98.89208299999996; 98.92816700000003; 100.87916599999994; 99.24849999999992 | 99.24849999999992 |  98.89208299999996 | 100.90091700000016 |  0.3564169999999649 | 95911936; 95535104; 95469568; 97107968; 95109120 |
| `unchanged-write`       | 86.41325000000029; 87.46341699999994; 86.06412500000033; 86.22512499999993; 86.93970799999988   | 86.41325000000029 |  86.06412500000033 |  87.46341699999994 | 0.34912499999995816 | 93683712; 92815360; 93061120; 93372416; 94142464 |

## Architecture-test timing

The architecture suite is measured separately from the product scenarios.

| Command                                                                                          | Recorded milliseconds                                                                       |             Median |      Minimum |            Maximum |               MAD |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | -----------------: | -----------: | -----------------: | ----------------: |
| `node node_modules/vitest/vitest.mjs run test/architecture/enterprise-pipeline-boundary.test.ts` | 30018.390459; 31619.712459000002; 31486.310666999998; 30926.492541999993; 30744.83054200001 | 30926.492541999993 | 30018.390459 | 31619.712459000002 | 559.8181250000052 |

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
