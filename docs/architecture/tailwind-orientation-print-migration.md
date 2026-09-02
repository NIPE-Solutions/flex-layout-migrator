# Tailwind orientation and print migration

## Purpose

This milestone adds project-aware Tailwind CSS 4 conversion for Angular Flex-Layout orientation and print aliases. These aliases are configuration-dependent: orientation breakpoints are disabled by default, and print can activate a configured set of ordinary breakpoints through Flex-Layout's runtime print hook. The migrator therefore requires explicit configuration evidence and preserves source when that evidence is absent or inconsistent.

The implementation reproduces the archived Angular Flex-Layout breakpoint registry and print-hook precedence rather than treating suffixes as Tailwind breakpoint names. Standard viewport behavior remains as defined by the existing responsive architecture, and Grid directives participate through the same responsive-family planner.

Custom breakpoints, replaced default breakpoint definitions, dynamic expressions, native CSS output, and assisted conversion remain outside this milestone.

## Configuration contract

The CLI adds two independent, opt-in flags:

- `--orientation-breakpoints` confirms that the source application enables the archived `addOrientationBps: true` definitions.
- `--print-with-breakpoints <aliases>` supplies the source application's archived `printWithBreakpoints` value as a comma-separated alias list. The literal `none` explicitly confirms an empty list.

Omitting a flag is not interpreted as the upstream default. It means the migrator has no project-level evidence for that feature, so affected aliases remain unchanged with `breakpoint-unverified`. This avoids silently changing projects that override Flex-Layout configuration.

The print list accepts only aliases whose exact definitions are known in the same invocation: the 13 standard aliases and, when `--orientation-breakpoints` is present, the nine archived orientation aliases. Empty entries, duplicates, `print`, unknown aliases, and orientation aliases without orientation opt-in are configuration errors reported before template discovery. CLI help and reports render a normalized list without changing the user's source configuration.

Configuration is immutable migration context passed from the CLI to adapter construction. Target-neutral parsing does not read process arguments, and adapters not using this configuration keep their current behavior.

## Upstream semantics

### Orientation breakpoints

When enabled, the archived registry adds these exact aliases:

| Alias               | Exact screen condition                     | Priority |
| ------------------- | ------------------------------------------ | -------: |
| `handset.portrait`  | portrait and at most `599.98px`            |     2000 |
| `handset.landscape` | landscape and at most `959.98px`           |     2000 |
| `handset`           | either handset condition above             |     2000 |
| `tablet.portrait`   | portrait from `600px` through `839.98px`   |     2100 |
| `tablet.landscape`  | landscape from `960px` through `1279.98px` |     2100 |
| `tablet`            | either tablet condition above              |     2100 |
| `web.portrait`      | portrait from `840px` upward               |     2200 |
| `web.landscape`     | landscape from `1280px` upward             |     2200 |
| `web`               | either web condition above                 |     2200 |

Composite aliases are disjunctions, not wider numeric ranges. The catalog retains both clauses so intersection and emission never erase the orientation constraint or fill the gap between branches.

### Print behavior

The archived `print` alias uses the exact media query `print` at priority 1000. During printing, the print hook also substitutes every alias named by `printWithBreakpoints` into the active breakpoint stream. Their normal screen media queries do not apply; their configured responsive values become print-time fallbacks. An explicit `.print` value takes precedence over those fallbacks.

For each directive family, the effective print value is selected from its literal base, responsive values named in the configured print list, and explicit `.print` value using archived priority and fallback behavior. Conversion proceeds only when that effective value and every semantic dependency can be proven. A configured alias does not need its screen condition to match during printing.

## Breakpoint domain model

`BreakpointDefinition` expands from one numeric range to an immutable media definition containing a media type and one or more clauses. A screen clause may contain minimum width, maximum width, and orientation. Print is represented as its own media type with no screen bounds.

Standard aliases contain one screen clause. Specific orientation aliases contain one oriented screen clause, composite orientation aliases contain two, and print contains one print clause. Range intersection becomes media intersection: media types must be compatible, widths must overlap, and orientation constraints must agree. Two definitions intersect when any clause pair intersects.

Definitions retain upstream priority for planning only. Emitted class order is never assumed to reproduce Flex-Layout priority when simultaneously active aliases disagree.

## Planning and atomicity

The existing element and responsive-family planners remain the single conversion pipeline. Orientation, print, class/style ownership, layout dependencies, and Grid display ownership are resolved before edits are created.

For screen behavior:

1. Enabled orientation aliases are planned like verified standard aliases.
2. Each media clause is an activation branch of the same responsive member.
3. Disjoint values may convert independently and identical overlapping values may share ownership.
4. Differing values in intersecting standard or orientation definitions preserve the complete semantic family with `responsive-precedence-unverified`.

For print behavior:

1. The planner computes one effective print semantic plan per family from the explicitly configured alias list.
2. An explicit `.print` member overrides configured responsive fallbacks.
3. A configured responsive fallback can generate a print-only class even when that member also generates a screen class.
4. If a selected print value depends on an unresolved base value, bound input, preserved sibling, parent context, or conflicting class/style authority, the coupled family remains unchanged.
5. Removing a directive is allowed only when its screen and print behavior are both represented by the complete plan.

This family closure prevents partial conversion from dropping the runtime print-hook behavior. Directives with no print participation retain their existing independent-conversion rules.

## Tailwind rendering

The responsive emitter produces one deterministic arbitrary media variant per media clause. Composite orientation aliases therefore emit two classes rather than relying on comma-separated arbitrary-variant parsing. For example, a handset value is rendered once for its portrait branch and once for its landscape branch.

Print output uses a self-contained arbitrary `@media print` variant. Print-time fallbacks and explicit print values converge on the single effective semantic plan, so the renderer never emits competing print candidates for one owned property.

Every generated candidate is checked with the pinned Tailwind CSS 4 compiler. Verification compares the emitted media condition, selector, and exact declaration set. Compiler-empty candidates, altered orientation conditions, theme-dependent output, incomplete property ownership, and selector-changing variants are rejected.

Candidate order is canonical by semantic family, activation definition, clause order, and utility. Re-running the migrator produces no edits.

## Diagnostics

The structured diagnostic contract remains stable:

- `breakpoint-unverified` covers orientation or print inputs without the required explicit configuration and identifies the corresponding CLI flag;
- `responsive-precedence-unverified` covers differing values in intersecting screen definitions;
- `dynamic-binding`, `class-conflict`, `invalid-value`, and `context-unverified` retain their existing meanings;
- invalid CLI breakpoint configuration is a usage error, exits before migration, and does not produce partial edits.

Diagnostics name the preserved semantic family and distinguish screen overlap from unresolved print fallback behavior. They never suggest that enabling a flag is safe unless the user has verified the source application's Flex-Layout configuration.

## Verification

Implementation follows test-driven development and includes:

- catalog tests for all nine orientation aliases, exact clauses, priorities, classifications, and intersections;
- CLI parsing and validation tests for omitted flags, `none`, normalized lists, invalid aliases, duplicates, and orientation dependencies;
- responsive emitter compiler differentials for portrait, landscape, composite, and print variants;
- family-planner tests for standard/orientation overlap, identical overlap, composite branches, configured print fallbacks, explicit print precedence, and atomic preservation;
- coverage for every responsive-capable directive family, including Grid container and child directives;
- existing static class, responsive `ngClass`, and `ngStyle` ownership tests across screen and print activation;
- browser computed-style comparisons at representative width/orientation pairs and through print-media emulation;
- template source preservation, deterministic output, idempotence, JSON reporting, and strict unresolved exit behavior;
- compatibility inventory and public fixture totals that distinguish configured conversion from conservative preservation;
- full repository verification, audit, packed CLI smoke, clean-status checks, and forbidden-control-file scans.

Completeness means every orientation and print alias has executable configured and unconfigured expectations. It does not imply support for arbitrary application breakpoint providers.

## Documentation and release

The compatibility reference changes orientation and print from Planned to Limited and documents the explicit configuration requirement, archived definitions, overlap policy, and print fallback boundary. The README gains concise configuration examples and continues to direct detailed cases to the compatibility reference.

The pull request includes a Changeset because it adds user-visible CLI options and conversion behavior. It does not publish a package or add a runtime dependency.
