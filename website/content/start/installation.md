---
path: /docs/installation
title: Installation and requirements
description: Install an exact beta version and establish a reviewable project baseline before migration.
group: start
order: 2
---

# Installation and requirements

## Runtime requirements

The codemod runtime requirement is Node.js 22.12 or newer, with Node 22 and Node 24 in the CI test matrix. The repository release workflow currently installs npm 11, but the package does not advertise a blanket npm, Angular, or Nx compatibility range. Verify your workspace through a plan, the application compiler, and its own test suite instead of treating framework version proximity as proof.

Install the codemod as an exact development dependency in the Angular workspace you intend to migrate. Keeping the selected version in both the package manifest and lockfile makes later plans reproducible during review.

```sh
npm install --save-dev --save-exact @nipe-solutions/flex-layout-codemod@beta
```

The installed executable is `flex-layout-codemod`. Confirm its local version and help before recording migration evidence.

```sh
npx flex-layout-codemod --version
```

## Prepare the baseline

Recommended practice is to begin from a clean, version-controlled worktree with the application's normal install, build, test, and visual-review commands available. Record pre-existing failures before migration so they are not attributed to generated changes.

Tool behavior has narrower prerequisites: the input is one HTML file or a directory scanned recursively for HTML files, and a single-file output must end in `.html`. For a directory input, discovery loads only the `.gitignore` directly inside the selected input root and applies those rules to descendants; it does not load parent or nested `.gitignore` files. A selected report, a separate output tree, and a selected stylesheet are excluded from folder discovery so invocation-owned artifacts are not treated as templates.

Tailwind CSS is the default target. Native CSS requires exactly one explicit companion stylesheet path. Optional orientation, print, and responsive-image behavior must be acknowledged through documented command options because the CLI does not discover those project decisions automatically.

Use version control or a verified backup as the durable recovery boundary. The codemod coordinates ordinary project writes, but it cannot replace repository history or protect against every storage and process failure.

## Codemod Node versus application Node

The Node version used to run the codemod does not need to be the Node version your legacy Angular project uses to build. An application can keep a Node 14 build environment while you temporarily run this source migration with Node 22, then return to the original toolchain.

The codemod parses source templates with its own Angular compiler dependency. It does not load or build the application's Angular packages, and it does not require installing the legacy application's dependencies. You can install the CLI in a separate tools directory, activate Node 22, run that CLI executable from the legacy project root, and then switch back for application tests/builds. This avoids forcing a new compiler into the legacy application's dependency tree.

Representative fixtures cover Angular 5–8, 9–12, 13–15 era syntax and modern control flow. These are syntax examples parsed with the codemod's pinned compiler, not builds of each Angular release or a blanket framework-version support claim.
