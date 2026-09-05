---
path: /docs/installation
title: Installation and requirements
description: Install an exact beta version and establish a reviewable project baseline before migration.
group: start
order: 2
---

# Installation and requirements

## Install in the project

Install the codemod as an exact development dependency in the Angular workspace you intend to migrate. Keeping the selected version in both the package manifest and lockfile makes later plans reproducible during review.

```sh
npm install --save-dev --save-exact @nipe-solutions/flex-layout-codemod@beta
```

## Prepare the baseline

Run the repository's existing build and test commands before the first codemod plan. A clean baseline separates migration findings from failures that were already present.

Use version control or a verified backup as the durable recovery boundary. The codemod can coordinate ordinary writes, but it cannot replace repository history or protect against every storage and process failure.
