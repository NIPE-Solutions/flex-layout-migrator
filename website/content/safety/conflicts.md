---
path: /docs/class-style-conflicts
title: Class and style conflicts
description: Protect application-owned classes and styles when generated output could overlap or reorder behavior.
group: safety
order: 3
---

# Class and style conflicts

## Existing output has an owner

Static classes, class bindings, inline styles, and style bindings may already encode the same property a directive controls. Appending another representation can alter cascade, precedence, responsive behavior, or the meaning of application state.

The analyzer checks relevant existing output before planning a conversion. It preserves the source when coexistence cannot be proven safe rather than treating the attribute as a string concatenation problem.

## Choose the source of truth

Resolve a conflict by deciding whether the directive, existing class, inline style, or component binding should own the behavior. Consolidate that decision in source, test the result, and then rerun the planner.

Avoid suppressing the warning with a cosmetic rename. The useful question is whether two mechanisms can still assign incompatible values at runtime.
