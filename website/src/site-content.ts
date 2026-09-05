export const siteContent = {
  productionUrl: 'https://angular-flex-layout-codemod.nipesolutions.com',
  identity: {
    productName: 'Flex Layout Codemod',
    familyName: 'NIPE Open Source',
  },
  navigationLabel: 'Primary navigation',
  navigation: [
    { label: 'Overview', href: '/#overview' },
    { label: 'Playground', href: '/#playground' },
    { label: 'Documentation', href: '/docs' },
  ],
  hero: {
    heading: 'Migrate Angular Flex-Layout with confidence.',
    introduction:
      'Convert supported template directives to Tailwind CSS or native CSS while preserving the source that still needs a human decision.',
  },
  installCommand: 'npm install --save-dev --save-exact @nipe-solutions/flex-layout-codemod@beta',
  links: {
    nipeOpenSource: {
      label: 'NIPE Open Source',
      href: 'https://opensource.nipesolutions.com',
    },
    github: {
      label: 'View on GitHub',
      href: 'https://github.com/NIPE-Solutions/flex-layout-migrator',
    },
    npm: {
      label: 'View on npm',
      href: 'https://www.npmjs.com/package/@nipe-solutions/flex-layout-codemod',
    },
  },
  transformation: {
    heading: 'Fragmented directives become explicit layout.',
    sourceLabel: 'Angular template input',
    source: '<div fxLayout="row" fxLayoutGap="16px" fxLayoutAlign="start center">',
    outputLabel: 'Tailwind template output',
    output: '<div class="flex flex-row box-border gap-[16px] justify-start items-center">',
  },
  supportHeading: 'A migration boundary you can inspect.',
  supportStatements: [
    {
      term: 'Source-aware',
      description:
        'Angular template parsing and source-range edits preserve unrelated text, comments, and control flow.',
    },
    {
      term: 'Two explicit targets',
      description: 'Tailwind CSS v4 is the default; supported Flex families can also emit owned native CSS.',
    },
    {
      term: 'Conservative by design',
      description: 'Dynamic, ambiguous, conflicting, or unsupported inputs remain unchanged with diagnostics.',
    },
  ],
  playground: {
    heading: 'Preview one template in your browser.',
    description: 'The interactive playground uses the same browser-safe migration boundary as the production engine.',
    privacyStatement: 'Your template never leaves this browser.',
    regionLabel: 'Migration playground preview',
  },
  limitations: [
    'The browser preview handles one template at a time.',
    'Only the installed CLI performs discovery, project validation, reporting, transactional writes, rollback, and multi-file work.',
    'Unsupported or ambiguous source remains available for review instead of being guessed.',
  ],
  documentation: {
    heading: 'Use the CLI for project migrations.',
    description:
      'Review the compatibility boundary, plan before writing, and keep the generated report with your migration work.',
    link: { label: 'Read the documentation', href: '/docs' },
  },
  documentationNavigation: [
    { label: 'Start here', href: '/docs' },
    { label: 'CLI workflow', href: '/docs/cli' },
    { label: 'Tailwind CSS', href: '/docs/tailwind' },
    { label: 'Native CSS', href: '/docs/native-css' },
    { label: 'Safety and reports', href: '/docs/safety' },
    { label: 'Troubleshooting', href: '/docs/troubleshooting' },
  ],
  documentationPages: {
    '/docs': {
      heading: 'Migration guide',
      introduction:
        'Start with a read-only plan, inspect every preserved directive, then explicitly apply the reviewed migration.',
      sections: [
        {
          heading: 'Try one template',
          paragraphs: [
            'The playground runs the real parser and migration planner for one template entirely in memory. It does not discover a project, inspect project files, or write a report.',
            'Only the installed CLI performs discovery, project validation, reporting, transactional writes, rollback, and multi-file work.',
          ],
        },
        {
          heading: 'Install the beta',
          paragraphs: [
            'Pin the beta as an exact development dependency so the package manifest and lockfile retain the reviewed version.',
          ],
          code: 'npm install --save-dev --save-exact @nipe-solutions/flex-layout-codemod@beta',
        },
        {
          heading: 'Choose a target',
          paragraphs: [
            'Tailwind CSS v4 is the default and covers the broader verified surface. Native CSS covers exactly eight Flex semantic families and writes one owned companion stylesheet when the CLI is used.',
          ],
        },
      ],
    },
    '/docs/cli': {
      heading: 'CLI workflow',
      introduction: 'The installed CLI plans by default. Writing requires an explicit flag after review.',
      sections: [
        {
          heading: 'Plan and report',
          paragraphs: [
            'Scan the selected file or folder, validate the proposed migration, and write a schema-2 JSON report without changing templates.',
          ],
          code: 'npx flex-layout-codemod ./src --report ./reports/flex-layout.json',
        },
        {
          heading: 'Apply Tailwind output',
          paragraphs: ['Add --write only after the diagnostics and Git worktree are ready for review.'],
          code: 'npx flex-layout-codemod ./src --target tailwind --write',
        },
        {
          heading: 'Apply native CSS output',
          paragraphs: [
            'Name the companion stylesheet explicitly. The CLI updates templates and that stylesheet together.',
          ],
          code: 'npx flex-layout-codemod ./src --target css --stylesheet ./src/flex-layout-migration.css --write',
        },
      ],
    },
    '/docs/tailwind': {
      heading: 'Tailwind CSS output',
      introduction:
        'The default target emits Tailwind CSS v4 utilities and self-contained arbitrary media variants only when ownership and semantics are proven.',
      sections: [
        {
          heading: 'Exact values and ranges',
          paragraphs: [
            'Template lengths use arbitrary values, so fxLayoutGap="4" keeps its 4px meaning. The 13 standard viewport aliases use the archived Angular Flex-Layout media ranges rather than project breakpoint names.',
          ],
        },
        {
          heading: 'Conservative ownership',
          paragraphs: [
            'Existing Tailwind utilities, inline styles, dynamic bindings, and overlapping responsive states are checked together. When equivalent output cannot be proven, the original directive remains with a diagnostic.',
            'The Tailwind target does not edit Tailwind configuration, CSS, Sass, or Less.',
          ],
        },
        {
          heading: 'Project-aware options',
          paragraphs: [
            'Orientation and print aliases require explicit CLI flags confirming the source Flex-Layout configuration. Responsive imgSrc migration is a separate --responsive-images opt-in because adding picture markup can affect selectors.',
          ],
        },
      ],
    },
    '/docs/native-css': {
      heading: 'Native CSS output',
      introduction:
        'The native target converts a deliberately limited Flex-only surface and generates deterministic class names plus an owned CSS block.',
      sections: [
        {
          heading: 'Supported surface',
          paragraphs: [
            'It supports exactly eight semantic families: layout, layout alignment, layout gap, flex sizing, flex alignment, fill, offset, and order. Literal base inputs and the 13 standard viewport aliases are supported.',
          ],
        },
        {
          heading: 'Preserved for review',
          paragraphs: [
            'Grid, visibility, responsive class and style inputs, orientation, print, custom aliases, and dynamic Angular bindings remain unchanged with diagnostics for this target.',
          ],
        },
        {
          heading: 'Owned stylesheet',
          paragraphs: [
            'The installed CLI preserves handwritten CSS outside its marked block, deduplicates shared rules, and retains unmatched owned rules because a scoped run cannot prove the stylesheet serves no other templates.',
          ],
        },
      ],
    },
    '/docs/safety': {
      heading: 'Safety and reporting',
      introduction:
        'Planning, validation, explicit writes, and recoverable transactions keep review ahead of mutation.',
      sections: [
        {
          heading: 'Plan before write',
          paragraphs: [
            'The default mode plans and validates without changing project templates or stylesheets. --report is the one intentional plan-mode filesystem side effect.',
          ],
        },
        {
          heading: 'One project transaction',
          paragraphs: [
            'For native CSS, template and stylesheet writes use one recoverable transaction. Ordinary failures and handled interruptions roll changed outputs back together.',
            'No filesystem workflow promises durable rollback after power loss, forced termination, or storage failure. If recovery is unconfirmed, stop and reconcile the listed paths with Git or a verified backup.',
          ],
        },
        {
          heading: 'Reports and exit policy',
          paragraphs: [
            'Schema-2 reports include mode and application state. Exit code 2 means unresolved review, unsupported, or invalid results remain under the strict default; --allow-unresolved changes only the exit code.',
          ],
        },
      ],
    },
    '/docs/troubleshooting': {
      heading: 'Troubleshooting',
      introduction: 'A preserved directive is a review boundary, not a partial or silent conversion.',
      sections: [
        {
          heading: 'The source has a parse error',
          paragraphs: [
            'Repair the Angular template first. A parse-error run reports the problem and applies no project changes, even if --write was requested.',
          ],
        },
        {
          heading: 'A directive remains unchanged',
          paragraphs: [
            'Read its diagnostic code and suggestion. Dynamic bindings, class conflicts, unsafe responsive precedence, missing display restoration, and target limitations intentionally preserve source.',
          ],
        },
        {
          heading: 'The command exits with code 2',
          paragraphs: [
            'Planning or application completed safely, but strict unresolved results remain. Review them; use --allow-unresolved only when your workflow intentionally accepts those diagnostics.',
          ],
        },
        {
          heading: 'Orientation or print stays preserved',
          paragraphs: [
            'Verify the source application configuration, then pass --orientation-breakpoints or --print-with-breakpoints with the confirmed values. These flags are assertions, not discovery.',
          ],
        },
      ],
    },
  },
  legalPages: {
    '/privacy': {
      heading: 'Privacy',
      introduction: 'The template playground is designed as a local, in-browser preview.',
      sections: [
        {
          heading: 'Playground source',
          paragraphs: [
            'Template text is held only in the current page component memory. It is not submitted to a server, persisted by the site, or included in a network request. Reloading or leaving the page clears it.',
            'Clipboard access occurs only after you select a Copy action and is subject to your browser permissions.',
          ],
        },
        {
          heading: 'Hosting',
          paragraphs: [
            'The static site host may process ordinary request metadata needed to deliver the site. Do not paste secrets into any online development tool.',
          ],
        },
      ],
    },
    '/imprint': {
      heading: 'Imprint',
      introduction: 'Project and publisher information for Flex Layout Codemod.',
      sections: [
        {
          heading: 'Publisher',
          paragraphs: [
            'Flex Layout Codemod is an open-source project by Nicholas Petrasek in the NIPE Open Source family. Package and repository details are available through the global project links.',
          ],
        },
        {
          heading: 'License and support',
          paragraphs: [
            'The software is provided under the MIT License. Use the repository issue tracker for general project support and GitHub private vulnerability reporting for security reports.',
          ],
        },
      ],
    },
  },
  footerLabel: 'Project links',
  footerLinks: [
    {
      label: 'NIPE Open Source',
      href: 'https://opensource.nipesolutions.com',
    },
    {
      label: 'Repository',
      href: 'https://github.com/NIPE-Solutions/flex-layout-migrator',
    },
    {
      label: 'Package',
      href: 'https://www.npmjs.com/package/@nipe-solutions/flex-layout-codemod',
    },
    {
      label: 'License',
      href: 'https://github.com/NIPE-Solutions/flex-layout-migrator/blob/main/LICENSE',
    },
    { label: 'Imprint', href: '/imprint' },
    { label: 'Privacy', href: '/privacy' },
  ],
} as const;
