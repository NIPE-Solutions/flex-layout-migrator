# Tailwind Grid migration

## Purpose

This milestone adds exact Tailwind CSS 4 conversion for the Angular Flex-Layout Grid API. It covers Grid directives at the base viewport and the 13 standard viewport aliases while preserving source whenever the complete runtime behavior cannot be proven.

The implementation follows the archived Angular Flex-Layout style builders rather than inferring behavior from directive names or documentation examples. Legacy defaults and coercion remain intentional compatibility behavior.

Orientation, print, custom breakpoints, native CSS output, and assisted conversion remain outside this milestone.

## Scope

The directive catalog expands from 29 to 30 entries by adding `gdInline`. The Grid family contains:

- container directives: `gdAlignColumns`, `gdAlignRows`, `gdAreas`, `gdAuto`, `gdColumns`, `gdGap`, and `gdRows`;
- child directives: `gdArea`, `gdColumn`, `gdGridAlign`, and `gdRow`;
- the coupled container modifier: `gdInline`.

Literal base values and literal values for `xs`, `sm`, `md`, `lg`, `xl`, `lt-sm`, `lt-md`, `lt-lg`, `lt-xl`, `gt-xs`, `gt-sm`, `gt-md`, and `gt-lg` are eligible for automatic conversion. Bound expressions, orientation aliases, print, custom aliases, and ambiguous ownership remain unchanged with structured diagnostics.

## Architecture

Grid conversion is divided into three responsibilities:

1. A target-neutral parser reproduces the archived Grid style builders as immutable semantic declarations.
2. An element-level planner composes related declarations, responsive activation, display ownership, and `gdInline` into atomic conversion families.
3. The Tailwind renderer encodes semantic declarations as Tailwind CSS 4 candidates and accepts them only when compiler output proves exact property and value ownership.

The semantic layer contains CSS properties and normalized values, not Tailwind class names. This makes the Grid behavior reusable by the later native CSS renderer and keeps target-specific escaping out of Angular compatibility rules.

Small, focused modules own parsing, element-level composition, and rendering. Existing breakpoint, responsive-family, class-conflict, source-editing, and reporting services remain shared; the Grid implementation does not introduce a parallel migration pipeline.

## Runtime-compatible semantics

The parser mirrors the archived Angular Flex-Layout Grid builders:

- `gdAlignColumns` sets `align-content`, `align-items`, and the container display. Unknown main-axis values fall back to `start`; unknown cross-axis values fall back to `stretch`.
- `gdAlignRows` sets `justify-content`, `justify-items`, and the container display with the same `start` and `stretch` defaults.
- `gdAreas` splits pipe-delimited rows, trims each row, quotes it, joins rows with spaces, and sets the container display. An empty value produces the legacy `"none"` area row.
- `gdAuto` sets `grid-auto-flow` and the container display. Unsupported directions fall back to `row`; `dense` is retained only according to the archived builder rules.
- `gdColumns` writes `grid-template-columns`; a trailing `!` selects `grid-auto-columns`. An empty value becomes `none`.
- `gdRows` writes `grid-template-rows`; a trailing `!` selects `grid-auto-rows`. An empty value becomes `none`.
- `gdGap` writes the Grid gap and the container display. An empty value becomes `0`.
- `gdArea`, `gdColumn`, and `gdRow` pass their literal value to the corresponding CSS property; empty values become `auto`.
- `gdGridAlign` writes `justify-self` and `align-self`; unsupported tokens fall back to `stretch` independently.
- `gdInline` selects `inline-grid` when its literal Angular boolean coercion is true and `grid` otherwise.

Raw Grid values are retained only when the selected Tailwind candidate compiles to the exact declaration that the archived builder would apply. Invalid, compiler-empty, or reinterpreted candidates remain unchanged.

## Planning and atomicity

Container directives share ownership of `display`. Their semantic plans are composed once per element so the migration never emits contradictory `grid` and `inline-grid` utilities.

At each activation boundary, the planner determines the effective container display and declarations as one family. If `gdInline`, responsive precedence, an existing class, or responsive class/style authority makes display unsafe, every container conversion that depends on that display state remains unchanged. A directive that owns an unrelated Grid property may remain independently convertible only when removing it cannot alter the unresolved container behavior.

Child directives own their item-level properties and may convert independently when their parent relationship and property ownership are safe. Parent evidence is used when equivalence depends on Grid context; missing, dynamic, or conflicting parent evidence produces a diagnostic rather than a guess.

Multiple responsive declarations use the existing breakpoint catalog and activation ordering. The planner closes family dependencies before edits are created. Generated class order is deterministic and a second run produces no edits.

## Tailwind rendering

The renderer prefers stable built-in utilities only when their emitted declarations exactly match the semantic value. Otherwise it uses deterministic arbitrary-value or arbitrary-property candidates.

Encoding preserves spaces, quotes, pipes, slashes, line names, functions, and CSS variables according to Tailwind CSS 4 syntax. `gdAreas` receives dedicated encoding so quoted row strings survive template parsing and Tailwind scanning.

Every candidate family is checked against the pinned Tailwind compiler. Verification compares emitted CSS property/value pairs, including display and any Tailwind-owned supporting properties. Compiler-empty candidates, incomplete descriptors, theme- or plugin-dependent output, selector-changing variants, and values whose compiled meaning differs from the semantic plan are rejected.

Existing literal Tailwind classes and responsive `ngClass` or `ngStyle` inputs participate in the same compiler-backed ownership checks used by existing conversions. A collision preserves the affected semantic family and reports the conflicting authority.

## Diagnostics

Grid failures use the existing structured result model and stable source locations. Reasons distinguish at least:

- dynamic or bound Grid values;
- unsupported orientation, print, or custom breakpoint aliases;
- malformed or compiler-empty Grid values;
- unsafe parent or element context;
- conflicting display ownership;
- conflicting existing class, `ngClass`, or `ngStyle` ownership;
- incomplete responsive families;
- internal compiler-verification mismatch.

Diagnostics explain why source was retained and give a concrete manual-review suggestion. They do not insert guesses, comments, or partial replacement markup.

## Verification

Implementation follows test-driven development and includes:

- characterization tests for every archived Grid style builder, including defaults, coercion, trailing `!`, and pipe-delimited areas;
- table-driven parser tests for all 11 Grid directives and `gdInline`;
- element-level tests for container coupling, independent child properties, display composition, responsive precedence, and atomic failure;
- existing-class and responsive class/style ownership tests;
- Tailwind CSS 4 compiler differentials for every admitted candidate family;
- browser computed-style comparisons at base state and viewport transitions for representative container and child combinations;
- Angular template parsing, source-byte preservation, deterministic order, and idempotence fixtures;
- compatibility inventory and documentation contracts covering all 30 directives;
- public fixture totals that distinguish converted and preserved Grid inputs;
- full repository verification, audit, packed CLI smoke, clean-status checks, and forbidden-control-file scans.

Completeness means every Grid directive and supported variant has an executable converted-or-preserved expectation. The project does not claim a percentage of application behavior converted.

## Documentation and release

The compatibility reference changes the Tailwind status of the Grid family from Planned to Limited and documents the exact literal, responsive, compiler, context, and ownership boundaries. The README receives one concise Grid example and continues to direct detailed cases to the compatibility reference.

The pull request includes a Changeset because it expands user-visible conversion behavior. It does not change the current CLI write model or publish a package.
