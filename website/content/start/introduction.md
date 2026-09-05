---
path: /docs
title: Migration guide
description: Plan, review, and apply an Angular Flex-Layout migration without hiding unresolved work.
group: start
order: 1
---

# Migration guide

## What the codemod changes

Angular Flex-Layout directives encode layout decisions inside templates. This project converts the supported, statically provable parts of those decisions into Tailwind CSS utilities or owned native CSS. Unrelated template source stays in place so a migration review can focus on the intended edits.

The migration boundary is conservative. A directive remains in the template when runtime values, an existing class or style, parsing damage, or target support prevents an equivalent rewrite from being proven.

## The working principle

Plan first. Review unresolved cases. Write only when you are ready. Treat the plan and diagnostics as review material, not as a promise that every source directive can be automated.

Use the browser playground for a single in-memory template. Use the installed CLI when the work depends on file discovery, reports, multi-file coordination, or project writes.
