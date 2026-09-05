---
path: /docs/atomic-migrations
title: Atomic migration families
description: Keep related responsive and structural behavior together when partial conversion would be unsafe.
group: safety
order: 2
---

# Atomic migration families

## Related directives form one decision

Some source behavior is meaningful only as a family: base and responsive states, visibility and restoration, or template classes and generated stylesheet rules. Converting a subset can create valid syntax with incorrect behavior.

The planner therefore evaluates related candidates together where production contracts require it. A conflict in one member can preserve the family so the original relationship remains reviewable.

## Review the whole family

When a family is preserved, inspect all related aliases and the existing destination classes or styles. Resolve the conflict at the semantic level rather than applying a generated fragment by hand.

After a manual change, rerun the same scope. A clean subsequent plan is stronger evidence than deleting a diagnostic or comparing only one edited line.
