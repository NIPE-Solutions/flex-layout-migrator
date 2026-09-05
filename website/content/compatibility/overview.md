---
path: /docs/compatibility
title: Compatibility overview
description: Read support as a target-specific proof boundary, not a blanket promise for every directive value.
group: compatibility
order: 1
---

# Compatibility overview

## Status describes an outcome

Compatibility is evaluated by directive family, output target, and source form. A family can have verified conversions for literal values while dynamic or conflicting forms remain preserved for review.

Converted means an equivalent output was proven for the current input. Preserved and unsupported mean the source remains visible. Invalid identifies source the engine cannot safely analyze. Informational findings describe work without turning color into the only signal.

## Check the exact target

Tailwind CSS and native CSS do not share one support matrix. Review the target-specific entry and its evidence before planning a broad migration.

Compatibility data belongs to the public registry verified against production directive definitions and tests. Use that evidence-backed boundary when a prose summary and an observed result appear to disagree.
