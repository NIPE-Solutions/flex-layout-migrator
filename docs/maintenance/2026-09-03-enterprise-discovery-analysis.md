# Enterprise discovery and analysis evidence

This report records the Slice 3 ownership cutover from the established enterprise-architecture baseline. Deterministic counters and semantic architecture assertions are acceptance evidence. Timings are observational and are not CI thresholds or a performance-improvement claim.

## Commit

Commit captured: `5aebdaff5e6ea32b488199a6a0908fb8e8d69d47`

Initial workload and benchmark commit: `d15b2aa1ccaacdbc1b4cf38c7930e0b6c1c9f7db`

Current structural inventory commit: `5aebdaff5e6ea32b488199a6a0908fb8e8d69d47`

The benchmark remains the five-sample observation from the initial implementation commit. The inventory was refreshed from the current structural commit after the destination-template filesystem adapter was separated from `Migrator`; the evidence document is committed separately so both measured revisions remain exact.

## Environment

- Node.js: `v24.20.0`
- npm: `11.19.0`
- Platform: `darwin-arm64`
- Operating system: `macOS 14.6.1` (`23G93`)
- Kernel: `Darwin 23.6.0`, `RELEASE_ARM64_T6031`

## Behavior oracle

The Slice 3 route retains the established packaged `dist/cli.js` parity matrix across Tailwind, native CSS, responsive-image, plan, write, and unchanged-rerun cases. The final gate reruns that public oracle together with the packaged CLI matrix; terminal output, JSON reports, exit status, template bytes, stylesheet bytes, and repeat-write stability remain binding.

## Workload counters

The existing scenario names and columns are unchanged. `Template reads` now records the original reads owned by Analyze; distinct-destination reads remain observed separately by the harness. `Validation parses` now records the changed-proposal reparses owned by `AnalyzedFileMigrator`; native-CSS reference collection remains observed separately and is not mislabeled as validation. Every discovered input has exactly one original read and one initial parse. Successfully parsed inputs have exactly one analysis; parse-error inputs have none. Every changed proposal has one validation reparse, while a proposal with no edits has none.

| Scenario                   | Discovery passes | Templates discovered | Template reads | Initial parses | Validation parses | Rendered templates | Stylesheet reads | Project writes |
| -------------------------- | ---------------: | -------------------: | -------------: | -------------: | ----------------: | -----------------: | ---------------: | -------------: |
| Single-file Tailwind plan  |                1 |                    1 |              1 |              1 |                 1 |                  1 |                0 |              0 |
| Single-file Tailwind write |                1 |                    1 |              1 |              1 |                 1 |                  1 |                0 |              1 |
| Two-file CSS folder plan   |                1 |                    2 |              2 |              2 |                 2 |                  2 |                0 |              0 |
| Two-file CSS folder write  |                1 |                    2 |              2 |              2 |                 2 |                  2 |                0 |              3 |
| Unchanged Tailwind rerun   |                1 |                    1 |              1 |              1 |                 1 |                  1 |                0 |              0 |
| Unchanged CSS folder rerun |                1 |                    2 |              2 |              2 |                 2 |                  2 |                1 |              0 |

## Deterministic comparison

Against the Slice 1 baseline, the two-file CSS scenarios no longer count two reference-collection parses as validation work: validation parses move from 4 to 2. The unchanged Tailwind rerun records 1 original read instead of a combined 2 original/destination reads. The unchanged CSS rerun records 2 original reads instead of 6 combined original/destination reads, and 2 validation reparses instead of 4 combined validation/reference parses. Single-file changed Tailwind ownership counts were already 1 and remain 1. These are authority-specific deterministic counts, not claims that required distinct-destination or native-CSS reference work disappeared.

## Inventory evidence

Generated with `npm run architecture:inventory -- --json architecture-inventory.json` from the current structural inventory commit. The JSON schema is unchanged.

| Measure                                                       | Slice 1 baseline | Slice 3 |
| ------------------------------------------------------------- | ---------------: | ------: |
| Production TypeScript files                                   |              122 |     139 |
| Runtime dependency entries                                    |                5 |       5 |
| Static internal and runtime external or built-in module edges |              416 |     474 |
| Known policy owners                                           |                6 |       6 |

The additional production files and edges are the staged handoffs, concrete Discover/Analyze stages, narrow ports, the analyzed renderer boundary, the focused destination-template filesystem adapter, compatibility error-path mapper, and restored Discover progress-logger edge delivered by Slice 3. Runtime dependency and policy-owner counts are unchanged. `ignore` remains the single known undeclared runtime import reserved for Slice 8; no dependency or lockfile changed.

## Benchmark method

The existing four product scenarios and architecture-test scenario ran through the unchanged benchmark JSON schema after `npm run benchmark:architecture:prepare`. Each scenario used one discarded warm-up followed by five recorded samples on the same machine. Product invocations used the built package and retained elapsed milliseconds plus peak RSS. The architecture test ran in a fresh process per sample. Timings are observational; this report makes no wall-clock improvement claim.

## Benchmark results

Generated at `2026-09-03T19:53:24.266Z`. Milliseconds and peak RSS are machine-specific observations.

| Scenario                | Recorded milliseconds                                                                              |             Median |            Minimum |            Maximum |                MAD | Recorded peak RSS bytes                          |
| ----------------------- | -------------------------------------------------------------------------------------------------- | -----------------: | -----------------: | -----------------: | -----------------: | ------------------------------------------------ |
| `single-tailwind-plan`  | 98.96908300000001; 102.73849999999999; 104.17454200000003; 102.50058299999995; 101.14070900000002  | 102.50058299999995 |  98.96908300000001 | 104.17454200000003 | 1.3598739999999339 | 97009664; 95879168; 96403456; 96780288; 96239616 |
| `multi-tailwind-plan`   | 117.32075000000009; 114.50341700000001; 113.56087500000012; 116.90604199999984; 114.56791599999997 | 114.56791599999997 | 113.56087500000012 | 117.32075000000009 | 1.0070409999998446 | 99221504; 99565568; 98729984; 98451456; 98828288 |
| `multi-native-css-plan` | 103.83220800000004; 110.0875840000001; 106.0374589999999; 105.46245899999985; 105.56895900000018   | 105.56895900000018 | 103.83220800000004 |  110.0875840000001 | 0.4684999999997217 | 97435648; 96600064; 95485952; 95731712; 96632832 |
| `unchanged-write`       | 92.7527500000001; 91.37820800000009; 93.81083399999989; 94.43662499999982; 91.9728339999997        |   92.7527500000001 |  91.37820800000009 |  94.43662499999982 | 1.0580839999997806 | 95731712; 95207424; 94683136; 95240192; 94355456 |

## Architecture-test timing

The semantic architecture suite is timed separately from product scenarios and has no threshold.

| Command                                                                                          | Recorded milliseconds                                                             |      Median |           Minimum |           Maximum |               MAD |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ----------: | ----------------: | ----------------: | ----------------: |
| `node node_modules/vitest/vitest.mjs run test/architecture/enterprise-pipeline-boundary.test.ts` | 9529.044208; 9506.023791; 9454.727583000004; 9618.733249999997; 9277.145958000001 | 9506.023791 | 9277.145958000001 | 9618.733249999997 | 51.29620799999611 |

## Ownership transition

The executable semantic graph is exactly:

```text
src/cli/run-cli.ts -> CurrentMigrationPipeline.run
CurrentMigrationPipeline.run -> DiscoverProjectStage.run
CurrentMigrationPipeline.run -> AnalyzeProjectStage.run
CurrentMigrationPipeline.run -> Migrator.migrate
Migrator.migrate -> MigrationTransaction.apply
```

Discover exclusively invokes the `DiscoveryFileSystem.kind`, `DiscoveryFileSystem.entries`, and `IgnoreMatcherFactory.load` authorities, and it is the sole acquirer of `createGitIgnoreMatcher`. Analyze exclusively invokes `TemplateSourceReader.read` and `TemplateInputAnalyzer.analyze`. Parser findings name the four retained roles: `OriginalTemplateParser.parse` in Analyze, `ChangedTemplateValidation.parse` in `AnalyzedFileMigrator`, `CssReferenceParser.parse` in `Migrator`, and `StagedTemplateValidation.parse` in the transaction. Analyze has no adapter, planner, report, transaction, atomic-writer, or filesystem-mutation authority.

Concrete filesystem acquisition and operation findings are enforced independently of these ports. Each named runtime binding emits an operation-specific `FileSystem.acquire.<operation>` finding, while a default or whole-module namespace is explicit as `FileSystem.acquire.*`; type-only bindings emit nothing. `destination-template-source.ts` is the only concrete reader for existing destination/reference template bytes; `Migrator` and `AnalyzedFileMigrator` receive its narrow `DestinationTemplateSource` port and no longer acquire filesystem APIs. Analyze remains the only concrete original-template reader, Discover remains the only topology and ignore-loading owner, and `StylesheetPlanner` retains its distinct stylesheet-read role. Exact findings retain duplicate bindings, so adding an unused byte reader beside an allowed binding changes the owner evidence and cannot disappear through declaration-level or pair deduplication.

The inspector follows canonical types and symbols through aliases, namespace and dynamic imports, CommonJS and TypeScript import-equals acquisition, constructors, `.call`, `.apply`, `Reflect.apply`, nested destructuring, and computed members. The concrete topology and byte-read surface covers synchronous, promise, descriptor, directory-handle, stream, Blob, JSON, metadata, glob, link, realpath, watch, and current helper operations across `node:fs`, `node:fs/promises`, and `fs-extra`. Filesystem and ignore-helper acquisition provenance follows ordinary `export … from` edges, named namespace re-exports, export-star dependencies, and imported local bindings that are exported under aliases or assignments, including multi-hop and cyclic barrels. Namespace inspection unions every reachable runtime export rather than stopping after direct sibling exports, and that plural operation identity is retained through namespace-valued assignments, member access, and destructuring for both dynamic-import and CommonJS consumers. Type-only and unrelated same-named exports remain negative controls, and traversal terminates on cycles. Unknown computed members on canonical receivers fail closed. Equivalent whole-project semantic inspection is cached within the ownership scenario. This finding-shape refinement changes no production file, inventory edge, workload count, or evidence schema, so the recorded structural inventory remains current.

## Retained compatibility

Render through Apply remain on the compatibility continuation. `AnalyzedFileMigrator` renders authoritative analyzed templates and owns the named changed-template validation parse. `Migrator` retains one invocation-scoped session, CSS reference collection, stylesheet planning, report construction, and transaction coordination.

Canonical-to-raw I/O error mapping is restricted to Discover, Analyze, and distinct-destination source reads; validation, stylesheet, transaction, rendering, and other continuation errors retain their original absolute error metadata and messages. Folder discovery follows legacy stat semantics for symlink and unknown directory entries, retains deterministic per-entry debug progress with raw relative display paths, and includes Discover and Analyze in the invocation duration reported by the continuation.

`src/migrator/file.migrator.ts` is an alias-only deprecated compatibility module, and `src/migrator/folder.migrator.ts` is an empty tombstone. Neither is reachable from the production authority graph. Both name Slice 8 as their deletion point. The obsolete module-global gitignore cache and its unreachable `loadGitIgnore` and `shouldIgnore` exports were removed in this slice.
