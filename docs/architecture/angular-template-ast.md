# Angular template AST migration engine

## Decision

The migration engine will use the Angular compiler template AST instead of parsing and serializing templates as generic HTML.

Angular templates are not HTML. Property bindings, structural directives, control-flow blocks, interpolation, i18n metadata, and expression syntax require an Angular-aware parser. The codemod must understand those constructs without rewriting unrelated source text.

This is an intentional breaking change to the prerelease v2 TypeScript API. CLI behavior remains safety-first: a source input is removed only after its replacement has been planned and validated.

## Dependency policy

The engine uses `@angular/compiler` 21.2.22, the newest Angular LTS compiler available when this decision was recorded. It is a runtime dependency of the codemod and does not use the compiler installed in the migrated application.

The parser wrapper is the only module allowed to depend directly on Angular compiler AST classes. This isolates compiler-version changes from analyzers and target adapters.

Cheerio and `p-queue` were removed after the AST implementation reached behavioral parity. Intra-file conversion is deterministic and synchronous; parallel mutation of one syntax tree is not permitted.

## Goals

- Parse modern and legacy Angular template syntax with source locations.
- Preserve all source text outside explicitly validated edits.
- Represent discovery, classification, planning, and editing as separate operations.
- Keep target adapters independent of Angular compiler classes and filesystem access.
- Make partial or conflicting mutations impossible.
- Produce stable, source-ordered results suitable for CLI and JSON reporting.
- Retain the safe static Tailwind behavior covered by the compatibility suite.

## Non-goals

- Evaluate Angular expressions or application TypeScript.
- Format an entire template after a migration.
- Convert responsive inputs before exact media-query support exists.
- Add new directive mappings during the parser replacement.
- Use a project's Angular workspace, dependency injector, or build configuration.

## Architecture

### Template parser

`AngularTemplateParser` accepts source text and a file name. It calls Angular's `parseTemplate` and returns a project-owned discriminated union:

```ts
type TemplateParseResult =
  { status: 'parsed'; template: ParsedTemplate } | { status: 'parse-error'; diagnostics: readonly ParseDiagnostic[] };
```

`ParsedTemplate` contains normalized elements and inputs rather than Angular AST nodes. Every input records its directive name, raw source name, raw value, binding kind, optional breakpoint, element identity, and absolute source ranges. Ranges use half-open offsets: `start` is inclusive and `end` is exclusive.

The wrapper traverses elements, templates, and control-flow branches in document order. Angular compiler nodes never cross this boundary.

### Source model

```ts
interface SourceRange {
  readonly start: number;
  readonly end: number;
}

interface TemplateElement {
  readonly id: string;
  readonly name: string;
  readonly startTag: SourceRange;
  readonly attributes: readonly TemplateAttribute[];
  readonly parentId?: string;
}

interface TemplateAttribute {
  readonly name: string;
  readonly value: string;
  readonly binding: 'literal' | 'property';
  readonly source: SourceRange;
  readonly nameSource: SourceRange;
  readonly valueSource?: SourceRange;
}
```

Element identifiers are deterministic source offsets, not generated UUIDs. Parent relationships allow context-sensitive conversions without exposing mutable DOM nodes.

### Analyzer

`TemplateAnalyzer` consumes `ParsedTemplate` and the Flex-Layout catalog. It returns normalized `FlexLayoutInput` values in source order. It does not know which target is selected and does not create edits.

Classification uses an exhaustive result union:

```ts
type ConversionResult = ConvertedResult | ReviewResult | UnsupportedResult | InvalidResult | ParseErrorResult;
```

Unresolved results contain a stable diagnostic code, source range, file name, reason, and suggested action.

### Target adapters

A target adapter is a pure planner:

```ts
interface ConversionAdapter {
  readonly name: 'css' | 'tailwind';
  plan(input: FlexLayoutInput, context: ConversionContext): PlannedConversion;
}
```

`PlannedConversion` is either a complete set of edits or an unresolved result. Adapters cannot access the filesystem or modify template state.

The existing Tailwind attribute converters are replaced with functions that return class names. Class merging is handled once by a shared planner. Context-sensitive conversions receive immutable element and parent data through `ConversionContext`.

### Edit planning

Edits operate on source ranges:

```ts
interface SourceEdit {
  readonly range: SourceRange;
  readonly text: string;
  readonly inputId: string;
}
```

`ConversionPlanner` groups conversions by element, merges class additions with existing literal class attributes, and creates insertions when no class attribute exists. Bound class inputs are not rewritten automatically because runtime class values cannot be merged safely.

Removal of a Flex-Layout input and insertion of its replacement belong to one planned conversion. The planner never emits one without the other.

### Edit validation and application

`SourceEditor` validates the complete file plan before applying it:

- offsets are integers within the source bounds;
- each range has `start <= end`;
- replacement ranges do not overlap;
- insertions at the same offset have a deterministic order;
- every edit refers to a converted input;
- every converted input has all required edits.

If validation fails, no edits are applied and the file is not written. Valid edits are applied from the highest offset to the lowest so earlier source positions remain stable.

The editor preserves the original newline sequence and every byte outside edited ranges. A second run over migrated output must produce no edits.

### Migration orchestration

`FileMigrator` becomes a thin coordinator:

1. Read the source file.
2. Parse it through `AngularTemplateParser`.
3. Return parse diagnostics without writing on failure.
4. Analyze Flex-Layout inputs.
5. Ask the selected adapter to plan each conversion.
6. Validate the complete edit plan.
7. Apply edits and write only when output changed.
8. Return source-ordered results.

Folder traversal owns bounded file-level concurrency. Results are sorted by normalized file path and source offset before reporting.

## Error handling

Angular parse errors are user-facing results, not thrown internal exceptions. They include the compiler message and source range. I/O failures and invariant violations remain exceptions handled by the CLI's top-level error boundary.

Adapter failures for recognized input are represented as `invalid`, `review`, or `unsupported`. An adapter may not log a warning and then claim conversion succeeded.

Output is written through a temporary sibling file followed by an atomic rename. If writing or renaming fails, the existing output remains untouched.

## Testing strategy

All behavior is developed with red-green-refactor cycles.

Parser contract tests use real Angular templates and literal expected offsets. Fixtures cover:

- literal and property-bound Flex-Layout inputs;
- interpolation and pipes;
- structural directives and microsyntax;
- `@if`, `@else`, `@for`, `@switch`, and `@defer` blocks;
- comments, i18n metadata, entities, and namespace elements;
- self-closing elements and void elements;
- inline templates and complete `.html` files;
- LF and CRLF line endings;
- malformed templates and incomplete editing states.

Planner tests verify class merging, multiple inputs on one element, parent-dependent context, bound-class preservation, and conflict rejection. Editor tests verify offset validation, deterministic insertion order, atomic failure, byte preservation, and idempotency.

End-to-end compatibility fixtures run the same input through the old expected behavior and the AST engine. Cheerio is removed only after all supported static Tailwind cases pass and every unresolved case remains present in the output.

## Delivery

The replacement is implemented on one feature branch in reviewable commits:

1. Add the Angular parser boundary and source model.
2. Add pure edit validation and application.
3. Add analysis and planning interfaces.
4. Port static Tailwind converters to pure class planners.
5. Replace `FileMigrator` orchestration and add atomic writes.
6. Add end-to-end compatibility and idempotency fixtures.
7. Remove Cheerio, `p-queue`, mutable converter interfaces, and obsolete tests.
8. Update compatibility and contributor documentation.

Every commit leaves the test suite passing. The feature is merged only after the full verification and package smoke suites pass.
