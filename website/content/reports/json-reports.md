---
path: /docs/reports
title: JSON reports
description: Preserve a machine-readable account of planning, results, application state, and recovery information.
group: reports
order: 2
---

# JSON reports

## A review artifact

A requested JSON report records the requested mode, selected target, portable input and output paths, duration, derived summary, path-sorted file results, optional stylesheet proposal, and actual application state defined by schema version 2. Keep it with CI artifacts or migration review notes when durable evidence matters.

Report creation is an explicit filesystem effect even during a plan-only run. The writer uses an atomic temporary-file replacement and can create the report parent directory. Choose a unique location that does not overwrite evidence from another scope or package version.

## Consume the schema deliberately

Automation should first require `schemaVersion` 2. Read `mode` as the requested execution path and `application.status` plus its optional reason as the outcome. Never infer application from `filesChanged`, `changed`, or `stylesheet.change`; those fields describe the validated proposal even when application was skipped.

Use `summary` for aggregate policy and `files[].results` for review. Non-parse unresolved results include the directive, exact source name, offset, diagnostic code, reason, and suggestion. Parse results include their offset, parse diagnostic code, and reason. Paths are portable and input-relative rather than absolute checkout paths.

The optional `stylesheet` object exists for the native CSS target and records its portable path plus proposed `created`, `updated`, `removed`, or `unchanged` action. The typed report registry is authoritative for every current field, type, requirement, and example; do not reconstruct the contract from terminal prose.

## Validated plan report

The example below is loaded directly from the registry that the documentation verifier checks against the production report builder.

:::report-example plan

## Application and failure boundaries

Plan mode reports `application.status` as skipped for `plan-only`, including plans containing parse errors. Write mode with any parse error reports skipped for `parse-errors`. A successful valid write reports applied, including an unchanged plan with no bytes to commit.

Configuration, discovery, transaction, and report-writing exceptions return exit code 1 rather than a successful report object. A project transaction failure leaves an existing report path untouched. Conversely, report writing happens after application and outside the project transaction, so a report-write failure does not reverse already applied project files.
