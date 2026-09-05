---
path: /docs/parsing
title: Parsing and invalid source
description: Repair invalid Angular template input before asking the migration engine to plan edits.
group: safety
order: 4
---

# Parsing and invalid source

## Parsing establishes edit boundaries

The codemod uses Angular template parsing to identify attributes and source ranges. If the input cannot be parsed reliably, any edit coordinates or structural assumptions derived from it would be unsafe.

A parse failure therefore stops application for the affected work instead of falling back to regular expressions or partial source rewriting.

## Repair, verify, and rerun

Open the reported template location and reproduce the error with the application's normal compiler or template checks. Repair malformed tags, incomplete control flow, invalid bindings, or generated output before retrying the migration.

Keep parse-error reports with the review record. They distinguish invalid input from a valid directive that was merely outside the chosen target's compatibility boundary.
