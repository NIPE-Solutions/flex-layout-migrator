---
path: /docs/transactions
title: Transactions and recovery
description: Know what coordinated project writes can recover and where durable filesystem guarantees end.
group: safety
order: 5
---

# Transactions and recovery

## Coordinated writes

After successful parsing, both modes preflight the complete immutable artifact plan. Preflight verifies destination state and topology before project mutation. Write mode then stages and commits eligible project changes through the production transaction boundary. For native CSS work, templates and the owned stylesheet belong to the same operation rather than independent best-effort saves.

Handled staging failures clean invocation-owned temporary artifacts. Handled commit failures attempt rollback in reverse commit order and then clean staged artifacts. Signal handling is active while the transaction owns recovery material.

At the CLI boundary, normal mode prints one concise error message on standard error. Debug mode can additionally print the error stack when one is available. Internal transaction paths and recovery-failure objects are not a documented JSON or terminal field set, so do not treat command output as a complete recovery ledger.

No successful report object is written by the CLI when project application throws. JSON report writing is a later, separate atomic-file operation; therefore a report failure can leave an already successful project application in place.

## Durable limits

Rollback is best-effort recovery for handled failures, not a durability guarantee. No user-space filesystem transaction can promise recovery after every power loss, forced termination that bypasses signal handlers, storage failure, external concurrent edit, filesystem or device boundary, or damaged backup. A clean version-control checkpoint remains the durable recovery mechanism.

## Recovery procedure

After a transaction error, stop rerunning the command. Preserve the terminal output, inspect the version-control diff and every planned destination, and compare them with Git or a verified backup. Restore templates and the companion stylesheet to one coherent state before deleting invocation-owned residue or creating a new plan.

After recovery, run a plan without the write option and review the complete result. Do not assume that an exit code, missing report, or partially changed working tree proves whether application committed.
