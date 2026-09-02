---
'@nipe-solutions/flex-layout-codemod': minor
---

Convert provable literal responsive `ngClass` and `ngStyle` families for all standard Angular Flex-Layout viewport aliases. Preserve project-specific, raw-source-unsafe, target-changing, compiler-empty, or ownership-ambiguous class candidates; preserve unsafe, priority-bearing, or exact-key-aliasing style families and unsuffixed fallback replacement; retain existing class bytes and emit only tokens with compiler-complete ownership that Tailwind's raw template scanner discovers. Existing Tailwind classes now use compiler-backed text, directional-border, and shadow ownership, while recognized unmodeled built-ins conservatively block conflicting conversion.
