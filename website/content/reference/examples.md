---
path: /docs/examples
title: Verified examples
description: Compare conversion and preservation cases that are asserted against the production preview engine.
group: reference
order: 2
---

# Verified examples

## Examples are executable claims

Each published transformation example must match the current production preview boundary for its exact input and target. Expected HTML, CSS, status, and diagnostic codes belong to the verified example registry and executable fixtures rather than untested prose.

Read an example as a five-part contract: source bytes, selected target and options, result status, exact proposed output, and any diagnostic code. A converted fixture proves only that bounded case. It does not extend compatibility to dynamic values, custom breakpoints, surrounding application selectors, existing class or style ownership, or directive combinations absent from the fixture.

## Read preserved output too

A useful reference includes cases where source remains unchanged. Preservation examples show the boundary where human intent, source validity, project configuration, semantic context, or target support matters. The unchanged bytes and diagnostic are both expected output.

When adapting an example, change one variable at a time and observe status as well as output. A visually plausible result is not evidence that a preserved family should be forced through.

Use the browser playground to vary one template locally. It runs in browser memory and does not perform filesystem discovery, coordinated native CSS ownership, JSON reporting, or project writes. Use a CLI plan for those project-level behaviors, and compare its package version with the version backing the published fixture.

## Published fixture contracts

The blocks below consume the verified example registry. Input and expected output retain exact bytes, including comments, whitespace, attribute spelling, and trailing newlines. The ordered result list comes from the same registry and distinguishes converted results from review, unsupported, invalid, and parse-error results with their diagnostic codes.

The documentation test passes each registry input to the real production `previewTemplate` boundary and compares exact HTML, optional CSS, status, and code output. The display component does not contain a second transformation implementation.

:::verified-examples

## Validate in application context

After a fixture-like conversion is applied, compile the real template, run its tests, inspect base and responsive states, and review selectors that depend on element structure or generated classes. Repository verification remains necessary even when the isolated transformation is byte-for-byte verified.

These fixtures do not prove responsive-image selector safety, project Tailwind configuration, configured orientation or print behavior, native CSS filesystem ownership, transaction recovery, or compatibility for source forms absent from the fixture. Use a project CLI plan for those boundaries.
