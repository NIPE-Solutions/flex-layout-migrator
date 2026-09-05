---
path: /docs/native-css
title: Native CSS
description: Generate deterministic template classes and a bounded, tool-owned stylesheet for supported Flex semantics.
group: targets
order: 2
---

# Native CSS

## A deliberately narrower target

Native CSS output focuses on Flex semantic families the migration engine can express through deterministic classes and rules. Source outside that verified boundary remains unchanged with a diagnostic instead of receiving an approximate CSS rewrite.

This makes target selection a workflow decision: teams should compare the supported surface of representative templates rather than assuming the two targets are interchangeable.

## Stylesheet ownership

The CLI writes generated rules inside an owned stylesheet block and coordinates eligible template and stylesheet changes. Handwritten CSS outside that boundary is not a place for the codemod to infer intent.

Keep the companion stylesheet path stable during a batch. Review retained and newly generated rules together, especially when only part of a repository is in scope.
