# Enterprise shared semantics and rendering evidence

This report records the Slice 4 semantic-policy and production Render cutover from the established enterprise-architecture baseline. Deterministic counters and symbol-resolved architecture assertions are acceptance evidence. Timings are observational; no wall-clock measurement is a CI failure threshold. No repeatable median improvement is claimed.

## Commit

Commit captured: `4e4222962aa467fff3877041bac9a1e4d6cc186e`

The inventory and benchmark were regenerated from the committed Task 5 implementation above. This evidence-only follow-up changes no production source, architecture assertion, or benchmark workload.

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

The production counter harness records one semantic planning pass for every parsed template, one target-render call for every converted family, and one target-session finalization per invocation. Unchanged reruns still plan each parsed template, but produce no converted family and require no generated-template validation parse.

| Scenario                   | Parsed templates | Semantic planning passes | Validation parses | Session finalizations |
| -------------------------- | ---------------: | -----------------------: | ----------------: | --------------------: |
| Single-file Tailwind plan  |                1 |                        1 |                 1 |                     1 |
| Single-file Tailwind write |                1 |                        1 |                 1 |                     1 |
| Two-file CSS folder plan   |                2 |                        2 |                 2 |                     1 |
| Two-file CSS folder write  |                2 |                        2 |                 2 |                     1 |
| Unchanged Tailwind rerun   |                1 |                        1 |                 0 |                     1 |
| Unchanged CSS folder rerun |                2 |                        2 |                 0 |                     1 |

## Target render counters

| Scenario                   | Converted families | Target renders |
| -------------------------- | -----------------: | -------------: |
| Single-file Tailwind plan  |                  1 |              1 |
| Single-file Tailwind write |                  1 |              1 |
| Two-file CSS folder plan   |                  2 |              2 |
| Two-file CSS folder write  |                  2 |              2 |
| Unchanged Tailwind rerun   |                  0 |              0 |
| Unchanged CSS folder rerun |                  0 |              0 |

Stored original parse failures bypass semantic planning, target rendering, and changed-template validation. A render or asynchronous validation rejection prevents session finalization.

## Inventory evidence

Generated with `npm run architecture:inventory -- --json <temporary-path>` from the Task 5 implementation tree. The inventory is Git-tracked production TypeScript, excludes specifications, and uses the TypeScript AST for import edges and declared policy symbols.

| Measure                                                       | Slice 1 baseline | Slice 4 |
| ------------------------------------------------------------- | ---------------: | ------: |
| Production TypeScript files                                   |              122 |     165 |
| Runtime dependency entries                                    |                5 |       5 |
| Static internal and runtime external or built-in module edges |              416 |     621 |
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

Resolved-symbol architecture checks additionally prove that the responsive owner above is canonical through runtime exports and aliases, semantic modules have no target or side-effect dependency, only `RenderProjectStage` calls `RenderSession.finalize`, and `Migrator` has no runtime semantic, rendering, conversion-planner, or adapter-session import.

## Benchmark method

The unchanged benchmark JSON schema was used after `npm run benchmark:architecture:prepare`. The supported CLI form, `npm run benchmark:architecture -- --json <temporary-path>`, defaults to the requested five samples. Each of the four packaged-product scenarios and the architecture-test scenario used one discarded warm-up followed by five recorded samples on the same machine. Product invocations retain elapsed milliseconds and peak RSS; the architecture test runs in a fresh process for every sample.

Timings are observational. The result is mixed relative to the Slice 1 medians, and architecture-suite time increased as the symbol-resolved ownership surface expanded. No repeatable median improvement is claimed.

## Benchmark results

Generated at `2026-09-04T10:34:05.977Z`. Millisecond and peak-RSS values are machine-specific observations.

| Scenario                | Recorded milliseconds                                                                              |             Median |            Minimum |            Maximum |                MAD | Recorded peak RSS bytes                            |
| ----------------------- | -------------------------------------------------------------------------------------------------- | -----------------: | -----------------: | -----------------: | -----------------: | -------------------------------------------------- |
| `single-tailwind-plan`  | 98.25608299999999; 97.31491699999998; 101.886167; 99.00433299999997; 97.25575000000003             |  98.25608299999999 |  97.25575000000003 |         101.886167 | 0.9411660000000097 | 96305152; 96501760; 97878016; 96436224; 96223232   |
| `multi-tailwind-plan`   | 145.39408300000002; 126.26462500000002; 114.03370899999982; 116.03445899999997; 116.58054200000015 | 116.58054200000015 | 114.03370899999982 | 145.39408300000002 | 2.5468330000003334 | 101990400; 96501760; 99811328; 100007936; 98566144 |
| `multi-native-css-plan` | 102.91266700000006; 102.33970799999997; 103.66687499999989; 102.06491700000015; 108.11612500000001 | 102.91266700000006 | 102.06491700000015 | 108.11612500000001 |  0.754207999999835 | 96190464; 97288192; 96534528; 95633408; 95813632   |
| `unchanged-write`       | 89.693667; 90.55404199999975; 90.239916; 91.36070900000004; 89.1871659999997                       |          90.239916 |   89.1871659999997 |  91.36070900000004 | 0.5462489999999889 | 93962240; 93683712; 95780864; 93945856; 93667328   |

## Architecture-test timing

The architecture suite is measured separately from the product scenarios.

| Command                                                                                          | Recorded milliseconds                                                                  |       Median |            Minimum |            Maximum |               MAD |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | -----------: | -----------------: | -----------------: | ----------------: |
| `node node_modules/vitest/vitest.mjs run test/architecture/enterprise-pipeline-boundary.test.ts` | 29013.112459; 27540.524250000002; 29072.723583; 31190.998833999998; 28890.366375000012 | 29013.112459 | 27540.524250000002 | 31190.998833999998 | 122.7460839999876 |

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
