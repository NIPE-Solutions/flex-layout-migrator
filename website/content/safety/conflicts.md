---
path: /docs/class-style-conflicts
title: Class and style conflicts
description: Protect application-owned classes and styles when generated output could overlap or reorder behavior.
group: safety
order: 3
---

# Class and style conflicts

## Existing output has an owner

Static classes, class bindings, inline styles, and style bindings may already encode the same property a directive controls. Appending another representation can alter cascade, precedence, responsive behavior, or the meaning of application state. HTML class order alone does not prove which Tailwind declaration wins.

The Tailwind path checks proposed utilities against existing static classes and compiler-backed property ownership. A bound class value is preserved when generated classes cannot be merged safely. Responsive class and style families also preserve intersecting ranges when activation history or property ownership cannot be proven.

The native CSS path owns only its marked companion block. It does not inspect arbitrary project stylesheets, Sass, Less, or the runtime cascade, so its supported boundary is deliberately narrower and manual rules must remain outside the owned markers.

## Choose the source of truth

Resolve a conflict by deciding whether the directive, existing class, inline style, or component binding should own the behavior. Consolidate that decision in source, test the result, and then rerun the planner.

For `bound-class`, merge the intended output into the application binding or remove dynamic ownership before retrying. For `class-conflict`, remove the competing authority or migrate the complete directive family manually. For responsive class or style diagnostics, inspect every intersecting media range rather than only the active viewport.

Avoid suppressing a diagnostic with a cosmetic rename. The useful question is whether two mechanisms can still assign incompatible values at runtime. A manual resolution must preserve both responsive precedence and application state.
