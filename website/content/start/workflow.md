---
path: /docs/workflow
title: Migration Workflow
description: Organize discovery, planning, review, application, and verification as distinct migration stages.
group: start
order: 4
---

# Migration Workflow

## Plan

Choose the target before interpreting results because Tailwind CSS and native CSS have different verified boundaries. Select a representative file or directory and run without the write option. The complete proposal is built in memory, changed templates are reparsed, and valid plans are transaction-preflighted in both modes.

Capture a schema-2 report when review or CI needs a durable artifact. A requested report is written after the migration result is known, including in plan mode.

## Review

Review converted and preserved items together. Check the exact source range, diagnostic, responsive siblings, parent or child layout context, existing classes and styles, and any selector coupling. Summary counts help size work; they do not prove a layout.

For native CSS, review the proposed companion stylesheet action with its templates. For responsive images, review the structural `picture` change and selector or layout assumptions separately from the selected layout target.

## Resolve

Repair parse errors first. Then resolve review and invalid results by making runtime intent literal where appropriate, removing conflicting destination ownership, confirming optional breakpoint configuration, or migrating the complete behavior manually. Unsupported results require a different supported target or manual work; an exit-policy option cannot make them converted.

Re-run the same plan after every resolution batch. A changed diagnostic set is evidence to inspect, not a reason to delete remaining source attributes blindly.

## Write

Authorize application with the write option only after the plan is understood. Write mode uses the same validated proposal, preflights the whole artifact set, and applies changed templates plus the native CSS companion artifact through the coordinated transaction boundary. Any source parse error skips application for the whole invocation.

Inspect `application` in the report rather than inferring it from `mode`, `filesChanged`, or stylesheet action. A valid unchanged write still reports applied even when no project bytes need to change.

## Verify

Inspect the actual version-control diff. Run the Angular compiler, project tests, formatting policy, and responsive visual checks. Search the migrated scope for remaining Flex-Layout inputs and reconcile each one with its diagnostic or an intentional manual decision. Then run a fresh plan against the same scope and retain the report with the review record.

## Tool behavior

- Planning is the default; the write flag is the explicit project-mutation authorization.
- A report is optional and is written atomically outside the project transaction after a completed result.
- Strict unresolved outcomes affect the process exit code but do not change conversion or preservation decisions.
- Parse errors prevent project application and take precedence over the unresolved exit policy.

## Recommended practice

- Begin from a clean worktree or commit and keep unrelated refactors out of the migration batch.
- Pilot both viable targets on representative templates before choosing a repository-wide direction.
- Use small, ownership-aligned batches with one reviewed command, report, and verification record.
- Keep manual CSS outside codemod-owned marker boundaries and retain Git as the durable recovery point.
