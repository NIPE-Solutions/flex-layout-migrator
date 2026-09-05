---
path: /docs/quick-start
title: Quick start
description: Produce a read-only migration plan, inspect the result, and make writing an explicit decision.
group: start
order: 3
---

# Quick start

## Create the first plan

Point the installed command at a deliberately small file or directory. The default run is a planning pass: it discovers eligible templates, analyzes their directives, and reports proposed or preserved results without applying template changes.

```sh
npx flex-layout-codemod ./src
```

## Review before writing

Inspect generated output, preserved source, and every diagnostic. Confirm the target matches the project's styling direction and that existing tests cover the layouts being changed.

Only add the documented write option after the plan is understood. Re-run the same scope after writing and then use the project's build, tests, visual checks, and remaining-directive search as independent verification.
