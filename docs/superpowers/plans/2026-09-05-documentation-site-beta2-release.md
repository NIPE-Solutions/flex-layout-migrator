# Documentation Site and Beta.2 Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy an interactive NIPE-family documentation site and publish `@nipe-solutions/flex-layout-codemod@2.0.0-beta.2` under the `beta` tag.

**Architecture:** A static React/Vite application in `website/` calls a browser-safe single-template preview API assembled from the existing parser, analyzer, planner, renderers, and source editor. Node filesystem, CLI, reporting, and transaction modules remain outside the browser graph. Vercel serves the static build; the existing protected release workflow remains the npm authority.

**Tech Stack:** TypeScript 6, React 19, Vite 8, Angular compiler, Vitest, Testing Library, Playwright, axe, CSS, Vercel, Changesets, npm 11.19.0.

**Spec:** `docs/superpowers/specs/2026-09-05-documentation-site-beta2-release-design.md`

## Global Constraints

- English-only launch at `https://angular-flex-layout-codemod.nipesolutions.com`.
- One pasted Angular template; no upload, persistence, analytics containing source, or server execution.
- Targets are exactly `tailwind` and `css`; CSS preview returns generated HTML and stylesheet text.
- Reuse production parsing/planning/rendering behavior and prove fixture parity.
- Preserve all existing CLI, package-surface, compatibility, transaction, and release gates.
- Link `NIPE Open Source` to `https://opensource.nipesolutions.com` in global navigation/footer.
- Publish exactly `2.0.0-beta.2` with `--tag beta`; do not move `latest`.
- Direct Vercel deployment, domain attachment, and npm publication are user-authorized after gates pass.
- Never commit credentials, Vercel state containing secrets, npm tokens, or pasted playground input.

---

### Task 1: Browser-safe migration preview boundary

**Files:**
- Create: `src/browser/template-preview.ts`
- Create: `src/browser/template-preview.spec.ts`
- Create: `test/architecture/browser-preview-boundary.test.ts`
- Modify: `src/render/render-session.ts`
- Modify: `src/migrator/stylesheet.planner.ts`

**Interfaces:**
- Produces: `previewTemplate(input: TemplatePreviewInput): TemplatePreviewResult`.
- Produces: `TemplatePreviewInput = { source: string; target: 'tailwind' | 'css'; fileName?: string }`.
- Produces: immutable result fields `html`, `css`, `results`, and `diagnostics`; CSS is `undefined` for Tailwind.
- Consumes existing `AngularTemplateParser`, `TemplateAnalyzer`, `ConversionPlanner`, `TailwindRenderSession`, `CssRenderSession`, `SourceEditor`, and stylesheet serialization behavior.

- [ ] **Step 1: Write failing behavior and parity tests**

Cover literal flex directives, responsive directives, Tailwind grid, CSS output, unsupported inputs, invalid Angular syntax, unchanged input, deterministic repeat calls, and immutability. Use literal expected HTML/CSS/diagnostic fixtures; compare representative results with the production pipeline oracle.

```ts
const result = previewTemplate({
  source: '<div fxLayout="row" fxLayoutGap="16px"></div>',
  target: 'tailwind',
});
expect(result.html).toBe('<div class="flex flex-row gap-4"></div>');
expect(result.css).toBeUndefined();
expect(result.diagnostics).toEqual([]);
```

- [ ] **Step 2: Write the browser graph architecture test**

Resolve static imports from `src/browser/template-preview.ts` and fail on `node:*`, `fs`, `path`, `process`, `src/cli`, `src/report`, `src/pipeline/discover`, `src/pipeline/apply`, or `src/transaction`.

- [ ] **Step 3: Run RED**

Run: `npx vitest run src/browser/template-preview.spec.ts test/architecture/browser-preview-boundary.test.ts`

Expected: FAIL because the browser preview module and safe graph do not exist.

- [ ] **Step 4: Implement the minimal in-memory composition**

Parse and analyze `source`, create exactly one target render session, plan edits, apply them with `SourceEditor`, finalize once, serialize referenced CSS rules for the CSS target, map parse/application failures to structured diagnostics, and deeply freeze the returned aggregate. Extract only pure shared helpers where a current module imports Node-only code.

- [ ] **Step 5: Verify GREEN and regression scope**

Run: `npx vitest run src/browser/template-preview.spec.ts test/architecture/browser-preview-boundary.test.ts src/planner/conversion-planner.spec.ts src/render`

Expected: all tests pass and the browser graph reports zero forbidden imports.

- [ ] **Step 6: Commit**

```bash
git add src/browser src/render/render-session.ts src/migrator/stylesheet.planner.ts test/architecture/browser-preview-boundary.test.ts
git commit -m "feat: add browser-safe template migration preview"
```

### Task 2: Website foundation, content model, and family identity

**Files:**
- Create: `website/index.html`
- Create: `website/src/main.tsx`
- Create: `website/src/app.tsx`
- Create: `website/src/site-content.ts`
- Create: `website/src/styles/tokens.css`
- Create: `website/src/styles/global.css`
- Create: `website/src/components/site-header.tsx`
- Create: `website/src/components/site-footer.tsx`
- Create: `website/src/components/code-block.tsx`
- Create: `website/src/app.spec.tsx`
- Create: `website/tsconfig.json`
- Create: `vite.website.config.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tsconfig.json`
- Modify: `eslint.config.js`
- Modify: `.prettierignore`

**Interfaces:**
- Consumes `previewTemplate` in Task 3, but initially renders a static playground shell.
- Produces `siteContent` as the single copy authority for navigation, install command, URLs, support statements, limitations, and footer links.

- [ ] **Step 1: Add dependencies and failing shell tests**

Add React 19, React DOM 19, Vite React plugin, Testing Library, jsdom, Playwright, and axe as development-only website tooling. Assert product heading, install command, GitHub/npm actions, and both header/footer NIPE links with exact HTTPS URL.

- [ ] **Step 2: Run RED**

Run: `npx vitest run website/src/app.spec.tsx`

Expected: FAIL because the website application is absent.

- [ ] **Step 3: Implement tokens and semantic shell**

Define ink/off-white/Angular-red/teal primitives, semantic light/dark tokens, typography, spacing, focus, reduced-motion, and responsive container rules. Implement landmarks and accessible navigation without animation libraries or a component framework.

- [ ] **Step 4: Add build scripts**

Add `dev:website`, `build:website`, `test:website`, and `typecheck:website`; keep package runtime dependencies unchanged. Configure Vite root `website`, output `website/dist`, and alias `@core` to `src`.

- [ ] **Step 5: Verify GREEN**

Run: `npm run test:website && npm run typecheck:website && npm run build:website`

Expected: shell tests pass and a static production build is emitted.

- [ ] **Step 6: Commit**

```bash
git add website vite.website.config.ts package.json package-lock.json tsconfig.json eslint.config.js .prettierignore
git commit -m "feat: establish interactive documentation site"
```

### Task 3: Playground and complete documentation experience

**Files:**
- Create: `website/src/components/playground.tsx`
- Create: `website/src/components/playground.spec.tsx`
- Create: `website/src/components/diagnostic-list.tsx`
- Create: `website/src/components/copy-button.tsx`
- Create: `website/src/content/presets.ts`
- Create: `website/src/pages/home.tsx`
- Create: `website/src/pages/docs.tsx`
- Create: `website/src/pages/legal.tsx`
- Create: `website/src/router.ts`
- Modify: `website/src/app.tsx`
- Modify: `website/src/site-content.ts`
- Modify: `website/src/styles/global.css`
- Modify: `README.md`
- Modify: `package.json`

**Interfaces:**
- Consumes `previewTemplate({ source, target })` synchronously on explicit user action.
- Produces client-side routes `/`, `/docs`, `/docs/cli`, `/docs/tailwind`, `/docs/native-css`, `/docs/safety`, `/docs/troubleshooting`, `/privacy`, and `/imprint`.

- [ ] **Step 1: Write failing interaction tests**

Test preset selection, editing, target switch, migrate, HTML/CSS tabs, diagnostics, reset, clipboard success/failure, invalid source preservation, keyboard labels, and the statement “Your template never leaves this browser.”

- [ ] **Step 2: Run RED**

Run: `npx vitest run website/src/components/playground.spec.tsx website/src/app.spec.tsx`

Expected: FAIL because the interactive components and routes do not exist.

- [ ] **Step 3: Implement playground state and accessible controls**

Keep input only in component memory, migrate only on explicit submit, preserve source on errors, expose status through `aria-live`, use actual buttons/tabs/textareas, and avoid network calls entirely.

- [ ] **Step 4: Implement documentation pages and metadata copy**

Write concise, accurate material from README and compatibility contracts. Explain that only the installed CLI performs discovery, project validation, reporting, transactional writes, rollback, and multi-file work. Update package homepage to the production domain and add `documentation`/`codemod` keywords without changing version yet.

- [ ] **Step 5: Verify GREEN and package compatibility**

Run: `npm run test:website && npx vitest run test/compatibility test/package/docs-contract.test.ts test/package/package-contract.test.ts`

Expected: website behavior and existing public/package contracts pass.

- [ ] **Step 6: Commit**

```bash
git add website README.md package.json package-lock.json
git commit -m "feat: add migration playground and product documentation"
```

### Task 4: Generated product icon and web asset system

**Files:**
- Create: `website/public/icon-source.png`
- Create: `website/public/favicon.ico`
- Create: `website/public/favicon-16x16.png`
- Create: `website/public/favicon-32x32.png`
- Create: `website/public/apple-touch-icon.png`
- Create: `website/public/icon-192.png`
- Create: `website/public/icon-512.png`
- Create: `website/public/og-image.png`
- Create: `website/public/site.webmanifest`
- Create: `website/src/components/icons.tsx`
- Create: `scripts/verify-website-assets.mjs`
- Create: `scripts/verify-website-assets.spec.ts`
- Modify: `website/index.html`
- Modify: `package.json`

**Interfaces:**
- Consumes approved “ordered transformation” geometry and palette.
- Produces exact raster dimensions 16, 32, 180, 192, 512, and 1200×630 plus a manifest and accessible SVG UI icon components.

- [ ] **Step 1: Write failing asset contract**

Read image headers and manifest/HTML metadata; assert dimensions, non-empty alpha-aware PNGs, favicon declarations, theme colors, canonical URL, social image, and maskable/any purposes.

- [ ] **Step 2: Run RED**

Run: `npx vitest run scripts/verify-website-assets.spec.ts`

Expected: FAIL listing every missing asset.

- [ ] **Step 3: Generate and curate the master icon**

Use the image-generation skill with this brief: “minimal geometric software-tool icon, three fragmented layout rails entering a central conversion node and exiting as an aligned grid, deep ink, restrained Angular red, electric teal, warm off-white, flat vector-like geometry, transparent background, no letters, no text, legible at favicon scale.” Inspect the output, crop consistently, and generate deterministic web sizes from the approved master.

- [ ] **Step 4: Implement metadata and UI icon set**

Add manifest, favicon, Apple, and social metadata. Implement only copy, reset, GitHub, npm, theme, arrow, check, and warning SVG symbols with `currentColor`, decorative hiding, and named labels at interactive call sites.

- [ ] **Step 5: Verify GREEN and visual legibility**

Run: `npx vitest run scripts/verify-website-assets.spec.ts && npm run build:website`

Render the 16px, 32px, 180px, and 1200×630 assets and inspect them for clipping, muddy contrast, unintended text, and inconsistent geometry.

- [ ] **Step 6: Commit**

```bash
git add website/public website/src/components/icons.tsx website/index.html scripts/verify-website-assets.mjs scripts/verify-website-assets.spec.ts package.json
git commit -m "feat: add codemod website identity and icon set"
```

### Task 5: Browser, accessibility, static-output, and Vercel gates

**Files:**
- Create: `playwright.website.config.ts`
- Create: `e2e/website.spec.ts`
- Create: `scripts/verify-website-static.mjs`
- Create: `scripts/verify-website-static.spec.ts`
- Create: `vercel.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `test/package/ci-contract.test.ts`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Produces `npm run verify:website`, the complete website gate.
- Produces Vercel output contract `website/dist` with SPA rewrites that do not shadow real assets.

- [ ] **Step 1: Write failing browser/static/workflow tests**

Assert desktop/mobile navigation, focus order, no critical axe violations, target conversion, CSS panel, reduced-motion behavior, canonical metadata, deep-link fallback, no source-bearing network requests, six required static routes, and CI execution of `verify:website`.

- [ ] **Step 2: Run RED**

Run: `npx vitest run scripts/verify-website-static.spec.ts test/package/ci-contract.test.ts && npx playwright test --config playwright.website.config.ts`

Expected: FAIL because gates and deployment configuration are missing.

- [ ] **Step 3: Implement deployment and verification configuration**

Configure Vercel with `npm ci`, `npm run build:website`, `website/dist`, immutable hashed assets, security headers, and SPA rewrites. Add CI website job with pinned actions and Node/npm versions. Make `verify:website` run unit, type, asset, build, static, and Playwright checks.

- [ ] **Step 4: Verify GREEN**

Run: `npm run verify:website && npx vitest run test/package/ci-contract.test.ts`

Expected: all website and workflow contracts pass.

- [ ] **Step 5: Run the complete repository gate**

Run: `npm run clean && npm run verify && npm audit --audit-level=high && git diff --check`

Expected: zero failures, zero high-severity audit findings, and no whitespace errors.

- [ ] **Step 6: Commit**

```bash
git add playwright.website.config.ts e2e scripts/verify-website-static.mjs scripts/verify-website-static.spec.ts vercel.json .github/workflows/ci.yml test/package/ci-contract.test.ts package.json package-lock.json .gitignore
git commit -m "ci: verify and deploy documentation website"
```

### Task 6: Review, deploy Vercel, attach domain, and verify production

**Files:**
- Modify only if deployment reveals a regression: files owned by Tasks 2–5 with a failing regression test first.

**Interfaces:**
- Consumes clean Task 5 branch and Vercel account access.
- Produces a production deployment assigned to `angular-flex-layout-codemod.nipesolutions.com`.

- [ ] **Step 1: Request independent code and design review**

Review spec compliance, browser boundary, privacy, accessibility, responsive screenshots, copy accuracy, family resemblance, distinct identity, dependency impact, and deployment configuration. Fix every Critical/Important finding regression-first.

- [ ] **Step 2: Re-run final predeployment gates**

Run: `npm run clean && npm run verify && npm run verify:website && npm audit --audit-level=high && git status --short`

Expected: every command passes and tracked state is clean.

- [ ] **Step 3: Link and deploy**

Authenticate with the Vercel CLI, link/create the project in the NIPE Solutions scope without committing secrets, then run `vercel deploy --prod`. Record the immutable deployment URL and inspect build logs.

- [ ] **Step 4: Attach the domain**

Resolve the linked project name with `vercel project inspect`, then run `vercel domains add angular-flex-layout-codemod.nipesolutions.com flex-layout-migrator` or the current project-domain equivalent. If Vercel reports external DNS, apply the exact CNAME through the available authorized DNS provider; otherwise report that single external blocker with the exact record.

- [ ] **Step 5: Verify production**

Check HTTPS, canonical URL, headers, favicon/social assets, direct deep links, mobile/desktop layout, keyboard use, both playground targets, diagnostics, copy action, npm/GitHub links, and both NIPE Open Source links. Confirm network inspection contains no editor source.

- [ ] **Step 6: Commit any regression-tested deployment correction and push**

```bash
git add website vercel.json package.json package-lock.json e2e scripts test
git commit -m "fix: harden production documentation deployment"
git push
```

### Task 7: Version, publish beta.2, and close release evidence

**Files:**
- Create: `.changeset/bright-layouts-preview.md`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `CHANGELOG.md`
- Modify: `docs/architecture/release-process.md` only if registry reality differs from the documented post-bootstrap path.

**Interfaces:**
- Consumes the reviewed/deployed website commit on protected `main` and the repository release scripts.
- Produces immutable npm version `2.0.0-beta.2`, `beta -> 2.0.0-beta.2`, and no intentional `latest` mutation.

- [ ] **Step 1: Add the beta Changeset and test version intent**

Create a prerelease Changeset for the site/homepage/playground boundary. Run `npm run release:version` in a disposable verification branch or clean worktree and assert manifest/lock/changelog become exactly `2.0.0-beta.2`.

- [ ] **Step 2: Review and merge version changes through the protected path**

Push the implementation branch, open a PR against `main`, wait for all required checks, merge only after green, then allow or dispatch the Changesets release PR and merge it after its own green checks.

- [ ] **Step 3: Verify the exact main release tree**

From a clean `main` checkout run:

```bash
npm ci
npm run clean && npm run verify
npm run verify:website
npm audit --audit-level=high
npm view @nipe-solutions/flex-layout-codemod@2.0.0-beta.2 version
```

Expected: all local gates pass and the registry lookup reports not found before publication.

- [ ] **Step 4: Create and retain the exact artifact**

Create a task-specific temporary output path with `release_output=$(mktemp)` and run `npm run release:prepare -- --github-output "$release_output"`, or dispatch the protected staging workflow. Record filename, SHA-512 SRI, six-file manifest, version, commit, and homepage. Smoke-install that exact tarball and run help/version plus Tailwind/CSS plan/write fixtures.

- [ ] **Step 5: Publish under beta**

Use the protected staged workflow and approve its exact retained artifact, or—only if registry configuration still requires the documented authorized direct path—read the verified filename from `release-artifact.json` into `release_tarball` and run `npm publish "$release_tarball" --access public --tag beta`. Complete interactive authentication/2FA when prompted. Never publish rebuilt bytes.

- [ ] **Step 6: Verify registry and tag state**

Run registry queries for version metadata, SRI, file count, unpacked size, homepage, repository, Node engine, `beta`, and `latest`; clean-install from `@beta`; execute help/version and both targets. Assert `beta` is `2.0.0-beta.2` and `latest` was not changed by this release.

- [ ] **Step 7: Final production release check**

Re-run the live website smoke against the npm link/version, verify Vercel production points at the intended commit, ensure Git status is clean, and report the PR, deployment URL, custom domain, npm URL/version, integrity, tags, and any remaining stable-release work.
