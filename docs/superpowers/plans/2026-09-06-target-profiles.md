# Target profiles implementation plan

The user's target-awareness mission is the specification. Work is based on origin/main beta.3 in an isolated worktree.

Architecture: Resolve a frozen Tailwind v4 profile before creating the render session. Keep source breakpoint semantics in the shared catalog, target representation in the renderer, and static filesystem import resolution outside browser modules. Preserve the existing analyze → plan → validate → transaction architecture.

- [x] Add browser-safe profile model, narrow static CSS analysis, deterministic precedence, provenance, diagnostics and fingerprint. Test prefix, resets, removals, malformed inputs and unresolved configuration.
- [x] Add declarative JSON configuration and bounded local import resolution. Lock configuration inputs into invocation and reject drift before write. Test remote imports, symlinks, traversal, cycles and overrides.
- [x] Thread profile through renderer and evidence. Prefix all emitted candidates after semantic composition, normalize existing target tokens for conflicts, retain exact media ranges. Compile actual output with pinned Tailwind 4.3.3.
- [x] Extend source catalog with explicit bounded media definitions and priorities. Keep unknown aliases unresolved. Test responsive families under multiple targets.
- [x] Share generated-template validation with browser preview; reject malformed proposals and expose result state.
- [x] Add CLI options and profile report data, preserving default plan mode and existing unresolved policy.
- [x] Add playground controls, configuration documentation, assumptions, real not-found page and static hosting artifact.
- [x] Add legacy syntax corpus; verify Node 22.12 and 24, then update engines and CI only if tests support it.
- [x] Run core/native CSS/compiler, website, docs, package and adversarial checks. Record limitations and release classification.

Deliberate boundaries: no executable config, plugin loading, remote fetches, v3 upgrades, class scanner, or runtime Tailwind compiler. No automatic entrypoint selection. Named variants are only eligible if exact media semantics including medium match; preserving screen-specific ranges can require arbitrary variants even at matching widths.
