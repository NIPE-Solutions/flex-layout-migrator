---
path: /docs/tailwind
title: Tailwind CSS
description: Understand the default utility output, responsive variants, and conservative conflict boundary.
group: targets
order: 1
---

# Tailwind CSS

## Utility output

The Tailwind target expresses proven layout semantics as Tailwind CSS v4 utilities. Exact source lengths may require arbitrary values, while responsive source aliases are translated only when their media behavior is known.

The codemod does not treat an existing class attribute as an empty destination. It analyzes relevant utilities and preserves a directive when combining generated and existing classes could change ownership or precedence.

## Project boundaries

This target changes eligible template source; it does not silently rewrite project Tailwind configuration. Options that assert orientation, print, or image behavior remain explicit because those decisions depend on source-project knowledge.

Review the complete class diff and application rendering. Generated utility syntax proves the codemod's translation, not that every surrounding selector or component assumption is safe.
