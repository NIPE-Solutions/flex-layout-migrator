---
path: /docs/large-codebase
title: Large codebase strategy
description: Scale from a representative pilot to reviewable migration batches across a large Angular repository.
group: start
order: 5
---

# Large codebase strategy

## Pilot before expanding

Choose a slice that contains common layout patterns, responsive behavior, shared components, and at least one known difficult template. Plan that slice for each candidate target and compare the amount of preserved work with the team's styling conventions.

Record the command, package version, target, scope, diagnostics, test results, and manual review notes. This pilot becomes evidence for batch size and reviewer assignment rather than a performance promise for the whole repository.

## Migrate in owned batches

Group templates by feature ownership or deployable boundary. Keep generated stylesheet changes with the templates that require them, and avoid mixing unrelated refactors into the same review.

At completion, repeat repository-wide discovery, build and test the application, inspect key breakpoints, and track any intentionally preserved directives as explicit follow-up work.
