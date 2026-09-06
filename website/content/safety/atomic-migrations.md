---
path: /docs/atomic-migrations
title: Atomic migration families
description: Keep related responsive and structural behavior together when partial conversion would be unsafe.
group: safety
order: 2
---

# Atomic migration families

## Related directives form one decision

Some source behavior is meaningful only as a family: base and responsive states for one semantic property, layout and dependent gap or alignment, flex basis with grow and shrink, visibility with display restoration, extended class and style ranges, or a responsive image with same-element conversions. Converting a subset can create valid syntax with incorrect behavior.

The planner therefore evaluates related candidates together where production contracts require it. A conflict, dynamic value, unsafe responsive overlap, or unsupported context in one member can preserve the complete affected family so the original relationship remains reviewable.

Atomic does not mean every directive in a file shares one outcome. Independent families may convert while an unsafe family remains. The boundary follows semantic dependencies and target artifacts rather than lines, elements, or file count.

## Review the whole family

When a family is preserved, inspect its base value, every responsive alias, inherited layout or display context, and existing destination classes or styles. Resolve the conflict at the semantic level rather than applying one generated fragment by hand.

For native CSS, template class edits and the codemod-owned stylesheet block also form one application plan. For responsive images, a structural wrapper and same-element edits must be reviewed as one proposed result.

After a manual change, rerun the same scope. A clean subsequent plan is stronger evidence than deleting a diagnostic, copying only the convenient edit, or comparing one line without its responsive siblings.
