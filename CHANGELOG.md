# Changelog

## 2.0.0-beta.1

### Minor Changes

- ff86a1f: Target Tailwind CSS v4 with exact static Flex-Layout semantics, add coupled `fxGrow` and `fxShrink` conversion, support `fxFlexAlign` and `fxFill`, and preserve gap or context-sensitive cases that cannot be converted safely.
- 975ad07: Convert literal standard Angular Flex-Layout viewport aliases to exact Tailwind CSS v4 arbitrary media variants, while preserving dynamic, optional, custom, and unsafe overlapping responsive declarations for review.
- 09ba010: Convert provable literal responsive `ngClass` and `ngStyle` families for all standard Angular Flex-Layout viewport aliases. Preserve project-specific, raw-source-unsafe, target-changing, compiler-empty, or ownership-ambiguous class candidates; preserve unsafe, priority-bearing, or exact-key-aliasing style families and unsuffixed fallback replacement; retain existing class bytes and emit only tokens with compiler-complete ownership that Tailwind's raw template scanner discovers. Existing Tailwind classes now use compiler-backed text, directional-border, and shadow ownership, while recognized unmodeled built-ins conservatively block conflicting conversion.
- 33f35aa: Convert Angular-decoded literal `fxShow` and `fxHide` families at base and standard viewport breakpoints when their complete display behavior is provable, and preserve dynamic, conflicting, restoration-unsafe, partially overlapping layout, or responsive class/style-authority cases with structured diagnostics.
- 31038c8: Add dry-run migrations, versioned JSON reporting, concise deterministic output, and stable automation exit codes.

## 2.0.0-beta.0 — Unreleased

- Replaced generic HTML parsing with the Angular compiler template AST.
- Added validated source-range edits and durable atomic file writes.
- Added structured conversion and parse diagnostics with safe preservation of unresolved inputs.
- Replaced mutable Cheerio converters with pure Tailwind conversion planners.
- Added `--dry-run`, atomic schema-version `1` JSON reports through `--report <path>`, and portable input-relative report paths.
- Added strict automation exit codes: `0` for accepted completion, `1` for execution failure, and `2` for safely completed migrations with unresolved results; `--allow-unresolved` accepts unresolved work without hiding diagnostics.
- Breaking: replaced observer-derived statistics and phase-oriented spinner output with a concise deterministic migration summary and unresolved-result diagnostics.
- Removed Cheerio, `p-queue`, `classnames`, whole-template serialization, and the prerelease mutable TypeScript API.
