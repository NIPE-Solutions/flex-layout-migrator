# Angular Flex-Layout Codemod documentation reference expansion

## Status

Approved in conversation on 2026-09-05. This work targets `2.0.0-beta.3` and starts from published `2.0.0-beta.2` at commit `6e21d31274a380b7e9d256d75b4881b1bba5ba66`.

## Purpose

Expand the existing documentation website from a concise product site into a serious migration reference and decision-support surface without changing its established visual language. The product remains Angular Flex-Layout Codemod, derived from package and repository metadata rather than rebranded.

The central promise is conservative correctness:

> Plan first. Review unresolved cases. Write only when you are ready.

When the codemod cannot prove a safe equivalent transformation, it preserves the original source and reports the reason. The site must make that decision-making visible and must never imply complete automatic migration.

## Non-goals

- No React-primitives visual redesign, generic SaaS treatment, glassmorphism, marketing gradients, or card-heavy layout.
- No CMS, analytics, session replay, external fonts, hosted search, or multi-version documentation system.
- No invented CLI flags, diagnostics, compatibility, performance, version support, transactional guarantees, or transformation syntax.
- No attempt to turn the hero into the full playground.
- No duplicated documentation source outside this repository.

## Source-of-truth hierarchy

Public claims follow this order:

1. implementation and executable tests;
2. structured public contracts and schemas;
3. authored repository documentation;
4. website summaries.

Conflicts must be investigated at the higher-authority layer. A claim without evidence is removed, qualified, or verified before publication.

## Documentation architecture

The existing React/Vite site shell and browser preview API remain. Substantive documentation moves to repository-owned Markdown or MDX. Small typed registries hold facts that must remain synchronized with code:

- CLI options, defaults, interactions, and exit behavior;
- public diagnostic codes, meanings, safety rationale, and remediation;
- directive-family compatibility by Tailwind CSS and native CSS target;
- verified transformation and preservation examples;
- report schema fields, values, examples, and version;
- ordered navigation, routes, redirects, metadata, and sitemap entries.

Website reference tables, filters, anchors, summaries, and tests consume these registries. Authored prose explains behavior and workflow rather than duplicating enumerated facts.

## Information architecture

Use roughly 20–25 substantial pages, with stable section anchors for closely related topics. Avoid both a forty-item sidebar wall and thin placeholder routes.

### Start

- Introduction and why this exists
- Installation and requirements
- Quick start
- Migration workflow and target selection
- Migrating a large Angular codebase, including a copyable checklist

### Migration Targets

- Tailwind CSS
- Native CSS
- Responsive images, only if current behavior supports it

### Compatibility

- Compatibility overview and status vocabulary
- Flex, visibility, grid, responsive class/style, breakpoint, orientation, and print behavior
- Dynamic bindings and unsupported/preserved cases
- Lightweight compatibility explorer with target, family, and status filters

### Safety & Review

- Safety model and proof/preservation semantics
- Atomic migration families
- Class conflicts and style ownership
- Parsing and invalid source
- Transactional writes, rollback, and recovery
- Idempotency and rerun workflow

### Reports & Automation

- Diagnostics and “Why Wasn't This Migrated?”
- JSON reports and report schema
- Exit codes and CI integration
- Allowing unresolved work where supported

### Reference

- Complete CLI reference
- Configuration, or an explicit statement that configuration is CLI-driven
- Diagnostic-code reference
- Categorized verified examples
- Troubleshooting, FAQ, glossary, and known limitations
- Migration from v1 where historical evidence exists

### Project

- Architecture
- Contributing and support
- Security
- Release process and changelog

Each page provides stable headings/deep links, previous/next navigation, Edit on GitHub, route-specific canonical and Open Graph metadata, sitemap inclusion, and mobile-safe code/table presentation. Existing URLs remain valid or redirect deliberately.

## Product story and home page

The home page remains the direct entry point; there is no separate marketing splash page. The hero shows a compact, canonical migration plan:

- three to six lines of source;
- `SOURCE → ANALYZE → PLAN → REVIEW → WRITE → VERIFY`;
- converted and preserved plan items;
- exact generated output;
- a fixture-labelled status summary;
- a Tailwind CSS/native CSS toggle backed by the real browser preview API.

The hero communicates the codemod in fifteen seconds. The full existing playground remains below it for experimentation. Diagnostic codes link to their exact reference anchors.

All displayed transformations are generated from or asserted against the current production engine. Demo counts are explicitly labelled as example/fixture data.

## Visual and interaction language

Preserve the current quiet, technical, editorial, code-first, diff-oriented design. Strengthen identity using source, diffs, diagnostics, plans, and reports rather than Angular branding.

Use restrained status tokens for Converted, Review, Preserved, Unsupported, Invalid, and Informational. Every status includes text, icon, and label; color is reinforcement only. Diff presentation includes `+`, `-`, and preserved markers, not red/green alone.

Reusable components include:

- accessible source/result diff;
- diagnostic callout;
- status label;
- report summary;
- compatibility table and explorer;
- directive detail disclosure;
- copyable command/code block;
- migration checklist;
- local diagnostic filter;
- section jump navigation.

Large tables use captions, readable type, optional sticky headers, and container-level horizontal scrolling. Mobile documentation uses grouped/collapsible navigation without horizontal page panning. Code blocks define wrapping or contained scrolling and accessible copy controls.

The Open Graph image uses the source-to-plan-to-result motif and does not imply Angular/Google affiliation.

## Content requirements

An evidence inventory precedes writing. It derives exact behavior from the CLI, pipeline, analyzers, planners, renderers, transactions, reports, compatibility contract, architecture documents, tests, package metadata, changelog, and release process.

Documentation must distinguish:

- plan mode from write mode;
- tool requirements from recommended migration practices;
- converted, review, preserved, unsupported, and invalid states;
- Tailwind CSS from native CSS support;
- static/literal eligibility from dynamic/runtime ambiguity;
- guaranteed rollback behavior from unavoidable filesystem limits;
- verified support from unverified environments such as broad Angular or Nx ranges.

The guides cover the current behavior for file discovery and exclusions, templates, formatting/comments/attribute ordering, generated class/CSS ownership, responsive aliases, visibility, grid, responsive class/style, images, reruns, reports, CI, large repositories, remaining-directive checks, visual review, dependency removal, and support/security routing. A subject is omitted or explicitly marked unverified when evidence does not exist.

The README stays concise: orientation, installation, basic workflow, and a prominent link to the dedicated documentation site. Repository issue templates request actionable environment, command, target, minimal source, actual/expected output, and diagnostic/report information without soliciting sensitive project code.

## Validation and drift prevention

CI fails when:

- a public CLI flag is absent from structured documentation;
- a public diagnostic code lacks documentation;
- a compatibility family/status is missing or contradicts its contract;
- a report example fails the current schema;
- a migration example differs from the real engine;
- navigation, redirects, sitemap, robots, canonical, or Open Graph metadata drift;
- displayed version or prerelease status differs from package metadata;
- a required page is empty or unreachable.

Prefer simple validation scripts and existing test infrastructure over a general documentation generator. Report examples validate against the real schema or schema-building contract. CLI and transformation examples execute where practical.

## Accessibility, privacy, and performance

Maintain WCAG 2.2 AA fundamentals without claiming formal certification. Audit heading hierarchy, navigation, filters, tables, code copy, status semantics, callouts, focus, reduced motion, mobile interaction, and diff contrast. Browser tests exercise desktop and 375–390px mobile layouts.

The site remains tracking-free and performs all playground work locally. Documentation routes stay mostly static and must not eagerly load the Angular compiler/playground bundle. Small compatibility and diagnostic filters may be client-side without external search services.

## Testing strategy

### Contract tests

- CLI, diagnostic, compatibility, report-schema, examples, routes, redirects, and version registries
- Markdown/MDX front matter, heading anchors, navigation reachability, and link targets
- sitemap, robots, canonical, Open Graph, and structured metadata

### Component tests

- hero target toggle and verified output
- compatibility filtering and directive details
- diagnostic filtering and deep links
- copy controls, previous/next navigation, and mobile sidebar
- status icons/labels and accessible diff semantics

### Browser and release tests

- critical route navigation on desktop/mobile
- hero and playground targets
- compatibility and diagnostic interactions
- legal, GitHub, changelog, security, and NIPE links
- accessibility, privacy, responsive tables/code, and no page overflow
- initial bundle/compiler separation
- production build, package verification, clean install, and CLI smoke

## Delivery slices

1. Evidence inventory and structured documentation contracts.
2. Markdown/MDX content pipeline, route metadata, and complete grouped IA.
3. Workflow, safety, reports, automation, reference, and project content.
4. Compatibility, diagnostics, targets, and executable examples.
5. Hero, explorer, reusable documentation components, responsive styling, and project-specific OG asset.
6. README, issue templates, SEO, redirects, repository metadata recommendations, and claim audit.
7. Whole-site review from all requested user perspectives, accessibility/performance hardening, protected `2.0.0-beta.3` release, production deployment, and npm `beta` publication without moving `latest`.

Slices use narrow ownership and tests so later content expansion does not repeatedly rewrite foundational routing or registries.

## Release and acceptance

This work targets `2.0.0-beta.3`. The site, repository documentation, drift contracts, package metadata, and release notes ship together. The existing production site stays available until the reviewed expansion is merged and deployed.

Final audit perspectives:

- developer migrating twenty templates;
- developer migrating a two-thousand-template monorepo;
- frontend lead assessing migration risk;
- CI engineer consuming JSON reports;
- developer resolving one preserved directive;
- open-source contributor.

The release report includes the twenty requested deliverable categories from the change request and classifies maturity honestly as TOO THIN, GOOD, COMPREHENSIVE, or REFERENCE-GRADE. The expected target is COMPREHENSIVE; REFERENCE-GRADE is used only if factual registries, validated examples, and practical coverage justify it.

Acceptance requires green formatting, lint, typecheck, package tests, documentation contracts, website unit tests, desktop/mobile browser tests, accessibility checks, static-output verification, package build/surface checks, clean install/CLI smoke, protected CI, production-domain smoke, and verified npm `beta` publication. No `latest` dist-tag change is permitted.
