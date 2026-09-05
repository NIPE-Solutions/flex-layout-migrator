---
path: /docs/project
title: Project guide
description: Find architecture, contribution, support, security, release, and changelog guidance for the codemod.
group: project
order: 1
---

# Project guide

## Architecture

The project separates discovery, template analysis, migration planning, rendering, reporting, and application boundaries. The website uses the browser-safe preview entry for local single-template experiments while project filesystem behavior remains in the installed CLI.

Generated documentation facts come from immutable public registries and verification scripts. Authored Markdown explains workflows without becoming a second source for option, diagnostic, compatibility, report, or example inventories.

## Contributing and support

Use the repository issue tracker for reproducible defects and focused enhancement proposals. Include non-sensitive minimal source, the package version, command, target, diagnostics, and the difference between actual and expected behavior.

## Security

Do not publish vulnerability details or proprietary templates in a public issue. Use GitHub's private vulnerability reporting path for security-sensitive findings and minimize any shared reproduction.

## Releases and changelog

Release work verifies source, package, documentation, static output, and smoke behavior before publication. Prerelease tags remain deliberate, and release evidence records the exact package version and distribution tag. Consult the repository changelog for version-specific changes rather than inferring behavior from the website alone.
