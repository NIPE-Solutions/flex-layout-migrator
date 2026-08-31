# Changelog

## 2.0.0-beta.0 — Unreleased

- Replaced generic HTML parsing with the Angular compiler template AST.
- Added validated source-range edits and durable atomic file writes.
- Added structured conversion and parse diagnostics with safe preservation of unresolved inputs.
- Replaced mutable Cheerio converters with pure Tailwind conversion planners.
- Added `--dry-run`, atomic schema-version `1` JSON reports through `--report <path>`, and portable input-relative report paths.
- Added strict automation exit codes: `0` for accepted completion, `1` for execution failure, and `2` for safely completed migrations with unresolved results; `--allow-unresolved` accepts unresolved work without hiding diagnostics.
- Breaking: replaced observer-derived statistics and phase-oriented spinner output with a concise deterministic migration summary and unresolved-result diagnostics.
- Removed Cheerio, `p-queue`, `classnames`, whole-template serialization, and the prerelease mutable TypeScript API.
