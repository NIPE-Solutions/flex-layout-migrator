---
path: /docs/parsing
title: Parsing and invalid source
description: Repair invalid Angular template input before asking the migration engine to plan edits.
group: safety
order: 4
---

# Parsing and invalid source

## Parsing establishes edit boundaries

The codemod uses the Angular compiler to identify elements, attributes, bindings, and source ranges. If the source cannot be parsed reliably, edit coordinates and structural assumptions are unsafe. The engine does not fall back to regular expressions or apply the valid prefix of a malformed file.

A source failure is reported as `template-parse-error`. After rendering, every changed template is parsed again; a failed generated proposal is reported as `generated-template-parse-error` and is not an applicative artifact.

Any parse error skips application for the complete write invocation. In plan mode, `application` remains skipped for `plan-only`; in write mode, it is skipped for `parse-errors`. Parse errors return exit code 1 even when unresolved work is otherwise allowed.

## Repair, verify, and rerun

Open the reported template location and reproduce a source error with the application's normal compiler or template checks. Repair malformed tags, incomplete control flow, invalid bindings, or other source syntax before retrying.

For a generated-template error, keep the original source, reduce a non-sensitive reproduction, and report it to the project. Do not hand-apply a proposal that the validation stage rejected.

Keep parse-error reports with the review record. They distinguish invalid template syntax from an `invalid` directive value and from a valid directive that was outside the selected target's compatibility boundary.
