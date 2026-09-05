---
path: /docs/transactions
title: Transactions and recovery
description: Know what coordinated project writes can recover and where durable filesystem guarantees end.
group: safety
order: 5
---

# Transactions and recovery

## Coordinated writes

Write mode stages and applies the eligible project changes through the production transaction boundary. For native CSS work, templates and the owned stylesheet belong to the same reviewed operation rather than independent best-effort saves.

Handled failures can trigger rollback of paths changed by that operation. The report's application state is the place to inspect whether changes were applied, skipped, rolled back, or require recovery attention.

## Durable limits

No user-space filesystem transaction can promise recovery after every power loss, forced termination, storage failure, external concurrent edit, or damaged backup. A clean version-control checkpoint remains the durable recovery mechanism.

If recovery is not confirmed, stop rerunning commands. Reconcile each listed path with Git or a verified backup, restore one coherent state, and only then create a new plan.
