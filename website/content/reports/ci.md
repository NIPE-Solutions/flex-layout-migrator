---
path: /docs/ci
title: Exit codes and CI
description: Combine process status, JSON results, and repository checks into an explicit automation policy.
group: reports
order: 3
---

# Exit codes and CI

## Decide what blocks the pipeline

CI should distinguish command failure from a completed plan that found unresolved migration work. Exit code 0 means the plan or application completed with no unresolved results, or the unresolved policy override was supplied. Exit code 1 means configuration, parsing, project I/O, transaction, report writing, or an internal invariant failed.

Exit code 2 means planning or application completed safely, but review, unsupported, or invalid results remain in strict mode. Parse errors always resolve to exit code 1 and are not relaxed by the unresolved override.

A strict plan suitable for CI can retain the report as an artifact:

```sh
npx flex-layout-codemod ./src --report ./artifacts/flex-layout-report.json
```

If another reviewed system owns the unresolved set, the CLI can return success while preserving the same diagnostics and proposed output:

```sh
npx flex-layout-codemod ./src --report ./artifacts/flex-layout-report.json --allow-unresolved
```

Require schema version 2 before reading aggregate or per-file fields. Do not infer policy from terminal color or prose, and do not treat unknown report values as success.

## Verify beyond the codemod

A green codemod invocation is not a substitute for the Angular build, application tests, visual review, or a remaining-directive search. Run those checks after an applied batch and preserve their results with the report.

Keep write mode out of unreviewed CI jobs unless the repository deliberately owns and reviews the resulting diff. Plan-only checks are better suited to detecting newly introduced migration debt. Remember that a requested report still writes its own path in plan mode.

For a write job, verify `application.status` is applied before inspecting the diff. Then run repository-specific compile, unit, integration, and visual gates. Archive the exact package version and invocation with the report so a later rerun is explainable.
