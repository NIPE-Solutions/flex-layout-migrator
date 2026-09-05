export const siteContent = {
  identity: {
    productName: 'Flex Layout Codemod',
    familyName: 'NIPE Open Source',
  },
  navigationLabel: 'Primary navigation',
  navigation: [
    { label: 'Overview', href: '#overview' },
    { label: 'Playground', href: '#playground' },
    { label: 'Documentation', href: '#documentation' },
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
    'Only the installed CLI discovers projects, writes reports, and applies multi-file changes.',
    'Unsupported or ambiguous source remains available for review instead of being guessed.',
  ],
  documentation: {
    heading: 'Use the CLI for project migrations.',
    description:
      'Review the compatibility boundary, plan before writing, and keep the generated report with your migration work.',
    link: { label: 'Read the documentation', href: '/docs' },
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
