---
path: /docs/troubleshooting
title: Troubleshooting
description: Diagnose parse failures, preserved directives, unresolved status, and unexpected responsive output.
group: reference
order: 3
---

# Troubleshooting

## Start with the first boundary

For invalid source, repair the template and confirm the Angular parser or compiler succeeds before rerunning. For preserved source, read the first relevant diagnostic and inspect related responsive aliases, destination classes, styles, and target support together.

If the process status reports unresolved work, distinguish that review policy from command failure. The report provides the durable per-file outcomes needed for CI or batch review.

## Reproduce a small case

Reduce unexpected output to one representative template while keeping the directive combination and existing classes or styles that affect the result. Compare the browser preview with a CLI plan, remembering that only the CLI performs project discovery and coordinated writes.

### FAQ, glossary, and known limitations

Plan means analyzed output not yet applied. Preserved means original source remains. Unsupported means the chosen target has no verified automatic conversion for that case. Invalid means the input could not be safely interpreted. Known limitations are boundaries to review, not permission to invent output.

When filing an issue, include the installed version, exact command, target, minimal non-sensitive source, actual and expected output, and relevant diagnostics or report excerpt.
