# Documentation Reference Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Angular Flex-Layout Codemod website into a comprehensive, evidence-backed migration reference and publish the aligned `2.0.0-beta.3` release.

**Architecture:** Keep the existing React/Vite shell and browser preview entry. Add focused typed registries for public facts, repository-owned Markdown content, and a small build-time content loader; render all routes and interactive reference tools from those sources. Validate facts against production code, schemas, and transformation fixtures so public claims cannot silently drift.

**Tech Stack:** TypeScript, React 19, Vite 8, Vitest, Testing Library, Playwright, Axe, Markdown/MDX-compatible build-time content, existing Angular compiler-backed preview engine, Changesets, Vercel, npm trusted publishing.

**Spec:** `docs/superpowers/specs/2026-09-05-documentation-reference-expansion-design.md`

## Global Constraints

- Target version is `2.0.0-beta.3`; npm publication uses `beta` and must not move `latest`.
- Public identity remains Angular Flex-Layout Codemod / `@nipe-solutions/flex-layout-codemod`.
- Central message: “Plan first. Review unresolved cases. Write only when you are ready.”
- Preserve the existing quiet, technical, editorial, code-first, diff-oriented visual language.
- Implementation/tests outrank structured contracts, authored docs, and website summaries.
- Never invent flags, diagnostics, compatibility, performance, version support, transaction guarantees, or generated syntax.
- No CMS, analytics, session replay, external fonts, hosted search, or multi-version docs.
- Playground input remains local to the browser; documentation routes must not eagerly load the Angular compiler chunk.
- Every status uses text, icon, and label; color is never the only signal.
- Existing public routes remain valid or receive tested redirects.
- Documentation maturity is reported honestly; the target is COMPREHENSIVE, not automatically REFERENCE-GRADE.

---

### Task 1: Evidence inventory and public documentation registries

**Files:**
- Create: `website/src/content/public-contract.ts`
- Create: `website/src/content/cli-reference.ts`
- Create: `website/src/content/diagnostic-reference.ts`
- Create: `website/src/content/compatibility-reference.ts`
- Create: `website/src/content/report-reference.ts`
- Create: `website/src/content/example-reference.ts`
- Create: `website/src/content/reference-contract.spec.ts`
- Create: `scripts/verify-documentation-contract.mjs`
- Create: `scripts/verify-documentation-contract.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `runCli(argv)`, `DiagnosticCode`, `MigrationReport`, `docs/compatibility.md`, production renderers and canonical test fixtures.
- Produces: `CliOptionReference`, `DiagnosticReference`, `CompatibilityEntry`, `ReportFieldReference`, `VerifiedExample`, and `verifyDocumentationContract(root): Promise<void>`.

- [ ] **Step 1: Write failing registry coverage tests**

```ts
expect(cliReference.map(option => option.longFlag).sort()).toEqual([
  '--allow-unresolved',
  '--debug',
  '--orientation-breakpoints',
  '--output',
  '--print-with-breakpoints',
  '--report',
  '--responsive-images',
  '--stylesheet',
  '--target',
  '--version',
  '--write',
]);
expect(new Set(diagnosticReference.map(item => item.code))).toEqual(new Set<DiagnosticCode>(expectedCodes));
expect(reportReference.schemaVersion).toBe(2);
```

- [ ] **Step 2: Run RED tests**

Run: `npx vitest run website/src/content/reference-contract.spec.ts scripts/verify-documentation-contract.spec.ts`

Expected: FAIL because registries and verifier do not exist.

- [ ] **Step 3: Define narrow immutable registry types and exact current data**

```ts
export interface DiagnosticReference {
  readonly code: DiagnosticCode | 'template-parse-error' | 'generated-template-parse-error';
  readonly family: string;
  readonly meaning: string;
  readonly unsafeToGuess: string;
  readonly resolution: readonly string[];
  readonly rerunEligible: boolean;
}

export interface CompatibilityEntry {
  readonly id: string;
  readonly directiveFamily: string;
  readonly category: 'flex' | 'visibility' | 'grid' | 'responsive-class-style' | 'images';
  readonly tailwind: CompatibilityStatus;
  readonly css: CompatibilityStatus;
  readonly evidence: readonly string[];
}
```

Populate only behavior proven by current source/tests. Store evidence paths in each compatibility/example record.

- [ ] **Step 4: Implement production-backed drift verification**

The verifier must parse Commander help/definition evidence, TypeScript diagnostic unions, schema-2 report fixtures, compatibility contracts, and verified example fixtures. It fails on missing, duplicate, unknown, or stale entries and validates every JSON example.

```js
export async function verifyDocumentationContract(root) {
  await verifyCliOptions(root);
  await verifyDiagnostics(root);
  await verifyCompatibilityEvidence(root);
  await verifyReportExamples(root);
  await verifyTransformationExamples(root);
}
```

- [ ] **Step 5: Add adversarial mutation tests**

Fixtures must prove failure when a CLI flag, diagnostic, report field, compatibility target, or expected transformation is removed or changed.

- [ ] **Step 6: Wire the verifier into package scripts and CI-consumed gates**

```json
"verify:docs": "node scripts/verify-documentation-contract.mjs"
```

Add `npm run verify:docs` to `verify:website` before the build.

- [ ] **Step 7: Run GREEN and full regression gates**

Run: `npm run verify:docs && npm run test:website && npm run typecheck:website && npm run lint`

Expected: PASS with mutation tests proving the verifier fails closed.

- [ ] **Step 8: Commit**

```bash
git add website/src/content scripts/verify-documentation-contract.mjs scripts/verify-documentation-contract.spec.ts package.json
git commit -m "feat(docs): add evidence-backed reference registries"
```

---

### Task 2: Markdown content pipeline, grouped IA, and route generation

**Files:**
- Create: `website/src/content/docs-navigation.ts`
- Create: `website/src/content/docs-loader.ts`
- Create: `website/src/content/docs-loader.spec.ts`
- Create: `website/src/components/docs-layout.tsx`
- Create: `website/src/components/docs-layout.spec.tsx`
- Create: `website/content/**/*.md`
- Modify: `website/src/router.ts`
- Modify: `website/src/app.tsx`
- Modify: `website/src/pages/docs.tsx`
- Modify: `scripts/generate-website-route-html.mjs`
- Modify: `scripts/verify-website-static.mjs`
- Modify: `vite.website.config.ts`

**Interfaces:**
- Consumes: Task 1 registries and existing `installClientNavigation()`.
- Produces: `DocumentationRoute`, `documentationGroups`, `loadDocumentationPage(path)`, and generated metadata HTML for every route.

- [ ] **Step 1: Write failing route/content/navigation tests**

```ts
expect(documentationGroups.map(group => group.label)).toEqual([
  'Start', 'Migration Targets', 'Compatibility', 'Safety & Review',
  'Reports & Automation', 'Reference', 'Project',
]);
for (const route of documentationRoutes) {
  expect(loadDocumentationPage(route.path).body.trim()).not.toBe('');
  expect(route.editUrl).toMatch(/^https:\/\/github\.com\/NIPE-Solutions\//u);
}
```

- [ ] **Step 2: Run RED tests**

Run: `npx vitest run website/src/content/docs-loader.spec.ts website/src/components/docs-layout.spec.tsx`

Expected: FAIL because route/content units do not exist.

- [ ] **Step 3: Implement build-time Markdown ingestion**

Use Vite raw imports or a small local parser; do not add a runtime Markdown engine or syntax-highlighting bundle. Validate front matter with an exact local schema.

```ts
export interface DocumentationPage {
  readonly path: DocumentationPath;
  readonly title: string;
  readonly description: string;
  readonly group: DocumentationGroupId;
  readonly order: number;
  readonly body: string;
  readonly headings: readonly DocumentationHeading[];
  readonly editUrl: string;
}
```

- [ ] **Step 4: Define the complete 20–25 page IA**

Create substantive initial Markdown files for every approved route. Closely related subjects use stable anchors, not placeholder pages. Keep `/docs`, `/docs/cli`, `/docs/tailwind`, `/docs/native-css`, `/docs/safety`, and `/docs/troubleshooting` valid.

- [ ] **Step 5: Implement grouped desktop/mobile navigation**

`DocsLayout` owns active state, grouped disclosure, jump navigation, previous/next links, and Edit on GitHub. Mobile groups collapse; the active group opens automatically.

- [ ] **Step 6: Generate and verify route metadata**

Extend route generation to emit canonical, Open Graph, title, description, sitemap, robots, and exact redirects for the full route set.

- [ ] **Step 7: Add route/link/anchor mutation tests**

Fail on duplicate paths, duplicate heading IDs, missing active route, broken previous/next edges, missing sitemap routes, or removed legacy route coverage.

- [ ] **Step 8: Run GREEN gates**

Run: `npm run test:website && npm run build:website && npm run verify:website-static && npm run typecheck:website`

Expected: PASS; all routes build as metadata-specific documents.

- [ ] **Step 9: Commit**

```bash
git add website/content website/src/content website/src/components/docs-layout.tsx website/src/components/docs-layout.spec.tsx website/src/router.ts website/src/app.tsx website/src/pages/docs.tsx scripts vite.website.config.ts
git commit -m "feat(docs): add grouped reference information architecture"
```

---

### Task 3: Workflow, safety, reports, automation, and project guides

**Files:**
- Modify: `website/content/start/*.md`
- Modify: `website/content/safety/*.md`
- Modify: `website/content/reports/*.md`
- Modify: `website/content/reference/*.md`
- Modify: `website/content/project/*.md`
- Create: `website/src/components/migration-checklist.tsx`
- Create: `website/src/components/report-example.tsx`
- Create: `website/src/components/diagnostic-callout.tsx`
- Create: `website/src/components/content-components.spec.tsx`
- Modify: `website/src/components/code-block.tsx`

**Interfaces:**
- Consumes: `cliReference`, `reportReference`, `diagnosticReference`, Markdown renderer slots.
- Produces: `MigrationChecklist`, `ReportExample`, `DiagnosticCallout`, and complete workflow/safety/report/project prose.

- [ ] **Step 1: Write failing semantic component and content assertions**

```ts
expect(screen.getByRole('heading', { name: 'Migration Workflow' })).toBeVisible();
expect(screen.getByText('Recommended practice')).toBeVisible();
expect(screen.getByText('Tool behavior')).toBeVisible();
expect(validatedReportExample.schemaVersion).toBe(2);
```

- [ ] **Step 2: Run RED tests**

Run: `npx vitest run website/src/components/content-components.spec.tsx scripts/verify-documentation-contract.spec.ts`

- [ ] **Step 3: Author evidence-backed guides**

Cover plan/review/resolve/write/verify, clean-worktree recommendation, large-repo pilot/expansion/completion, safety proof and atomic families, parsing, class/style conflicts, transaction/recovery limits, idempotency/reruns, schema-2 reports, exit codes, CI policies, architecture, support/security, and release process.

Every command must be selected from `cliReference`; every report field comes from `reportReference`.

- [ ] **Step 4: Implement reusable semantic components**

```tsx
<DiagnosticCallout code="dynamic-binding" />
<ReportExample report={validatedReportExample} label="Example report" />
<MigrationChecklist requirements={requirements} recommendations={recommendations} />
```

Copy buttons announce success through an `aria-live="polite"` region.

- [ ] **Step 5: Validate claims and examples**

Add tests proving plan mode does not claim zero filesystem effects when `--report` is requested, rollback wording includes storage/forced-termination limits, and exit-code 2 wording matches `resolveExitCode` tests.

- [ ] **Step 6: Run GREEN gates**

Run: `npm run verify:docs && npm run test:website && npm run typecheck:website && npm run lint`

- [ ] **Step 7: Commit**

```bash
git add website/content website/src/components
git commit -m "docs: add migration safety and automation guides"
```

---

### Task 4: Compatibility, diagnostics, targets, and executable examples

**Files:**
- Modify: `website/content/targets/*.md`
- Modify: `website/content/compatibility/*.md`
- Modify: `website/content/reports/diagnostics.md`
- Modify: `website/content/reference/examples.md`
- Create: `website/src/components/compatibility-explorer.tsx`
- Create: `website/src/components/compatibility-explorer.spec.tsx`
- Create: `website/src/components/diagnostic-reference.tsx`
- Create: `website/src/components/diagnostic-reference.spec.tsx`
- Create: `test/package/documentation-examples.test.ts`

**Interfaces:**
- Consumes: `CompatibilityEntry[]`, `DiagnosticReference[]`, `VerifiedExample[]`, `previewTemplate(input)`.
- Produces: filterable compatibility explorer, searchable diagnostic reference, stable directive/diagnostic anchors, and executable public examples.

- [ ] **Step 1: Write failing filter/deep-link/example tests**

```ts
await user.selectOptions(screen.getByLabelText('Target'), 'css');
await user.selectOptions(screen.getByLabelText('Family'), 'grid');
expect(screen.getByRole('row', { name: /grid/u })).toHaveTextContent(/preserved|unsupported/u);
expect(screen.getByRole('link', { name: 'dynamic-binding' })).toHaveAttribute('href', '/docs/diagnostics#dynamic-binding');
```

- [ ] **Step 2: Run RED tests**

Run: `npx vitest run website/src/components/compatibility-explorer.spec.tsx website/src/components/diagnostic-reference.spec.tsx test/package/documentation-examples.test.ts`

- [ ] **Step 3: Implement the lightweight explorers**

Use native controls and small local state. Compatibility filters include target, family, and status. Diagnostic search filters code, message, and family. Directive details disclose supported/preserved forms, exact examples, target differences, and linked diagnostic behavior.

- [ ] **Step 4: Author target and compatibility guides from registries**

Document exact Tailwind CSS v4 behavior, arbitrary values, conflict checks, config non-mutation, native CSS eight-family boundary, owned markers, retained unmatched rules, transaction semantics, responsive images/DOM-selector risk, breakpoints, orientation/print, visibility/display restoration, grid, responsive class/style, and dynamic bindings.

- [ ] **Step 5: Execute every transformation example**

```ts
for (const example of verifiedExamples) {
  const result = previewTemplate(example.input);
  expect(result.output).toBe(example.expectedOutput);
  expect(result.results).toMatchObject(example.expectedResults);
}
```

- [ ] **Step 6: Cover every diagnostic entry**

Assert actionable meaning, unsafe-to-guess rationale, resolution, preservation behavior, and rerun guidance for all 13 conversion codes plus both parse-error codes.

- [ ] **Step 7: Run GREEN and broad parity gates**

Run: `npm run verify:docs && npx vitest run test/package/documentation-examples.test.ts test/compatibility src/browser website/src/components`

- [ ] **Step 8: Commit**

```bash
git add website/content website/src/components test/package/documentation-examples.test.ts
git commit -m "docs: add compatibility and diagnostic reference"
```

---

### Task 5: Migration-plan hero and documentation visual hardening

**Files:**
- Modify: `website/src/pages/home.tsx`
- Create: `website/src/components/migration-plan-hero.tsx`
- Create: `website/src/components/migration-plan-hero.spec.tsx`
- Create: `website/src/components/status-label.tsx`
- Create: `website/src/components/source-diff.tsx`
- Modify: `website/src/styles/tokens.css`
- Modify: `website/src/styles/global.css`
- Modify: `scripts/generate-website-assets.mjs`
- Modify: `scripts/verify-website-assets.mjs`
- Modify: `website/public/og-image.png`

**Interfaces:**
- Consumes: `previewTemplate({ source, target })`, exact fixture data, status tokens, existing playground lazy boundary.
- Produces: compact real-engine hero, accessible diff/status primitives, responsive docs/table/code styling, and deterministic plan-oriented OG image.

- [ ] **Step 1: Write failing hero and semantic-style tests**

```ts
expect(screen.getByText('Plan first. Review unresolved cases. Write only when you are ready.')).toBeVisible();
await user.click(screen.getByRole('radio', { name: 'Native CSS' }));
expect(screen.getByLabelText('Migration output')).toHaveTextContent(expectedCssFixture);
expect(screen.getByText('Example migration plan')).toBeVisible();
```

- [ ] **Step 2: Run RED tests**

Run: `npx vitest run website/src/components/migration-plan-hero.spec.tsx website/src/styles/tokens.spec.ts scripts/verify-website-assets.spec.ts`

- [ ] **Step 3: Implement the compact hero**

Keep source/output to 3–6 lines. Render Source → Analyze → Plan → Review → Write → Verify, exact converted/preserved items, and fixture-labelled mode/target/count/write status. Use the real preview API for target changes.

- [ ] **Step 4: Implement accessible diff/status primitives**

`StatusLabel` always renders icon plus visible text. `SourceDiff` uses semantic line labels and literal `+`, `-`, or preserved markers. Diagnostic codes link to reference anchors.

- [ ] **Step 5: Harden responsive documentation styling**

At 375px, stack hero regions; constrain tables/code within their own scroll containers; keep code type readable; expose active sidebar context; retain focus and reduced-motion behavior. Avoid card-wrapping every section.

- [ ] **Step 6: Generate and verify the plan-oriented OG image**

Update deterministic asset generation to show source, plan statuses, and output without Angular logos. Extend mutation tests so stale OG bytes fail.

- [ ] **Step 7: Run GREEN gates**

Run: `npm run generate:website-assets && npm run verify:website-assets && npm run test:website && npm run build:website`

- [ ] **Step 8: Commit**

```bash
git add website/src website/public/og-image.png scripts/generate-website-assets.mjs scripts/verify-website-assets.mjs
git commit -m "feat(website): foreground the review-first migration plan"
```

---

### Task 6: README, repository UX, SEO, redirects, and claim audit

**Files:**
- Modify: `README.md`
- Modify: `.github/ISSUE_TEMPLATE/bug.yml`
- Modify: `.github/ISSUE_TEMPLATE/feature.yml`
- Modify: `website/src/components/site-footer.tsx`
- Modify: `website/src/site-content.ts`
- Modify: `website/index.html`
- Modify: `website/public/site.webmanifest`
- Modify: `scripts/generate-website-route-html.mjs`
- Modify: `scripts/verify-website-static.mjs`
- Create: `docs/maintenance/2026-09-05-documentation-claim-audit.md`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: complete Task 1–5 content/routes and package metadata.
- Produces: concise aligned README, actionable issue intake, final metadata/footer/redirects, and claim-audit evidence.

- [ ] **Step 1: Write failing repository/static contract tests**

Assert README links the production docs, issue forms request version/Node/Angular/target/command/minimal source/diagnostics, footer contains Project/NIPE/Legal/License groups, and every route has exact SEO metadata.

- [ ] **Step 2: Run RED tests**

Run: `npx vitest run test/package/docs-contract.test.ts scripts/verify-website-static.spec.ts`

- [ ] **Step 3: Align README and issue templates**

Keep README to orientation, install, basic plan/write workflow, safety principle, and links. Do not copy the complete site. Issue forms warn against sensitive project code and route security reports to the private policy.

- [ ] **Step 4: Complete footer, metadata, and redirects**

Footer groups are Project, NIPE, Legal, and License. Keep the exact NIPE Open Source URL. Update titles/descriptions around review-first Angular Flex-Layout migration. Preserve all prior routes via exact content or redirects.

- [ ] **Step 5: Perform the no-slop and claim audit**

Search every website/README string for unsupported automation, stability, performance, version, compatibility, and transaction claims. Record each corrected, qualified, or retained claim with its evidence path in the maintenance audit.

- [ ] **Step 6: Prepare recommended GitHub About metadata**

Record description, production website, and relevant topics (`angular`, `angular-flex-layout`, `codemod`, `migration`, `tailwindcss`, `css`, `typescript`, `developer-tools`). Apply only during the authorized release task.

- [ ] **Step 7: Run GREEN gates**

Run: `npm run verify:docs && npm run verify:website && npm run verify && npm audit --audit-level=high && git diff --check`

- [ ] **Step 8: Commit**

```bash
git add README.md .github/ISSUE_TEMPLATE website scripts docs/maintenance vercel.json
git commit -m "docs: align repository and product-site claims"
```

---

### Task 7: Whole-site audit, beta.3 release, production deployment, and npm publication

**Files:**
- Create: `docs/maintenance/2026-09-05-documentation-reference-expansion.md`
- Create: `.changeset/documentation-reference-expansion.md`
- Modify through Changesets: `package.json`
- Modify through Changesets: `package-lock.json`
- Modify through Changesets: `CHANGELOG.md`

**Interfaces:**
- Consumes: reviewed Tasks 1–6, Vercel project/domain, GitHub protected workflows, npm trusted publisher.
- Produces: merged implementation, public production site, `2.0.0-beta.3` npm beta, unchanged latest tag, GitHub prerelease, and final twenty-part report.

- [ ] **Step 1: Audit six user perspectives**

Review the site as a small-app migrator, 2,000-template monorepo migrator, frontend lead, CI engineer, unresolved-directive debugger, and OSS contributor. Record concrete answers for workflow, compatibility, diagnostics, CI, write safety, and claim honesty.

- [ ] **Step 2: Run independent implementation/design/accessibility/security review**

Reject Critical/Important findings before release. Allow one bounded final fix wave followed by scoped re-review. Verify all deferred Minor findings are either resolved or documented.

- [ ] **Step 3: Run the exact clean release candidate gates**

Run:

```bash
npm run clean
npm run verify
npm run verify:website
npm audit --audit-level=high
git diff --check
git status --short
```

Expected: all package, docs, browser, accessibility, static, package-surface, and audit gates pass with a clean tree.

- [ ] **Step 4: Open and merge the protected implementation PR**

Wait for all required CI, CodeQL, dependency-review, package, website, and architecture checks. Merge only the reviewed SHA.

- [ ] **Step 5: Deploy the exact merged main commit to Vercel production**

Verify public HTTPS, TLS, `/`, critical docs routes, legacy routes/redirects, assets, security headers, sitemap, robots, canonical/OG metadata, and no SSO protection on `angular-flex-layout-codemod.nipesolutions.com`.

- [ ] **Step 6: Apply verified repository About metadata**

Set the audited description, production website, and approved topics. Re-read the resulting repository metadata.

- [ ] **Step 7: Create and merge the beta.3 Changeset/version PRs**

Verify package version, lockfile, changelog, homepage, exact tarball surface, and release notes. Stage through `.github/workflows/stage-release.yml` and protected `npm` environment.

- [ ] **Step 8: Verify and approve staged npm artifact**

Check package name/version, six-file manifest, SHASUM/SRI, `beta` tag, provenance, clean install, `--help`, `--version`, plan-mode fixture, and absence of secrets. npm's final staged-package approval/2FA remains a human gate.

- [ ] **Step 9: Verify publication without moving latest**

```bash
npm view @nipe-solutions/flex-layout-codemod dist-tags versions --json
npm install --save-exact @nipe-solutions/flex-layout-codemod@beta
npx flex-layout-codemod --version
```

Expected: `beta` is `2.0.0-beta.3`; `latest` remains `2.0.0-beta.1`; provenance and registry integrity match the staged artifact.

- [ ] **Step 10: Create GitHub prerelease and final report**

Create `v2.0.0-beta.3` against the exact release commit. The maintenance report must contain the requested twenty sections and an evidence-based maturity verdict.

- [ ] **Step 11: Commit any report-only repository evidence through a protected PR**

```bash
git add docs/maintenance/2026-09-05-documentation-reference-expansion.md
git commit -m "docs: record beta.3 documentation expansion evidence"
```

Do not leave local-only release facts masquerading as repository history.
