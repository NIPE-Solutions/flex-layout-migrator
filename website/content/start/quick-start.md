---
path: /docs/quick-start
title: Quick start
description: Produce a read-only migration plan, inspect the result, and make writing an explicit decision.
group: start
order: 3
---

# Quick start

## Plan a representative scope

Point the installed command at a deliberately small file or directory. The default run discovers, analyzes, renders, validates, and preflights a plan without applying project template or stylesheet writes.

```sh
npx flex-layout-codemod ./src/app/example --report ./artifacts/flex-layout-plan.json
```

The report is an explicit filesystem side effect in plan mode. It may create its parent directory even though proposed project output remains unapplied.

## Review and resolve

Inspect proposed output, every preserved source attribute, diagnostics, per-file results, and `application.status`. Confirm the target matches the project's styling direction and that existing tests cover affected base, responsive, orientation, and print states.

Resolve invalid templates, dynamic bindings, breakpoint uncertainty, and destination conflicts in source. Re-plan until the remaining unresolved set is understood and deliberately owned.

## Write explicitly

Add the write option only after reviewing the plan. Keep the report path unique if the plan artifact must be retained.

```sh
npx flex-layout-codemod ./src/app/example --report ./artifacts/flex-layout-write.json --write
```

After application, inspect the actual diff, rerun the same scope in plan mode, run the Angular build and application tests, review responsive layouts, and search the completed scope for remaining Flex-Layout inputs. Exit code 0 describes codemod policy; it does not certify application behavior.
