# Documentation site and beta.2 release design

## Objective

Ship `@nipe-solutions/flex-layout-codemod@2.0.0-beta.2` with a public documentation and product site at `https://angular-flex-layout-codemod.nipesolutions.com`. The site must feel recognizably part of the NIPE Open Source family while retaining a distinct identity for Angular layout migration. It must include a browser-only, single-template migration playground backed by real production migration components.

## Scope

The release includes an English-only website, a generated brand icon and web icon set, Vercel production deployment, custom-domain configuration, package metadata updates, a Changeset, npm publication under the `beta` tag, and live verification. Multi-file upload, server-side source processing, and a full project filesystem simulation are deferred.

## Experience and identity

The site inherits family cues from NIPE's existing open-source sites: restrained layout, precise technical typography, generous spacing, direct GitHub/npm actions, high-quality interactive demonstrations, and an explicit `NIPE Open Source` link to `https://opensource.nipesolutions.com`.

Its own visual language is “ordered transformation.” Fragmented Angular layout directives flow through a precise conversion node into aligned Tailwind or native-CSS output. The palette uses deep ink, warm off-white, restrained Angular red, and electric teal for successful transformations. Motion communicates token alignment and resolution, respects reduced-motion preferences, and never blocks reading or interaction. Light and dark themes are supported.

The product mark consists of three offset layout rails entering a central conversion node and leaving as a clean grid. Image generation produces a master transparent raster asset and presentation variants. Favicons and small interface symbols use crisp code-native assets derived from the same geometry. The icon set includes favicon sizes, Apple touch icon, web app icons, social preview artwork, and accessible UI symbols.

## Information architecture

The landing page contains the problem, supported outcomes, safety guarantees, target comparison, install command, live example, and links to documentation, npm, and GitHub.

Documentation covers quick start, CLI options, project workflow, Tailwind output, native CSS output, responsive behavior, reports, validation and transactional safety, troubleshooting, limitations, compatibility, and changelog/release status. The footer includes NIPE Open Source, repository, package, license, imprint, and privacy links.

The package homepage changes to the production documentation domain. Site metadata includes canonical URLs, structured social metadata, sitemap, robots policy, theme colors, and the generated icon set.

## Playground architecture

The site is a static Vite application in `website/`. A dedicated browser-safe migration boundary accepts one template string plus a `tailwind` or `css` target and returns proposed HTML, optional generated CSS, conversion results, and structured diagnostics.

The browser boundary reuses the real Angular parser, semantic planning, and target renderers. It excludes discovery, Node filesystem adapters, transactional Apply, report-file writing, and process-oriented CLI code. An in-memory single-file adapter supplies only the data required for preview. The UI states clearly that the playground previews one template while the installed CLI provides project discovery, validation, reports, transactional writes, rollback, and filesystem safety.

Pasted source never leaves the browser. There is no server execution, analytics payload containing editor content, persistence, or network submission. Invalid input produces real diagnostics and preserves the user's source.

The playground provides curated presets, editable input, target switching, migrate/reset/copy controls, side-by-side output, generated CSS for the CSS target, status and diagnostics, keyboard operation, responsive layouts, and reduced-motion behavior.

## Correctness boundaries

The browser entry point must be statically proven free of Node built-ins and filesystem/transaction imports. Fixture-based parity tests compare playground results with the corresponding production conversion behavior. Website tests cover rendering, target switching, invalid templates, copying, privacy claims, navigation, metadata, responsiveness, keyboard access, accessibility, and reduced motion.

The repository verification gate adds website formatting, linting, typechecking, unit tests, production build, static-output validation, and Playwright smoke/accessibility coverage without weakening existing package gates.

## Vercel and domain

`vercel.json` builds the website and serves its static output. The project is linked to the NIPE Solutions Vercel scope, deployed to production, and assigned `angular-flex-layout-codemod.nipesolutions.com`. The production domain is canonical and HTTPS is required. The deployment is verified for page availability, asset caching, metadata, navigation, playground behavior, and absence of source submission.

If the DNS zone is external to Vercel, implementation may configure everything Vercel owns and then report the exact required DNS record. DNS credentials are never requested in source or committed. The user has authorized direct deployment and domain attachment.

## npm beta.2 release

The package version target is `2.0.0-beta.2`. A Changeset describes the documentation/playground addition and any browser-safe package boundary exposed to support it. The release follows the repository's protected beta process: exact toolchain, complete verification, audit, deterministic package-surface inspection, clean-install smoke test, retained tarball integrity, and publication with public access under `beta`.

The existing `2.0.0-beta.1` is already public and currently owns both `beta` and `latest`. `beta.2` must update `beta` only. `latest` is not deliberately pointed at a prerelease during this work; without an earlier stable version it remains unchanged until the separate stable `2.0.0` decision. Registry state, integrity, package files, installed CLI behavior, and distribution tags are verified after publication.

The user has authorized direct npm publication once all defined gates pass. If interactive npm authentication, two-factor approval, environment approval, or trusted-publisher configuration cannot be completed by the available authenticated session, implementation pauses only at that external authorization boundary with the prepared artifact intact.

## Delivery sequence

1. Establish website and browser-boundary contracts with regression-first tests.
2. Build the browser-safe migration adapter and parity fixtures.
3. Build the site, documentation, playground, responsive behavior, accessibility, and metadata.
4. Generate and integrate the approved icon family and social artwork.
5. Add Vercel and CI/build/release contracts, then run local browser and package verification.
6. Review and merge the implementation.
7. Deploy production, attach and verify the custom domain.
8. produce, verify, publish, and registry-check `2.0.0-beta.2` under `beta`.

## Acceptance criteria

- The production site is reachable over HTTPS at the requested domain and visibly belongs to the NIPE Open Source family.
- Every page links `NIPE Open Source` to `https://opensource.nipesolutions.com`.
- The single-template playground runs locally in the browser, supports both targets, matches production fixtures, and transmits no source.
- Documentation accurately describes installation, supported migrations, safety behavior, limitations, and beta status.
- The generated icon set is complete, consistent, legible at favicon size, and used by site metadata.
- Existing CLI/package behavior remains green and the full website/package/CI gate passes.
- npm exposes `2.0.0-beta.2` under `beta`, the installed artifact passes the CLI smoke oracle, and no unintended `latest` tag change is made.
- Vercel, DNS, npm, GitHub, and local repository state are reported with direct verification evidence.
