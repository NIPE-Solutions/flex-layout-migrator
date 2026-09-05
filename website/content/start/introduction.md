---
path: /docs
title: Migration guide
description: Plan, review, and apply an Angular Flex-Layout migration without hiding unresolved work.
group: start
order: 1
---

# Migration guide

## What this migration solves

Angular Flex-Layout Codemod finds recognized Flex-Layout inputs in Angular HTML templates and builds a conservative migration plan. The selected renderer can propose Tailwind CSS classes or, for its narrower supported surface, classes backed by one native CSS companion stylesheet. Responsive image conversion is a separate opt-in transformation.

The engine parses templates with the Angular compiler, normalizes recognized inputs, groups behavior that must move together, checks target support and destination ownership, renders proposed edits, and reparses changed templates before any application. It does not execute application code, infer custom breakpoint providers, or treat visually similar CSS as proof of semantic equivalence.

## Read the outcome vocabulary

- Converted means the current target produced a validated equivalent and may remove that source attribute.
- Review means runtime data, project configuration, precedence, or surrounding context prevents a complete static proof.
- Unsupported means the target does not implement that recognized behavior.
- Invalid means a directive value does not satisfy the supported source grammar or semantic constraints.
- Parse error means the Angular compiler rejected the source or generated template, so application is not allowed.

Unresolved inputs remain in source with a diagnostic. A file may contain both converted and preserved inputs; edits outside validated source ranges remain unchanged.

## Use the plan as evidence

Plan first. Review unresolved cases. Write only when you are ready. A plan is review material, not a promise that every source directive can be automated or that application tests are unnecessary.

The documentation separates current tool behavior from recommended migration practice. Tool behavior is backed by production code and executable tests. Recommendations such as a clean Git checkpoint, small batches, visual review, and dependency removal are team-controlled safeguards around the tool.

Use the browser playground for one in-memory template. Use the installed CLI when work depends on file discovery, reports, multi-file coordination, native CSS ownership, or project writes.
