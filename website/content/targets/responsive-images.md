---
path: /docs/responsive-images
title: Responsive images
description: Opt into responsive image structure only after checking selector, accessibility, and loading assumptions.
group: targets
order: 3
---

# Responsive images

## Why image migration is separate

Responsive image source directives can require a structural template change rather than a class-only edit. Added picture and source elements may affect selectors, tests, accessibility names, loading behavior, or code that depends on the previous DOM shape.

For that reason, image conversion is an explicit project decision. A normal layout migration does not need to accept DOM changes simply because an image directive was discovered.

## Review the surrounding component

Check the generated source sets and media conditions against the application's asset behavior. Then review CSS selectors, component tests, accessibility output, and visual loading at representative viewport widths.

Preserved image directives remain actionable migration work. Do not remove the source dependency until the repository-wide check confirms that intended usages are resolved.
