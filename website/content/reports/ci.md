---
path: /docs/ci
title: Exit codes and CI
description: Combine process status, JSON results, and repository checks into an explicit automation policy.
group: reports
order: 3
---

# Exit codes and CI

## Decide what blocks the pipeline

CI should distinguish command failure from a successful plan that found unresolved migration work. The strict default can make unresolved results visible to automation without pretending the process crashed.

Use the documented CLI and report registries for exact flags, exit behavior, and fields. Do not infer policy from terminal color or summary prose.

## Verify beyond the codemod

A green codemod invocation is not a substitute for the Angular build, application tests, visual review, or a remaining-directive search. Run those checks after an applied batch and preserve their results with the report.

Keep write mode out of unreviewed CI jobs unless the repository deliberately owns and reviews the resulting diff. Plan-only checks are better suited to detecting newly introduced migration debt.
