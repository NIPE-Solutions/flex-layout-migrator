# Version 2 product roadmap

## Purpose

Version 2 turns the project into a safety-first migration product for teams removing the archived Angular Flex-Layout dependency. The codemod must prefer preserved source and an actionable diagnostic over a transformation whose runtime behavior cannot be proven equivalent.

The roadmap covers product documentation, migration completeness, native CSS output, responsive images, terminal experience, and final architectural cleanup. Each milestone is delivered through a focused pull request with tests and a Changeset when user-visible behavior changes.

## Product principles

- Plan before writing. The default command analyzes without modifying project files; `--write` explicitly applies the validated plan.
- Preserve semantics. Automatic conversion is limited to behavior that the selected target can represent exactly.
- Preserve source. Unrelated template bytes, comments, Angular syntax, and formatting remain untouched.
- Remain deterministic. File order, diagnostics, generated classes, stylesheets, reports, and non-interactive output are stable.
- Separate presentation from behavior. Terminal rendering never changes migration decisions or automation results.
- Explain conservative boundaries. Unsupported inputs remain unchanged with structured reasons and source locations.
- Optimize for reproducible team use. `npx` is the evaluation path; a pinned development dependency is the recommended project and CI setup.

Assisted or speculative conversion is deferred until the exact migration targets are mature. The codemod does not insert guesses or TODO comments during the version 2 work described here.

## Architecture

The migration pipeline is divided into target-neutral analysis and target-specific rendering:

```text
Angular templates
      |
Directive analysis
      |
Target-neutral semantic plans
      |
+----------------+----------------+---------------------+
| Tailwind CSS 4 | Native CSS     | Responsive images   |
| renderer       | renderer       | renderer             |
+----------------+----------------+---------------------+
      |
Validated atomic edits
      |
Terminal presentation and JSON reporting
```

The semantic core represents layout direction, alignment, flex sizing, gaps, grid tracks, visibility, breakpoint conditions, and ownership conflicts. It does not contain Tailwind class strings, generated CSS selectors, or terminal formatting.

Renderers consume semantic plans through narrow interfaces:

- The Tailwind renderer emits only Tailwind CSS 4 candidates whose output and property ownership are compiler-verified.
- The native CSS renderer emits collision-safe classes and deterministic rules into an explicitly selected companion stylesheet.
- The responsive-image renderer performs separately enabled, validated `<picture>` transformations.
- A renderer rejects a plan when its target cannot preserve the source behavior exactly.

Breakpoint definitions, activation precedence, diagnostics, source editing, and transaction handling are shared services. The CLI orchestrates these services but owns no conversion rules. Strategy, adapter, observer, and presenter patterns are used only where multiple real implementations justify the boundary.

## Migration scope

### Tailwind CSS 4

Tailwind completeness covers all statically provable flexbox directives, the `gd*` Grid API, standard viewport aliases, orientation aliases, print behavior, and safe responsive class and style families. Existing Tailwind utilities continue to participate in compiler-backed CSS ownership checks.

Dynamic expressions, custom breakpoints, project plugins, and ambiguous overlapping authorities remain unchanged unless their complete semantics can be proven from available project input. Completeness is measured against an executable directive-and-variant inventory, not an unsupported claim about application behavior.

### Responsive images

Responsive `imgSrc` behavior is a separate native HTML migration rather than a Tailwind or CSS utility conversion. Initial automatic support is opt-in and limited to literal standard-breakpoint values that can be represented by ordered `<picture>` and `<source media>` elements without changing effective selection precedence.

The renderer preserves image accessibility, loading, dimensions, fallback `src`, bindings unrelated to responsive source selection, and unrelated source bytes. It refuses dynamic responsive expressions, unsafe structural contexts, selector-sensitive wrapping, or ambiguous breakpoint overlap. Generated templates must reparse with the Angular compiler and be idempotent.

### Native CSS

The CSS target writes deterministic utility-style classes to one explicit companion stylesheet:

```bash
flex-layout-codemod ./src --target css \
  --stylesheet ./src/flex-layout-migration.css
```

Templates and the stylesheet form one logical transaction. Codemod-owned rules carry a machine-readable ownership header and stable identifiers. Reruns update only owned rules; handwritten CSS is never reformatted or overwritten. Media queries and declarations are deduplicated and emitted in stable semantic order.

## Execution model

Every invocation has a plan phase and, only with `--write`, an apply phase.

The plan phase discovers templates deterministically, parses all inputs, builds semantic plans, renders proposed target output in memory, validates edit ranges and output collisions, reparses changed templates, and produces the complete summary. No project output is written during this phase.

The apply phase stages changed templates and generated stylesheets in temporary sibling files, validates the staged content, and commits files in deterministic order. Invocation-owned backups restore already-replaced files if a later commit fails. Reports are written atomically after the migration outcome is known. An interrupted run removes invocation-owned temporary files and never leaves a partial template-and-stylesheet pair.

Errors and unresolved results use stable categories: configuration, parse, semantic conflict, target limitation, I/O, and internal invariant. These categories map consistently to terminal output, JSON reports, and documented exit codes.

## CLI experience

Interactive terminals receive a concise live status region with real phase and count information. Completed phases collapse into a stable summary. The interface does not print decorative banners, streams of filenames, fake percentages, or marketing prose.

The default command produces a plan and next action without writing files. `--write` applies it. Redirected output and CI automatically use deterministic plain text. `--no-color`, `--quiet`, and `--verbose` remain orthogonal. `--json` reserves standard output for machine-readable results and sends human diagnostics to standard error.

The engine emits typed progress and result events. Interactive, plain-text, and JSON presenters consume those events independently. Color and animation are optional enhancements; all information remains accessible without them. Ctrl-C follows the transaction cleanup boundary.

## Documentation

The README is a concise adoption guide:

1. problem and intended users;
2. prerelease status and compatibility;
3. `npx` quick start using plan-only behavior;
4. pinned development installation for teams and CI;
5. review and explicit apply workflow;
6. representative before-and-after examples;
7. compatibility summary;
8. reporting, exit codes, troubleshooting, and rollback;
9. contributing, support, security, and release links.

`docs/compatibility.md` is the detailed source of truth for directives, breakpoint variants, targets, converted cases, conservative boundaries, and supported toolchain versions. Executable contracts compare the compatibility claims with the directive catalog wherever practical.

Global installation is not recommended because it makes developer and CI versions drift. Beta users are directed to the explicit `beta` tag and teams are advised to pin the exact prerelease version before applying project changes.

## Verification strategy

Behavior changes follow test-driven development. Verification emphasizes semantic evidence in addition to coverage:

- Angular compiler fixtures for real syntax and byte preservation;
- characterization tests against archived Angular Flex-Layout behavior;
- Tailwind CSS 4 compiler differentials for candidate output and property ownership;
- browser computed-style tests across viewport transitions;
- semantic parity tests across Tailwind and native CSS renderers;
- responsive-image selection, fallback, SSR, reparse, and idempotence tests;
- golden interactive, plain, JSON, interruption, and error-routing CLI tests;
- packaged-binary installation and execution;
- public compatibility fixtures that report converted and preserved occurrences honestly.

Repository verification, audit, package-surface checks, clean-status checks, and forbidden-control-file scans remain release gates.

## Delivery milestones

1. Rewrite the README and establish the compatibility reference.
2. Add an executable directive, variant, and target coverage inventory.
3. Extract the target-neutral semantic core without changing conversion behavior.
4. Complete Tailwind flexbox conversion.
5. Add Grid, orientation, and print conversion.
6. Add opt-in responsive-image migration.
7. Add the native CSS renderer and transactional stylesheet output.
8. Add the adaptive CLI and make plan-only behavior the default.
9. Review project structure, performance, dependencies, and duplicated policy after all real target boundaries exist.
10. Run a stable-release readiness audit and address every documented compatibility gap or explicitly retained limitation.

Milestones may be split into smaller pull requests when reviewability or risk requires it. Architectural cleanup follows demonstrated duplication and ownership needs rather than speculative abstraction.

Milestone 5 is delivered through the Grid slice and the project-aware orientation/print slice. The latter remains deliberately Limited because conversion requires explicit evidence of the source application's Flex-Layout configuration.
