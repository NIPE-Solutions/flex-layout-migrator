---
path: /docs/project
title: Project guide
description: Find architecture, contribution, support, security, release, and changelog guidance for the codemod.
group: project
order: 1
---

# Project guide

## Architecture

The production route is `CLI -> Discover -> Analyze -> Render -> Validate -> Apply -> Presentation`. Each stage passes an immutable model to the next. Side effects sit behind narrow ports, and policy such as breakpoint classification, semantic dependency closure, target capability, artifact identity, diagnostics, and transaction recovery has one production owner.

Discover builds a deterministic manifest of file identities without reading template contents. Analyze reads and parses each template with the Angular compiler. Render applies shared semantic planning plus target-specific syntax without writing files. Validate materializes proposals in memory, checks edit ranges and artifact topology, and reparses changed templates. Apply receives only the validated plan, preflights it, and either skips or delegates writes to the transaction. Terminal and JSON presenters observe the completed report and do not control migration.

The website uses the browser-safe preview boundary for local single-template experiments. The Angular compiler remains in the lazy playground graph; repository Markdown, navigation, and registries remain static documentation content. Project discovery, reports, native CSS coordination, and writes stay in the installed CLI.

Generated documentation facts come from immutable public registries and verification scripts. Authored Markdown explains workflows without becoming a second authority for option, diagnostic, compatibility, report, or example inventories.

## Contributing and support

The contributor baseline is Node.js 24, dependency installation from the lockfile, and the repository verification command. Changes to behavior, CLI, or public APIs require a Changeset. Implementation work follows tests, formatting, lint, type checking, package checks, and focused architecture or compatibility gates appropriate to the change.

Use the [repository issue tracker](https://github.com/NIPE-Solutions/flex-layout-migrator/issues) for reproducible defects and focused enhancement proposals. Include non-sensitive minimal source, the package version, Node and Angular versions, exact command, target, diagnostics, and the difference between actual and expected behavior. General Angular, CSS, and Tailwind questions are outside project support scope.

## Security

Do not publish vulnerability details, credentials, or proprietary templates in a public issue. Use [GitHub private vulnerability reporting](https://github.com/NIPE-Solutions/flex-layout-migrator/security/advisories/new) for security-sensitive findings and minimize any shared reproduction. Ordinary unsupported inputs and conversion bugs belong in the public issue tracker after redaction.

## Releases and changelog

Version 2 releases use reviewed Changesets, a protected release pull request, a manual staging workflow on protected `main`, npm Trusted Publishing through GitHub OIDC, and maintainer approval with two-factor authentication. The staging job verifies source, audit, package surface, tarball integrity, and a clean-install CLI smoke before it invokes npm staging.

Beta versions use the `beta` distribution tag. Staging is not publication: a maintainer compares the staged tarball and recorded SHA-512 integrity before approval. An ambiguous staging result must be listed and downloaded for byte comparison before retry. Changed bytes require a new beta version rather than reusing a rejected or published version.

Git tags and GitHub prereleases follow npm approval. The `latest` tag is reserved for a separately reviewed stable-release decision. Consult the [repository changelog](https://github.com/NIPE-Solutions/flex-layout-migrator/blob/main/CHANGELOG.md) for version-specific changes rather than inferring behavior from the website alone.
