---
path: /docs/reports
title: JSON reports
description: Preserve a machine-readable account of planning, results, application state, and recovery information.
group: reports
order: 2
---

# JSON reports

## A review artifact

A requested JSON report records the run mode, selected target, discovered work, per-result outcomes, summary information, and application state defined by the current schema. Keep it with CI artifacts or migration review notes when durable evidence matters.

Report creation is an explicit filesystem effect even during a plan-only run. Choose an output location that does not overwrite evidence from another scope or package version.

## Consume the schema deliberately

Automation should check the schema version and documented fields before interpreting results. Treat unknown future values as a compatibility event rather than silently ignoring them.

The typed report registry and verification gate are authoritative for examples and field descriptions. Avoid copying an object shape from a terminal excerpt into automation without checking that contract.
