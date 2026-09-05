---
path: /docs/workflow
title: Migration workflow
description: Organize discovery, planning, review, application, and verification as distinct migration stages.
group: start
order: 4
---

# Migration workflow

## Separate the decisions

Choose the output target before interpreting the plan because Tailwind CSS and native CSS have different verified boundaries. Select a small representative scope, capture a report when the review needs a durable artifact, and keep source changes out of the first pass.

Review converted and preserved items together. A locally correct conversion can still expose application-specific concerns such as selector coupling, visual assumptions, or a class that another tool owns.

## Verify the applied result

After an explicit write, inspect the source diff rather than relying on summary counts. Run compilation and tests, check responsive states in the application, and search the completed scope for remaining Flex-Layout directives.

Commit coherent migration batches. Small batches make a failed assumption easier to isolate and give reviewers a clear boundary for generated changes and manual follow-up.
