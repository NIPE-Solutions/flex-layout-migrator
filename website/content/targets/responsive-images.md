---
path: /docs/responsive-images
title: Responsive images
description: Opt into responsive image structure only after checking selector, accessibility, and loading assumptions.
group: targets
order: 3
---

# Responsive images

## A separate structural migration

Responsive image conversion is independent of both layout targets. `--responsive-images` opts eligible `src.<alias>` inputs into native `<picture>` output and acknowledges that the parent/child DOM shape will change. The flag enables planning; it does not bypass any source, URL, context, or validation check.

```text
npx flex-layout-codemod ./src --responsive-images
```

The codemod does not inspect CSS, Sass, Less, application JavaScript, or test selectors to decide whether wrapping is harmless. Review selectors such as `parent > img`, `img:first-child`, and code that assumes the image's former parent.

## Eligible source

An eligible family belongs to an HTML `<img>`, uses literal values from the 13 standard viewport aliases, and provides one safe descriptor-free URL per responsive source. The fallback may be a literal `src`, a bound `[src]`, or absent. The image must not already be inside `<picture>`, carry an Angular structural-directive attribute, or have ambiguous replacement ranges.

Every nonresponsive attribute stays on the fallback `<img>`, including source fallback, accessibility metadata, dimensions, loading and decoding controls, events, references, classes, styles, and unrelated bindings. Generated `<source>` elements use exact media conditions and descending archived breakpoint priority so the first matching native source reproduces the proven selection order.

## Preserved image families

One unsafe member preserves the complete responsive-image family. Property bindings, interpolation, empty values, orientation, print, custom or empty aliases, duplicate ownership, unsafe `srcset` syntax, non-image hosts, existing `<picture>` ancestry, structural attributes, and overlapping edit ownership remain unchanged with diagnostics.

Orientation and print flags do not extend responsive-image support. The image path accepts only standard viewport aliases. It also does not implement density descriptors or art-direction metadata.

## Validation and application review

The full generated template must reparse with the Angular compiler before a file can be written. Each converted or preserved `imgSrc` occurrence remains visible in the schema-2 report by file and source offset.

After conversion, compile and test the component, inspect its accessible output, verify loading and fallback behavior, and exercise overlapping viewport ranges. Do not remove Angular Flex-Layout until remaining image directives and selector assumptions are resolved across the repository.
