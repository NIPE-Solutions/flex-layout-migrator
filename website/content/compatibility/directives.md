---
path: /docs/compatibility/directives
title: Directive behavior
description: Review layout, visibility, grid, class, style, breakpoint, orientation, and print families by semantics.
group: compatibility
order: 2
---

# Directive behavior

## Layout and responsive semantics

Flex-Layout directives combine base behavior with responsive aliases. The engine reasons about the directive family, parsed value, target capabilities, existing output, and overlapping media conditions before creating an edit.

Visibility and display restoration require particular care because hiding at one range is only half of the intended behavior. Grid and responsive class or style families also have target-specific boundaries rather than universal conversion rules.

## Breakpoints, orientation, and print

Known viewport aliases carry specific media ranges. Orientation and print behavior can depend on application configuration that is not discoverable from one template, so the CLI requires explicit confirmation where supported.

When a family or value is outside the selected target's proof boundary, preservation is the expected safe result. Use the attached diagnostic to decide whether configuration, source cleanup, target selection, or manual migration is appropriate.
