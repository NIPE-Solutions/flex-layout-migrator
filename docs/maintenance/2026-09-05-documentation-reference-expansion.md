# Documentation reference expansion release evidence — 2026-09-05

This is the local release-candidate record for the documentation reference expansion that targets `2.0.0-beta.3`. It deliberately distinguishes repository-local evidence from facts that can exist only after protected review, merge, deployment, npm staging and approval, and GitHub release creation. Every external fact in section 20 is pending; this document must be updated with observed identifiers and results rather than treating this draft as proof that an external action occurred.

## 1. Release-candidate status and evidence authority

The candidate starts from published `2.0.0-beta.2` at `6e21d31274a380b7e9d256d75b4881b1bba5ba66` and contains the reviewed documentation expansion Tasks 1–6 plus the bounded Task 7 accessibility correction. The exact local Task 7 commit and command transcript are recorded in the ignored SDD handoff at `.superpowers/sdd/2026-09-05-documentation-reference-expansion/task-7-report.md` so this tracked document does not attempt to name its own commit.

Claims were reviewed in this order:

1. production implementation and executable tests;
2. typed public contracts and report schemas;
3. authored repository documentation;
4. website summaries and presentation.

The local candidate does not change `package.json`, `package-lock.json`, or `CHANGELOG.md`. It adds a pending Changeset for the protected version pull request; Changesets versioning has not been invoked. No package has been packed for beta.3, staged, approved, published, tagged, or released from this worktree.

## 2. Documentation maturity verdict

**Verdict: COMPREHENSIVE.** The site has 25 substantial documentation routes in seven groups, nine production-verified transformation examples, a schema-2 report example, all 11 public CLI options, all 15 public diagnostic codes, and target-specific entries for all 30 recognized directive names. It provides practical small-scope and large-repository workflows, explicit safety and recovery limits, CI guidance, stable deep links, and executable drift checks.

The verdict is not REFERENCE-GRADE. The project intentionally makes no blanket Angular or Nx version claim, does not discover custom breakpoint or Tailwind project configuration, and does not provide multi-version documentation or a general indexed search surface. Those boundaries do not make the current guidance thin, but they prevent an unqualified claim that the site is an exhaustive reference for every project environment.

## 3. Six-persona audit

| Perspective                                   | Workflow                                                                                                                                               | Compatibility and diagnostics                                                                                                               | CI, write safety, and claim honesty                                                                                                                                                                   | Result                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Developer migrating about twenty templates    | Installation, Quick start, and Migration Workflow provide copyable plan, review, write, and verify commands.                                           | The target guides, explorer, examples, and diagnostic deep links expose both conversions and preserved source.                              | Planning is the default; `--write` is explicit; report creation in plan mode is disclosed as a filesystem effect; application verification remains the developer's responsibility.                    | Sufficient and actionable.                                         |
| Developer migrating a 2,000-template monorepo | Large codebase strategy defines pilot, ownership-aligned batches, completion checks, and a copyable checklist.                                         | Teams are directed to compare targets on representative difficult input and retain per-batch diagnostic/report evidence.                    | Strict exits, clean checkpoints, named reviewers, remaining-directive searches, application builds/tests, and dependency-removal timing are explicit. No throughput or universal scale claim is made. | Sufficient without an invented performance promise.                |
| Frontend lead assessing migration risk        | The home-page plan makes Source → Analyze → Plan → Review → Write → Verify visible before product detail.                                              | Target differences, atomic semantic families, class/style ownership, responsive precedence, images, parsing, and limitations are separated. | Preservation is presented as a safety result, rollback is qualified, and application compilation, tests, responsive review, and selector review remain required.                                      | Risk is inspectable rather than hidden behind automation language. |
| CI engineer consuming JSON reports            | Reports, Exit codes and CI, Allowing unresolved work, and the complete CLI reference define a reproducible command path.                               | Schema version 2, result categories, file-level diagnostics, stylesheet proposals, and unknown-value handling are explained.                | Exit codes 0, 1, and 2 are distinguished; `--allow-unresolved` changes only process policy; `mode` is not mistaken for `application.status`.                                                          | Machine consumption has an explicit contract and failure policy.   |
| Developer resolving one preserved directive   | “Why wasn't this migrated?”, local diagnostic search, stable code anchors, and Troubleshooting provide a direct path from code to cause.               | Every code shows meaning, why guessing is unsafe, concrete resolution steps, preservation behavior, and rerun guidance.                     | The docs require resolving the complete semantic family and rerunning the same scope rather than deleting source to silence a search.                                                                 | The single-case debugging path is concrete.                        |
| Open-source contributor                       | Project guide, README, contributing, support, security, architecture, release process, issue forms, and Edit on GitHub links expose project ownership. | Registry evidence paths and executable mutation tests identify where public facts come from.                                                | Public issue forms request reproducible redacted context; vulnerability reports use private reporting; protected release responsibilities are separate from contributor work.                         | Contribution and escalation paths are discoverable and bounded.    |

## 4. Product identity and home-page story

The public identity remains Angular Flex-Layout Codemod in the NIPE Open Source family. The central promise is concrete: “Plan first. Review unresolved cases. Write only when you are ready.” The hero uses a real registered fixture and production browser-preview boundary, shows both Tailwind CSS and native CSS outcomes, identifies preserved and converted plan items, labels the fixture and plan mode, and states that no project files were written.

The full playground remains below the compact plan. It is presented as a one-template browser preview rather than a project migration, and the page directs project work to the installed CLI and documentation.

## 5. Information architecture and navigation

The 25 documentation routes are grouped as Start, Migration Targets, Compatibility, Safety & Review, Reports & Automation, Reference, and Project. Desktop navigation is persistent and indicates the current page. Mobile navigation uses grouped disclosures and automatically opens the current group. Each page provides route-specific title and description, a breadcrumb-like location label, On this page links, stable heading fragments, previous/next navigation, and an Edit on GitHub link.

The public route manifest also includes the home page, Privacy, and Imprint, for 28 indexed routes. Existing `/docs`, `/docs/cli`, `/docs/tailwind`, `/docs/native-css`, `/docs/safety`, and `/docs/troubleshooting` paths remain exact content routes. Generated `.html` aliases and `/index.html` have permanent redirects to canonical paths.

## 6. Installation and quick start

Installation states the package's actual Node.js requirement (`>=24`) and deliberately avoids an unsupported blanket npm, Angular, or Nx range. It recommends an exact development dependency through the `beta` tag, then asks the operator to record `--version` and inspect installed help.

Quick start begins with a representative plan and optional JSON report, explains that a report and its parent can be written in plan mode, requires review of proposed and preserved outcomes, and adds `--write` only as a separate decision. The follow-up requires inspecting the actual diff, rerunning the same scope, building and testing the Angular application, reviewing responsive layouts, and reconciling remaining Flex-Layout inputs.

## 7. End-to-end migration workflow

The workflow is explicitly Plan → Review → Resolve → Write → Verify. The guide separates observable tool behavior from recommended team practice. Parse errors, unresolved policy, native CSS companion output, responsive-image structure, project writes, and application verification are assigned to the correct stage.

The report's `application` object is the application authority. The docs do not infer writes from requested mode, proposed change counts, or stylesheet action, and they explain the valid applied/no-byte-change case.

## 8. Large-codebase execution

The large-codebase guide scales by evidence rather than by promising speed. A representative pilot exercises common and difficult source, compares both viable targets, records the package version and exact command, and establishes batch policy. Expansion follows feature ownership or deployable boundaries with a clean checkpoint, reviewer, report, unresolved policy, and recovery route per batch.

Completion requires repository-wide rediscovery, application build and tests, responsive/orientation/print review where applicable, classification of every remaining input, and removal of legacy dependencies only after their use is disproven. The page explicitly says that pilot evidence is neither a performance nor compatibility promise for an entire monorepo.

## 9. Tailwind CSS target

The Tailwind guide names Tailwind CSS v4 as the default target and explains why exact arbitrary lengths and media variants are used instead of project theme spacing or named mobile-first breakpoints. It covers the 13 standard aliases, configured orientation and print assertions, responsive overlap, class/property ownership, dynamic class/style authority, visibility restoration, and Grid composition.

The target is accurately bounded: it does not edit CSS, Sass, Less, or Tailwind configuration and does not read project plugins or theme values to justify output.

## 10. Native CSS target

The native CSS guide names exactly eight supported Flex semantic families and explicitly excludes Grid, visibility, responsive class/style, orientation, print, custom aliases, and target-owned responsive images. It documents the required stylesheet path, deterministic `flm-` class identity, the schema-1 ownership region, additive preservation of unmatched owned rules, and fail-closed marker handling.

Planning and writing remain separate. Templates and the companion stylesheet share the coordinated project transaction in write mode, while power loss, forced termination, storage failure, external edits, and damaged backups remain outside a durability guarantee.

## 11. Responsive-image path

Responsive image conversion is documented as a separate opt-in structural migration. Eligibility, fallback retention, breakpoint limits, unsafe values, existing `<picture>` ancestry, structural directives, exact source reporting, and generated-template reparse are covered.

The guide calls out selector, accessibility, loading, and layout review after wrapping an image in `<picture>`. Orientation and print flags do not silently broaden responsive-image support.

## 12. Compatibility model and explorer

The compatibility vocabulary distinguishes Limited, Preserved, Planned, and Not applicable at the target matrix from Converted, Review, Unsupported, Invalid, and Parse error at a concrete result. Users select a target before filtering by directive family or status, and each of the 30 directive rows exposes exact target differences, supported and limited forms, linked verified examples, and relevant diagnostic codes.

The registry is checked against the production directive catalog, structured compatibility inventory, authored compatibility contract, target-specific production probes, and exact example associations. A matrix status is not presented as a promise that every value or project context converts.

## 13. Diagnostics and troubleshooting

All 13 conversion diagnostics and both parse-error diagnostics have stable `/docs/diagnostics#<code>` targets. The local search covers code, family, and meaning. Each entry explains the category, safety rationale, concrete resolution sequence, preservation behavior, and whether an unchanged rerun can help.

Troubleshooting begins at the first failed boundary, distinguishes exit codes 1 and 2, explains missing project output and missing reports, asks for minimal but semantically representative reproductions, and includes the version 1 to version 2 script/report migration path. Unknown codes and statuses are treated as contract compatibility events instead of being discarded.

## 14. JSON reports, CI, and unresolved policy

The schema-2 report guide defines requested mode, target, portable paths, duration, derived summary, path-sorted file results, optional stylesheet proposal, and actual application state. Its displayed example is rebuilt through the production report builder and not maintained as freehand JSON.

The CI guide gives strict and accepted-unresolved command forms, requires schema version checking, separates command failure from safely completed unresolved work, and requires application build, test, visual, and remaining-directive gates outside the codemod. Allowing unresolved results changes only the final exit decision and requires a reviewed external owner for the preserved set.

## 15. Safety, writes, transactions, and reruns

The safety pages explain proof-before-replacement, atomic semantic families, class/style ownership, Angular compiler parsing, coordinated transaction phases, rollback limits, recovery procedure, and rerun behavior. Plan mode does not write project templates or the companion stylesheet; an explicitly requested report is a separate atomic filesystem effect.

The transaction documentation is careful not to promise crash durability. Concurrent destination drift fails preflight, handled failures attempt rollback and cleanup, report writing occurs after and outside project application, and Git or a verified backup remains the durable recovery boundary. Rerun guidance distinguishes byte-idempotence for the same successful scope from an incorrect promise that unresolved cases or different invocations become identical.

## 16. CLI, configuration, and report-schema contracts

The CLI reference covers all 11 public options, including defaults, choices, interactions, aliases, path requirements, project writes, report effects, unresolved policy, optional breakpoint assertions, responsive images, debug output, and version output. It states that configuration is command-driven and that no separate codemod configuration file exists.

The documentation verifier parses the production Commander definition and diagnostic unions, evaluates the public registries, validates report examples against schema-2 production construction, and executes transformation examples through the production browser preview. Mutation tests prove missing, duplicate, unknown, or stale facts fail closed.

## 17. Verified examples, claim honesty, and drift prevention

Nine published fixtures cover bounded conversion and preservation behavior across Flex, Grid, native CSS, target boundaries, responsive class/style, flex-item atomicity, and visibility. Every fixture supplies exact source, target, expected HTML, optional CSS, ordered statuses, and diagnostic codes; package tests execute each fixture through production and compare exact output.

Public prose was separately audited for automation, safety, stability, performance, versions, compatibility, privacy, and transaction claims. High-risk copy has exact assertions, while the claim audit explicitly says narrative prose is also human-reviewed and is not comprehensively proven merely by registry checks. No project-wide performance, compatibility, or complete-automation claim is retained.

## 18. Implementation, design, accessibility, performance, privacy, and security review

The implementation review found one Important issue and no Critical issues. The verified-example `<pre>` elements used local horizontal scrolling but, unlike the shared code-block component and other scrollers, were not keyboard focusable. An adversarial all-route Axe sweep reproduced `scrollable-region-focusable` on nine affected nodes at desktop width and 18 at mobile width. A focused regression now requires every verified-example code region to have `tabindex="0"`; the production component applies it to input, output, and optional CSS regions. A post-fix sweep of all 28 public routes at 1280×900 and 375×812 produced zero Critical or Serious Axe findings and zero page-level horizontal overflow findings.

The visual review covered loaded desktop and 375-pixel home states plus desktop compatibility and mobile diagnostics routes. The established quiet editorial language, source/output colors, explicit status symbols and labels, local table/code scrolling, current-page state, focus indicators, and reduced-motion behavior remain coherent. No redesign was needed.

The one deferred Minor observation is Vite's warning for the Angular compiler-bearing preview chunk (approximately 630 kB minified and 170 kB gzip in this candidate). It is documented rather than treated as an eager documentation regression: static verification proves the compiler sentinel and preview module stay outside the eager documentation graph, and browser coverage confirms documentation routes do not load a JavaScript resource over 500 KiB.

The security/privacy review found no material local release blocker. User template text is rendered as React text, not injected HTML; the website production code contains no analytics, session replay, storage, cookie, beacon, WebSocket, or source-upload path. Browser tests observe no request after private-marker input begins. Static configuration declares `nosniff`, strict-origin referrer policy, frame denial, and disabled camera, microphone, and geolocation permissions. The high-severity dependency audit result belongs to the clean local gate in section 19; live header behavior remains pending in section 20.

## 19. Package, repository, and local release-candidate gates

The pending Changeset requests the next beta prerelease without directly editing package or lockfile versions. The protected Changesets version workflow is responsible for producing `2.0.0-beta.3`, updating `package.json`, `package-lock.json`, and `CHANGELOG.md`, and consuming the Changeset. This local task did not run `changeset version` or any release preparation command.

The final local candidate was required to pass, from a clean worktree, in this exact order:

```sh
npm run clean
npm run verify
npm run verify:website
npm audit --audit-level=high
git diff --check
git status --short
```

The fresh command evidence and exact commit are recorded in the Task 7 handoff. The gate covers formatting, linting, package and website type checking, root coverage, package build and six-file package surface, documentation contracts, website unit tests, asset contracts, generated route/static metadata, desktop/mobile browser behavior and accessibility, high-severity dependency audit, whitespace hygiene, and clean repository state. A candidate for which the handoff does not show zero exit statuses and empty final status is not accepted by this report.

## 20. External release, deployment, and publication evidence — pending

The following facts are intentionally **PENDING — controller** until the protected workflow observes and records them:

- **Implementation pull request:** pending URL, reviewed head SHA, required CI, CodeQL, dependency-review, package, website, and architecture conclusions, merge result, and exact merged `main` SHA.
- **Production deployment:** pending Vercel deployment identifier and exact source SHA; HTTPS/TLS, `/`, critical documentation routes, legacy paths and redirects, static assets, response security headers, sitemap, robots, canonical/Open Graph metadata, and absence of unintended SSO protection on `angular-flex-layout-codemod.nipesolutions.com` must be observed live.
- **GitHub About metadata:** pending application and read-back of description `Review-first codemod for migrating supported Angular Flex-Layout templates to Tailwind CSS v4 or native CSS.`, website `https://angular-flex-layout-codemod.nipesolutions.com`, and topics `angular`, `angular-flex-layout`, `codemod`, `migration`, `tailwindcss`, `css`, `typescript`, and `developer-tools`.
- **Changesets version pull request:** pending URL and merge SHA; must show `2.0.0-beta.3` in package and lockfile, aligned changelog/release notes and homepage, consumed Changeset, and no unrelated versioned files.
- **Staged package:** pending protected `stage-release.yml` run URL, exact commit, stage ID, six-file manifest, tarball filename, npm descriptor SHASUM/SRI, independently recomputed SHA-512 SRI, provenance expectation, clean-install `--help` and `--version`, plan-mode fixture result, and secret scan. Staging is not publication.
- **Human approval:** pending maintainer comparison and npm staged-package approval with two-factor authentication. A rejected or byte-different artifact requires the documented recovery path and, when bytes change, a new beta version.
- **Registry publication:** pending proof that `beta` resolves to `2.0.0-beta.3`, `latest` remains `2.0.0-beta.1`, the public integrity matches the retained artifact, provenance names the expected repository/workflow, and an exact beta install runs the expected CLI version and plan fixture.
- **GitHub prerelease:** pending protected/signed `v2.0.0-beta.3` tag and prerelease URL against the exact published release commit. It must follow npm approval rather than precede it.
- **Final evidence update:** pending protected report-only pull request that replaces these placeholders with observed identifiers and results. Until it merges, this document is local release-candidate evidence, not proof of production deployment or npm publication.

The maturity assessment remains COMPREHENSIVE for the reviewed local content. Release completion remains pending until every external item above is verified; `latest` must not move.
